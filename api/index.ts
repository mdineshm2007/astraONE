import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import dotenv from "dotenv";
import admin from "firebase-admin";
import { createFolder, uploadFile, getOrCreateFolder, createOAuth2Client } from "../src/services/driveService.ts";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
if (!admin.apps.length) {
  try {
    const serviceAccountPath = path.join(process.cwd(), "firebase-admin-sdk.json");
    if (fs.existsSync(serviceAccountPath)) {
      const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
      
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

// Firebase REST Helper
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

const getBaseUrl = (req: express.Request) => {
  const protocol = req.headers['x-forwarded-proto'] || 'http';
  return `${protocol}://${req.headers.host}`;
};

const getAuthForUser = async (uid: string, req?: express.Request) => {
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

app.get("/api/test", (req, res) => res.json({ ok: true }));

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

app.get("/api/auth/google/callback", async (req, res) => {
  try {
    const { code, state } = req.query;
    const baseUrl = getBaseUrl(req);
    if (!code || !state) return res.redirect(`${baseUrl}/?error=missing_params`);
    const oauth2Client = createOAuth2Client(`${baseUrl}/api/auth/google/callback`);
    const { tokens } = await oauth2Client.getToken(code as string);
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
    if (!uid) return res.status(400).json({ error: "UID required" });
    await admin.database().ref(`users/${uid}/drive_tokens`).remove();
    res.json({ success: true });
  } catch (error: any) {
    console.error("Disconnect Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/users/approve", async (req, res) => {
  try {
    const { uid, teamId } = req.body;
    if (!uid || !teamId) return res.status(400).json({ error: "UID and TeamID required" });
    const profile = await firebaseRest.get(`users/${uid}`);
    if (profile) {
      const teams = profile.teams || [];
      const updatedTeams = teams.map((t: any) => 
        t.teamId === teamId ? { ...t, status: 'APPROVED' } : t
      );
      const approvedTeams = updatedTeams.filter((t: any) => t.status === 'APPROVED').map((t: any) => t.teamId);
      const result = await firebaseRest.update(`users/${uid}`, { teams: updatedTeams, approvedTeams });
      if (result) res.json({ success: true });
      else res.status(500).json({ error: "Database update failed" });
    } else res.status(404).json({ error: "User not found" });
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
    } else res.status(404).json({ error: "User not found" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/chat", async (req, res) => {
  try {
    const { messages } = req.body;
    if (!groq) throw new Error("AI Assistant offline");
    const completion = await groq.chat.completions.create({
      messages,
      model: "llama-3.1-8b-instant",
    });
    res.json({ message: completion.choices[0]?.message?.content });
  } catch (error) {
    res.status(500).json({ error: "Failed to communicate with AI" });
  }
});

app.post("/api/analyze", async (req, res) => {
  try {
    const { type, data, context, uid } = req.body;
    let userContext = "";
    if (uid) {
      try {
        const snapshot = await admin.database().ref(`logs/${uid}`).limitToLast(5).once("value");
        if (snapshot.exists()) {
          userContext = "\nUser Context: " + Object.values(snapshot.val()).map((l: any) => l.action).join(", ");
        }
      } catch (e) { }
    }
    const systemPrompt = "You are ASTRA AI. Analyze telemetry and give a sharp, 1-sentence technical directive.";
    const userPrompt = `Telemetery (${type}): ${JSON.stringify(data)}. Context: ${context || 'Mission Control'}.${userContext}`;
    if (!groq) throw new Error("AI Brain Offline");
    const completion = await groq.chat.completions.create({
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
      model: "llama-3.1-8b-instant",
      temperature: 0.7,
      max_tokens: 200
    });
    res.json({ analysis: completion.choices[0]?.message?.content });
  } catch (error) {
    res.status(500).json({ error: "AI Brain Offline" });
  }
});

app.post("/api/drive/setup", async (req, res) => {
  try {
    const { uid } = req.body;
    const auth = await getAuthForUser(uid, req);
    const root = await getOrCreateFolder(auth, "ASTRA_SOLAR_CAR_2026");
    const pRoot = await getOrCreateFolder(auth, "PROGRESS_TRACKING", root.id);
    const bRoot = await getOrCreateFolder(auth, "BILLING_AND_FINANCE", root.id);
    const teams = ["Steering", "Suspension", "Brakes", "Transmission", "Design", "Electricals", "Innovation", "Autonomous", "Cost", "PRO", "Media-Sponsorship"];
    const bTeams = [...teams, "Seat", "Others", "Safety_Equipments", "Dashboard", "Wheel_Tyre", "Frame", "Drive_Train"];
    const map: any = { progress: {}, bills: {} };
    await Promise.all(teams.map(async (t) => { map.progress[t] = await getOrCreateFolder(auth, `${t}_Progress`, pRoot.id); }));
    await Promise.all(bTeams.map(async (t) => { map.bills[t] = await getOrCreateFolder(auth, `${t}_Bills`, bRoot.id); }));
    await firebaseRest.update('drive_folders', map);
    await firebaseRest.update('drive_config/root', root);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/drive/upload", upload.single("file"), async (req, res) => {
  try {
    const { teamId, category, amount, uid } = req.body;
    const auth = await getAuthForUser(uid, req);
    const folderData = await firebaseRest.get(`drive_folders/${category}/${teamId}`);
    if (!folderData || !folderData.id) throw new Error("Team folder not initialized.");
    const fileStream = fs.createReadStream(req.file!.path);
    const result = await uploadFile(auth, req.file!.originalname, req.file!.mimetype, fileStream, folderData.id);
    fs.unlinkSync(req.file!.path);
    res.json({ success: true, link: result.webViewLink });
  } catch (error: any) {
    if (req.file) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: error.message });
  }
});

if (process.env.NODE_ENV === "production") {
  const distPath = path.join(process.cwd(), "dist");
  app.use(express.static(distPath));
  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export default app;
