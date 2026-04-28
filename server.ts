import express from "express";
import cors from "cors";
// Replaced vite middleware import 
import path from "path";
import { fileURLToPath } from "url";
import Groq from "groq-sdk";
import multer from "multer";
import fs from "fs";
import dotenv from "dotenv";
import admin from "firebase-admin";
import { createFolder, uploadFile, getOrCreateFolder, createOAuth2Client } from "./src/services/driveService";

dotenv.config();

// Initialize Firebase Admin
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(fs.readFileSync("./firebase-admin-sdk.json", "utf8"));
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL
  });
  console.log("Firebase Admin Initialized");
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const upload = multer({ dest: "uploads/" });

async function startServer() {
  const app = express();
  const PORT = 3001;

  app.use(express.json());
  app.use(cors());

  app.get("/api/test", (req, res) => res.json({ ok: true }));

  const getAuthForUser = async (uid: string) => {
    const rtdb = admin.database();
    
    // 1. Try to get Master Tokens first (Centralized Mode)
    const masterSnapshot = await rtdb.ref('drive_config/tokens').once("value");
    let tokens = masterSnapshot.exists() ? masterSnapshot.val() : null;
    
    // 2. Fallback to User-specific tokens if no Master token exists
    if (!tokens && uid) {
      const userSnapshot = await rtdb.ref(`users/${uid}/drive_tokens`).once("value");
      if (userSnapshot.exists()) tokens = userSnapshot.val();
    }
    
    if (!tokens) throw new Error("Google Drive not connected by Captain. Please contact your administrator.");
    
    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials(tokens);
    
    // Auto-refresh if needed
    if (tokens.expiry_date && tokens.expiry_date <= Date.now()) {
      try {
        const { credentials } = await oauth2Client.refreshAccessToken();
        const updateData = { ...tokens, ...credentials };
        
        // Update both locations
        if (masterSnapshot.exists()) await rtdb.ref('drive_config/tokens').update(updateData);
        if (uid) await rtdb.ref(`users/${uid}/drive_tokens`).update(updateData);
        
        oauth2Client.setCredentials(updateData);
      } catch (e) {
        console.error("Token refresh failed:", e);
        throw new Error("Google Drive session expired. Captain must reconnect.");
      }
    }
    
    return oauth2Client;
  };

  // Google OAuth Endpoints
  app.get("/api/auth/google/url", (req, res) => {
    const { uid } = req.query;
    const oauth2Client = createOAuth2Client();
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
      const oauth2Client = createOAuth2Client();
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
      const { code, state } = req.query; // state contains the uid
      if (!code || !state) return res.redirect("http://localhost:3000/?error=missing_params");
      
      const oauth2Client = createOAuth2Client();
      const { tokens } = await oauth2Client.getToken(code as string);
      // Also save as Master Tokens for the team
      await admin.database().ref('drive_config/tokens').set(tokens);
      await admin.database().ref(`users/${state}/drive_tokens`).set(tokens);
      
      res.redirect("http://localhost:3000/workspace?auth=success");
    } catch (error: any) {
      console.error("OAuth Redirect Error:", error);
      res.redirect("http://localhost:3000/?error=auth_failed");
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

  // AI Assistant - Primary Assistant (Llama 3.1 8B)
  app.post("/api/chat", async (req, res) => {
    try {
      const { messages } = req.body;
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
        } catch (e) {}
      }

      let systemPrompt = "You are ASTRA AI, the core engineering brain of the Solar Car mission. Analyze the data provided and give a sharp, 1-sentence technical directive. Focus on prediction and efficiency.";
      
      if (type === 'TASK_PROGRESS') {
        systemPrompt = "You are ASTRA AI, the project intelligence lead. Analyze the task telemetry and progress updates provided. Follow the specific instructions in the context. Provide a concise, professional summary (max 4 sentences) of the tasks, their progress, and potential bottlenecks. Use engineering terminology.";
      }

      const userPrompt = `Telemetery (${type}): ${JSON.stringify(data)}. Context: ${context || 'Mission Control'}.${userContext}`;

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
      const auth = await getAuthForUser(uid);
      const root = await getOrCreateFolder(auth, "ASTRA_SOLAR_CAR_2026");
      
      const pRoot = await getOrCreateFolder(auth, "PROGRESS_TRACKING", root.id);
      const bRoot = await getOrCreateFolder(auth, "BILLING_AND_FINANCE", root.id);
      
      const teams = ["Steering", "Suspension", "Brakes", "Transmission", "Design", "Electricals", "Innovation", "Autonomous", "Cost", "PRO"];
      const bTeams = [...teams, "Seat", "Others", "Safety_Equipments", "Dashboard", "Wheel_Tyre", "Frame", "Drive_Train"];
      
      const map: any = { progress: {}, bills: {} };
      for(const t of teams) map.progress[t] = await getOrCreateFolder(auth, `${t}_Progress`, pRoot.id);
      for(const t of bTeams) map.bills[t] = await getOrCreateFolder(auth, `${t}_Bills`, bRoot.id);
      
      await admin.database().ref('drive_folders').set(map);
      await admin.database().ref('drive_config/root').set(root);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/drive/upload", upload.single("file"), async (req, res) => {
    try {
      const { teamId, category, amount, uid } = req.body;
      const auth = await getAuthForUser(uid);
      const rtdb = admin.database();
      const folderRef = await rtdb.ref(`drive_folders/${category}/${teamId}`).once("value");
      if (!folderRef.exists()) throw new Error("Team folder not initialized");

      const fileStream = fs.createReadStream(req.file!.path);
      const date = new Date().toISOString().split('T')[0];
      const name = category === 'bills' ? `${date}_${teamId}_${amount || '0'}.pdf` : req.file!.originalname;
      
      const result = await uploadFile(auth, name, req.file!.mimetype, fileStream, folderRef.val().id);
      
      if (category === 'bills' && amount) {
        const amt = parseFloat(amount);
        await rtdb.ref('finances/teams').child(teamId).transaction(c => (c || 0) + amt);
        await rtdb.ref('finances/overall').transaction(c => (c || 0) + amt);
        await rtdb.ref('finance_logs').push({ teamId, amount: amt, timestamp: new Date().toISOString(), fileName: name, fileLink: result.webViewLink });
      }
      fs.unlinkSync(req.file!.path);
      res.json({ success: true, link: result.webViewLink });
    } catch (error: any) {
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
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Run on startup
  performDataSweep().catch(console.error);

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
