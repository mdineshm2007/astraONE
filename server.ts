import express from "express";
import cors from "cors";
// Replaced vite middleware import 
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import dotenv from "dotenv";
import admin from "firebase-admin";
import { createFolder, uploadFile, getOrCreateFolder, createOAuth2Client } from "./src/services/driveService";

dotenv.config();//dfjhjhgdf

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
if (!admin.apps.length) {
  try {
    const serviceAccountPath = path.join(process.cwd(), "firebase-admin-sdk.json");
    if (fs.existsSync(serviceAccountPath)) {
      const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
      
      // Fix potential newline issues in private key
      if (serviceAccount.private_key) {
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
      }

      console.log(`[Firebase] Initializing for project: ${serviceAccount.project_id}`);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: process.env.FIREBASE_DATABASE_URL
      });
      console.log("[Firebase] Admin SDK Initialized Successfully");
    } else {
      console.warn("[Firebase] Admin SDK file not found. Falling back to REST/Default credentials.");
    }
  } catch (err: any) {
    console.error("[Firebase] Initialization Failed:", err.message);
    // Fallback: If service account fails, some operations might still work if DATABASE_URL is correct
    // and the environment has default credentials, but usually this is fatal.
  }
}

import Groq from "groq-sdk";
import multer from "multer";
import os from "os";

let groq: Groq | null = null;
try {
  if (process.env.GROQ_API_KEY) {
    groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    console.log("[Groq] SDK Initialized");
  } else {
    console.warn("[Groq] API Key missing. AI features will be disabled.");
  }
} catch (e: any) {
  console.error("[Groq] Initialization failed:", e.message);
}
const upload = multer({ dest: os.tmpdir() });

const app = express();
const PORT = 3001;

app.use(express.json());
app.use(cors());

app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
  next();
});

// Global Error Handler to prevent HTML error pages on Vercel
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("[Global Error]", err);
  res.status(500).json({ 
    error: "Internal Server Error", 
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Firebase REST Helper (Fallback if Admin SDK fails)
const firebaseRest = {
  get: async (path: string) => {
    try {
      const baseUrl = process.env.FIREBASE_DATABASE_URL;
      if (!baseUrl) throw new Error("FIREBASE_DATABASE_URL missing");
      const cleanUrl = baseUrl.replace(/\/$/, "");
      const cleanPath = path.startsWith("/") ? path : `/${path}`;
      const url = `${cleanUrl}${cleanPath}.json?auth=${process.env.FIREBASE_DATABASE_SECRET || ""}`;
      const res = await fetch(url);
      if (!res.ok) {
        const errText = await res.text();
        console.error(`[Firebase REST] GET ${path} failed (${res.status}):`, errText);
        return null;
      }
      return res.json();
    } catch (e) {
      console.error(`[Firebase REST] GET ${path} error:`, e);
      return null;
    }
  },
  update: async (path: string, data: any) => {
    try {
      const cleanUrl = (process.env.FIREBASE_DATABASE_URL || "").replace(/\/$/, "");
      const cleanPath = path.startsWith("/") ? path : `/${path}`;
      const url = `${cleanUrl}${cleanPath}.json?auth=${process.env.FIREBASE_DATABASE_SECRET}`;
      const res = await fetch(url, {
        method: 'PATCH',
        body: JSON.stringify(data)
      });
      if (!res.ok) {
        const errText = await res.text();
        console.error(`[Firebase REST] UPDATE ${path} failed (${res.status}):`, errText);
        return null;
      }
      return res.json();
    } catch (e) {
      console.error(`[Firebase REST] UPDATE ${path} error:`, e);
      return null;
    }
  },
  remove: async (path: string) => {
    try {
      const cleanUrl = (process.env.FIREBASE_DATABASE_URL || "").replace(/\/$/, "");
      const cleanPath = path.startsWith("/") ? path : `/${path}`;
      const url = `${cleanUrl}${cleanPath}.json?auth=${process.env.FIREBASE_DATABASE_SECRET}`;
      const res = await fetch(url, { method: 'DELETE' });
      if (!res.ok) {
        const errText = await res.text();
        console.error(`[Firebase REST] REMOVE ${path} failed (${res.status}):`, errText);
      }
    } catch (e) {
      console.error(`[Firebase REST] REMOVE ${path} error:`, e);
    }
  }
};

app.get("/api/test", (req, res) => res.json({ ok: true }));

  const getBaseUrl = (req: express.Request) => {
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    return `${protocol}://${req.headers.host}`;
  };

  const getAuthForUser = async (uid: string, req?: express.Request) => {
    // Try REST first as it is more reliable given current credential issues
    try {
      const masterTokens = await firebaseRest.get('drive_config/tokens');
      let tokens = masterTokens;

      if (!tokens && uid) {
        tokens = await firebaseRest.get(`users/${uid}/drive_tokens`);
      }

      if (!tokens) throw new Error("Google Drive not connected. Contact administrator.");

      const redirectUri = req ? `${getBaseUrl(req)}/api/auth/google/callback` : undefined;
      const oauth2Client = createOAuth2Client(redirectUri);
      oauth2Client.setCredentials(tokens);

      // Auto-refresh if needed
      if (tokens.expiry_date && tokens.expiry_date <= Date.now()) {
        try {
          const { credentials } = await oauth2Client.refreshAccessToken();
          const updateData = { ...tokens, ...credentials };
          await firebaseRest.update('drive_config/tokens', updateData);
          if (uid) await firebaseRest.update(`users/${uid}/drive_tokens`, updateData);
          oauth2Client.setCredentials(updateData);
        } catch (e) {
          console.error("Token refresh failed:", e);
          throw new Error("Google Drive session expired.");
        }
      }
      return oauth2Client;
    } catch (error: any) {
      // Fallback to Admin SDK if REST fails
      const rtdb = admin.database();
      const masterSnapshot = await rtdb.ref('drive_config/tokens').once("value");
      let tokens = masterSnapshot.exists() ? masterSnapshot.val() : null;
      if (!tokens && uid) {
        const userSnapshot = await rtdb.ref(`users/${uid}/drive_tokens`).once("value");
        if (userSnapshot.exists()) tokens = userSnapshot.val();
      }
      if (!tokens) throw new Error(error.message);
      const redirectUri = req ? `${getBaseUrl(req)}/api/auth/google/callback` : undefined;
      const oauth2Client = createOAuth2Client(redirectUri);
      oauth2Client.setCredentials(tokens);
      return oauth2Client;
    }
  };

  // Google OAuth Endpoints
  app.get("/api/auth/google/url", (req, res) => {
    const { uid } = req.query;
    const oauth2Client = createOAuth2Client(`${getBaseUrl(req)}/api/auth/google/callback`);
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      state: uid as string,
      scope: [
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/drive.file'
      ]
    });
    res.json({ url });
  });

  app.post("/api/auth/google/callback", async (req, res) => {
    try {
      const { code, uid } = req.body;
      const oauth2Client = createOAuth2Client(`${getBaseUrl(req)}/api/auth/google/callback`);
      const { tokens } = await oauth2Client.getToken(code);
      await admin.database().ref(`users/${uid}/drive_tokens`).set(tokens);
      res.json({ success: true });
    } catch (error: any) {
      console.error("OAuth Callback Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET version for direct browser redirect
  app.get("/api/auth/google/callback", async (req, res) => {
    try {
      const baseUrl = getBaseUrl(req);

      if (!code || !state) return res.redirect(`${baseUrl}/?error=missing_params`);

      const oauth2Client = createOAuth2Client(`${baseUrl}/api/auth/google/callback`);
      const { tokens } = await oauth2Client.getToken(code as string);
      // Also save as Master Tokens for the team
      await admin.database().ref('drive_config/tokens').set(tokens);
      await admin.database().ref(`users/${state}/drive_tokens`).set(tokens);

      res.redirect(`${baseUrl}/workspace?auth=success`);
    } catch (error: any) {
      console.error("OAuth Redirect Error:", error);
      const protocol = req.headers['x-forwarded-proto'] || 'http';
      const host = req.headers.host;
      res.redirect(`${protocol}://${host}/?error=auth_failed`);
    }
  });

  app.post("/api/auth/google/disconnect", async (req, res) => {
    try {
      const { uid } = req.body;
      console.log(`Disconnect request for UID: ${uid}`);
      if (!uid) return res.status(400).json({ error: "UID required" });
      await admin.database().ref(`users/${uid}/drive_tokens`).remove();
      console.log(`Successfully disconnected UID: ${uid}`);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Disconnect Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // User Approval Endpoints
  app.post("/api/users/approve", async (req, res) => {
    try {
      const { uid, teamId } = req.body;
      if (!uid || !teamId) return res.status(400).json({ error: "UID and TeamID required" });
      
      console.log(`[Approval] Attempting to approve user ${uid} for team ${teamId}`);
      
      const profile = await firebaseRest.get(`users/${uid}`);
      if (profile) {
        console.log(`[Approval] Found profile for ${uid}, current teams:`, profile.teams);
        const teams = profile.teams || [];
        const updatedTeams = teams.map((t: any) => 
          t.teamId === teamId ? { ...t, status: 'APPROVED' } : t
        );
        const approvedTeams = updatedTeams.filter((t: any) => t.status === 'APPROVED').map((t: any) => t.teamId);
        
        console.log(`[Approval] Updating user ${uid} with approved team: ${teamId}`);
        const result = await firebaseRest.update(`users/${uid}`, { teams: updatedTeams, approvedTeams });
        
        if (result) {
          res.json({ success: true });
        } else {
          res.status(500).json({ error: "Database update failed" });
        }
      } else {
        console.error(`[Approval] User ${uid} not found in database path users/${uid}`);
        res.status(404).json({ error: "User not found in database" });
      }
    } catch (error: any) {
      console.error("Approval Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/users/reject", async (req, res) => {
    try {
      const { uid, teamId } = req.body;
      const profile = await firebaseRest.get(`users/${uid}`);
      if (profile) {
        const teams = (profile.teams || []).filter((t: any) => t.teamId !== teamId);
        const approvedTeams = teams.filter((t: any) => t.status === 'APPROVED').map((t: any) => t.teamId);
        await firebaseRest.update(`users/${uid}`, { teams, approvedTeams });
        res.json({ success: true });
      } else {
        res.status(404).json({ error: "User not found" });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // AI Assistant - Primary Assistant (Llama 3.1 8B)
  app.post("/api/chat", async (req, res) => {
    try {
      const { messages } = req.body;
      if (!groq) throw new Error("AI Assistant offline (Missing API Key)");
      const completion = await groq.chat.completions.create({
        messages,
        model: "llama-3.1-8b-instant",
      });
      res.json({ message: completion.choices[0]?.message?.content });
    } catch (error) {
      console.error("Chat API Error:", error);
      res.status(500).json({ error: "Failed to communicate with AI" });
    }
  });

  // Automated Intelligence Analysis (Llama 3.3 70B)
  app.post("/api/analyze", async (req, res) => {
    try {
      const { type, data, context, uid } = req.body;
      console.log(`Unified AI Analyzing ${type} for user ${uid}`);

      let userContext = "";
      if (uid) {
        try {
          const snapshot = await admin.database().ref(`logs/${uid}`).limitToLast(5).once("value");
          if (snapshot.exists()) {
            userContext = "\nUser Context: " + Object.values(snapshot.val()).map((l: any) => l.action).join(", ");
          }
        } catch (e) { }
      }

      let systemPrompt = "You are ASTRA AI, the core engineering brain of the Solar Car mission. Analyze the data provided and give a sharp, 1-sentence technical directive. Focus on prediction and efficiency.";

      if (type === 'TASK_PROGRESS') {
        systemPrompt = "You are ASTRA AI, the project intelligence lead. Analyze the task telemetry and progress updates provided. Follow the specific instructions in the context. Provide a concise, professional summary (max 4 sentences) of the tasks, their progress, and potential bottlenecks. Use engineering terminology.";
      }

      const userPrompt = `Telemetery (${type}): ${JSON.stringify(data)}. Context: ${context || 'Mission Control'}.${userContext}`;

      if (!groq) throw new Error("ASTRA Brain Offline (Missing API Key)");
      const completion = await groq.chat.completions.create({
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
        model: "llama-3.1-8b-instant",
        temperature: 0.7,
        max_tokens: 200 // Increased for summary
      });

      res.json({ analysis: completion.choices[0]?.message?.content });
    } catch (error) {
      console.error("Unified AI Error:", error);
      res.status(500).json({ error: "ASTRA Brain Offline" });
    }
  });

  // Team-Specific Intelligence Analysis (Structured JSON)
  app.post("/api/ai/team-analysis", async (req, res) => {
    try {
      const { tasks = [], members = [], progress = [], delays = [], subsystem = "General" } = req.body;

      console.log(`AI Request: Analyzing team performance for ${subsystem}`);

      const systemPrompt = `You are an AI Project Manager for a solar car team.
Analyze the provided telemetry and return a strategic assessment.
Return STRICT JSON format:
{
  "priority_tasks": ["task 1", "task 2"],
  "at_risk_tasks": ["task 3"],
  "blocked_members": ["member name"],
  "team_efficiency": "Percentage or descriptive string",
  "recommendations": ["rec 1", "rec 2"]
}`;

      const userPrompt = `
Analyze:
Subsystem: ${subsystem}
Tasks: ${JSON.stringify(tasks)}
Members: ${JSON.stringify(members)}
Progress: ${JSON.stringify(progress)}
Delays: ${JSON.stringify(delays)}
`;

      if (!groq) throw new Error("AI PM Offline (Missing API Key)");
      const completion = await groq.chat.completions.create({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        model: "llama-3.3-70b-versatile", // High-performance model for complex analysis
        temperature: 0.3, // Lower temperature for more consistent JSON
        response_format: { type: "json_object" }
      });

      const responseContent = completion.choices[0]?.message?.content;
      console.log("AI Response:", responseContent);

      const analysis = JSON.parse(responseContent || "{}");
      res.json(analysis);
    } catch (error) {
      console.error("Team Analysis API Error:", error);
      res.status(500).json({ error: "AI temporarily unavailable" });
    }
  });

  app.post("/api/ai/cost-analysis", async (req, res) => {
    try {
      const { finances, teamId, currency } = req.body;

      // Build a compact BOM summary from finances data
      const teams = finances?.teams || {};
      const bom = finances?.bom || {};

      // Collect all BOM rows into a simple list
      const allParts: string[] = [];
      for (const [team, rows] of Object.entries(bom)) {
        if (rows && typeof rows === 'object') {
          for (const row of Object.values(rows as any)) {
            if ((row as any).partName) {
              allParts.push(`${(row as any).partName} - ${team} - ₹${(row as any).totalMaterialCost || 0}`);
            }
          }
        }
      }

      const systemPrompt = `You are the ASTRA Financial Intelligence.
Return EXACTLY ONE short bullet point per part in this format:
• Part Name - Team - ₹Cost
Then end with one line: "Total: ₹X"
DO NOT write anything else. NO introductory text. NO explanation.`;

      const userPrompt = `Currency: ${currency || 'INR (₹)'}
Team Totals: ${JSON.stringify(teams)}
Parts: ${allParts.length > 0 ? allParts.join(', ') : 'No parts entered yet'}
${teamId ? `Focus Team: ${teamId}` : 'All teams'}`;

      if (!groq) throw new Error("Financial AI Offline (Missing API Key)");
      const completion = await groq.chat.completions.create({
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
        model: "llama-3.1-8b-instant",
        temperature: 0.3,
        max_tokens: 200
      });

      res.json({ analysis: completion.choices[0]?.message?.content });
    } catch (error) {
      res.status(500).json({ error: "Financial AI offline" });
    }
  });



  // Deep engineering logic - legacy endpoint redirecting to analyze if needed
  app.post("/api/summarize", async (req, res) => {
    try {
      const { notes } = req.body;
      if (!groq) throw new Error("AI Synthesis Offline (Missing API Key)");
      const completion = await groq.chat.completions.create({
        messages: [
          { role: "system", content: "You are the ASTRA Project Intelligence. Technical synthesis specialist." },
          { role: "user", content: `Summarize notes: ${JSON.stringify(notes)}` }
        ],
        model: "llama-3.1-8b-instant",
      });
      res.json({ summary: completion.choices[0]?.message?.content });
    } catch (error: any) {
      res.status(500).json({ error: "AI Synthesis failed: " + error.message });
    }
  });


  app.post("/api/auth/google/disconnect", async (req, res) => {
    try {
      const { uid } = req.body;
      if (!uid) return res.status(400).json({ error: "UID required" });
      await admin.database().ref(`users/${uid}/drive_tokens`).remove();
      await admin.database().ref('drive_config/tokens').remove();
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/drive/setup", async (req, res) => {
    try {
      const { uid } = req.body;
      const auth = await getAuthForUser(uid, req);
      console.log(`[Drive] Setting up workspace for UID: ${uid}`);
      
      const root = await getOrCreateFolder(auth, "ASTRA_SOLAR_CAR_2026");
      const pRoot = await getOrCreateFolder(auth, "PROGRESS_TRACKING", root.id);
      const bRoot = await getOrCreateFolder(auth, "BILLING_AND_FINANCE", root.id);

      const teams = ["Steering", "Suspension", "Brakes", "Transmission", "Design", "Electricals", "Innovation", "Autonomous", "Cost", "PRO", "Media-Sponsorship"];
      const bTeams = [...teams, "Seat", "Others", "Safety_Equipments", "Dashboard", "Wheel_Tyre", "Frame", "Drive_Train"];

      const map: any = { progress: {}, bills: {} };
      
      console.log("[Drive] Parallelizing 28 folder creations...");
      
      // Parallelize progress folders
      await Promise.all(teams.map(async (t) => {
        map.progress[t] = await getOrCreateFolder(auth, `${t}_Progress`, pRoot.id);
      }));

      // Parallelize billing folders
      await Promise.all(bTeams.map(async (t) => {
        map.bills[t] = await getOrCreateFolder(auth, `${t}_Bills`, bRoot.id);
      }));

      await firebaseRest.update('drive_folders', map);
      await firebaseRest.update('drive_config/root', root);
      
      console.log("[Drive] Workspace setup complete");
      res.json({ success: true });
    } catch (error: any) {
      console.error("[Drive] Setup Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/drive/upload", upload.single("file"), async (req, res) => {
    try {
      const { teamId, category, amount, uid } = req.body;
      const auth = await getAuthForUser(uid, req);
      
      const folderData = await firebaseRest.get(`drive_folders/${category}/${teamId}`);
      if (!folderData || !folderData.id) throw new Error("Team folder not initialized. Please click Sync Drive.");

      const fileStream = fs.createReadStream(req.file!.path);
      const date = new Date().toISOString().split('T')[0];
      const name = category === 'bills' ? `${date}_${teamId}_${amount || '0'}.pdf` : req.file!.originalname;

      const result = await uploadFile(auth, name, req.file!.mimetype, fileStream, folderData.id);

      if (category === 'bills' && amount) {
        const amt = parseFloat(amount);
        const currentTeams = await firebaseRest.get(`finances/teams/${teamId}`) || 0;
        const currentOverall = await firebaseRest.get('finances/overall') || 0;
        
        await firebaseRest.update(`finances/teams`, { [teamId]: currentTeams + amt });
        await firebaseRest.update('finances', { overall: currentOverall + amt });
        
        const logData = { teamId, amount: amt, timestamp: new Date().toISOString(), fileName: name, fileLink: result.webViewLink };
        const pushUrl = `${process.env.FIREBASE_DATABASE_URL}finance_logs.json?auth=${process.env.FIREBASE_DATABASE_SECRET}`;
        await fetch(pushUrl, { method: 'POST', body: JSON.stringify(logData) });
      }
      fs.unlinkSync(req.file!.path);
      res.json({ success: true, link: result.webViewLink });
    } catch (error: any) {
      console.error("[Drive] Upload Error:", error);
      if (req.file) fs.unlinkSync(req.file.path);
      res.status(500).json({ error: error.message });
    }
  });

  // In development, Vite runs independently on port 3000
  // In production, serve dist folder
  if (process.env.NODE_ENV === "production") {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Data Retention Sweep (60 days)
  async function performDataSweep() {
    console.log("Starting 60-day data retention sweep...");
    const rtdb = admin.database();
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const cutoff = sixtyDaysAgo.toISOString();

    const collections = ['tasks', 'posts', 'queries', 'logs', 'task_updates'];

    for (const col of collections) {
      const ref = rtdb.ref(col);
      const snapshot = await ref.once("value");
      if (snapshot.exists()) {
        const data = snapshot.val();
        const toArchive: any = {};
        let count = 0;

        for (const [id, val] of Object.entries(data)) {
          const timestamp = (val as any).createdAt || (val as any).timestamp;
          if (timestamp && timestamp < cutoff) {
            toArchive[id] = val;
            count++;
          }
        }

        if (count > 0) {
          console.log(`Archiving ${count} items from ${col}`);
          // Backup to archive node
          await rtdb.ref(`archives/${col}`).update(toArchive);
          // Delete from live
          for (const id of Object.keys(toArchive)) {
            await rtdb.ref(`${col}/${id}`).remove();
          }
        }
      }
    }
    console.log("Retention sweep complete.");
  }

  app.post("/api/system/sweep", async (req, res) => {
    try {
      await performDataSweep();
      res.json({ success: true, message: "Retention sweep triggered." });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Run on startup
  // performDataSweep().catch(console.error);

  // Only listen locally, Vercel uses the exported app
  if (process.env.NODE_ENV !== "production") {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }

export default app;
