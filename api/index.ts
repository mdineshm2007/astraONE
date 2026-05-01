import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import dotenv from "dotenv";
import admin from "firebase-admin";
import { google } from 'googleapis';
import Groq from "groq-sdk";
import multer from "multer";
import os from "os";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Google Drive Logic (Merged) ---
export function createOAuth2Client(redirectUri?: string) {
  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  const REDIRECT_URI = redirectUri || 'http://localhost:3001/api/auth/google/callback';
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
}

export async function findFolderByName(auth: any, name: string, parentId?: string) {
  const drive = google.drive({ version: 'v3', auth });
  try {
    const q = `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false${parentId ? ` and '${parentId}' in parents` : ''}`;
    const response = await drive.files.list({
      q,
      fields: 'files(id, name, webViewLink)',
      spaces: 'drive'
    });
    return response.data.files && response.data.files.length > 0 ? response.data.files[0] : null;
  } catch (error: any) {
    console.error(`Error finding folder ${name}:`, error.message);
    return null;
  }
}

export async function createFolder(auth: any, name: string, parentId?: string) {
  const drive = google.drive({ version: 'v3', auth });
  try {
    const fileMetadata = {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : []
    };
    const file = await drive.files.create({
      requestBody: fileMetadata as any,
      fields: 'id, name, webViewLink'
    });
    return file.data;
  } catch (error: any) {
    console.error(`Error creating folder ${name}:`, error.response?.data || error.message);
    throw error;
  }
}

export async function getOrCreateFolder(auth: any, name: string, parentId?: string) {
  const existing = await findFolderByName(auth, name, parentId);
  if (existing) return existing;
  return await createFolder(auth, name, parentId);
}

export async function uploadFile(auth: any, fileName: string, mimeType: string, stream: any, parentId: string) {
  const drive = google.drive({ version: 'v3', auth });
  const fileMetadata = { name: fileName, parents: [parentId] };
  const media = { mimeType, body: stream };
  const file = await drive.files.create({
    requestBody: fileMetadata as any,
    media: media,
    fields: 'id, webViewLink'
  });
  return file.data;
}

// --- Firebase Initialization ---
if (!admin.apps.length) {
  try {
    const serviceAccountPath = path.join(process.cwd(), "firebase-admin-sdk.json");
    if (fs.existsSync(serviceAccountPath)) {
      const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
      if (serviceAccount.private_key) {
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
      }
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: process.env.FIREBASE_DATABASE_URL
      });
      console.log("[Firebase] Admin SDK Initialized Successfully");
    } else {
      console.warn("[Firebase] Admin SDK file not found. Falling back to REST.");
    }
  } catch (err: any) {
    console.error("[Firebase] Initialization Failed:", err.message);
  }
}

// --- Groq Initialization ---
let groq: Groq | null = null;
try {
  if (process.env.GROQ_API_KEY) {
    groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
} catch (e: any) {
  console.error("[Groq] Initialization failed:", e.message);
}

const upload = multer({ dest: os.tmpdir() });
const app = express();
const PORT = 3001;

app.use(express.json());
app.use(cors());

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("[Global Error]", err);
  res.status(500).json({ error: "Internal Server Error", message: err.message });
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
      if (!res.ok) return null;
      return res.json();
    } catch (e) {
      return null;
    }
  },
  update: async (path: string, data: any) => {
    try {
      const cleanUrl = (process.env.FIREBASE_DATABASE_URL || "").replace(/\/$/, "");
      const cleanPath = path.startsWith("/") ? path : `/${path}`;
      const url = `${cleanUrl}${cleanPath}.json?auth=${process.env.FIREBASE_DATABASE_SECRET}`;
      const res = await fetch(url, { method: 'PATCH', body: JSON.stringify(data) });
      if (!res.ok) return null;
      return res.json();
    } catch (e) {
      return null;
    }
  }
};

const getBaseUrl = (req: express.Request) => {
  const protocol = req.headers['x-forwarded-proto'] || 'http';
  return `${protocol}://${req.headers.host}`;
};

const getAuthForUser = async (uid: string, req?: express.Request) => {
  try {
    const tokens = await firebaseRest.get('drive_config/tokens') || (uid ? await firebaseRest.get(`users/${uid}/drive_tokens`) : null);
    if (!tokens) throw new Error("Google Drive not connected.");
    const redirectUri = req ? `${getBaseUrl(req)}/api/auth/google/callback` : undefined;
    const oauth2Client = createOAuth2Client(redirectUri);
    oauth2Client.setCredentials(tokens);
    if (tokens.expiry_date && tokens.expiry_date <= Date.now()) {
      const { credentials } = await oauth2Client.refreshAccessToken();
      const updateData = { ...tokens, ...credentials };
      await firebaseRest.update('drive_config/tokens', updateData);
      oauth2Client.setCredentials(updateData);
    }
    return oauth2Client;
  } catch (error: any) {
    throw new Error(error.message);
  }
};

// Endpoints
app.get("/api/test", (req, res) => res.json({ ok: true }));

app.post("/api/users/approve", async (req, res) => {
  try {
    const { uid, teamId } = req.body;
    const profile = await firebaseRest.get(`users/${uid}`);
    if (profile) {
      const teams = profile.teams || [];
      const updatedTeams = teams.map((t: any) => t.teamId === teamId ? { ...t, status: 'APPROVED' } : t);
      const approvedTeams = updatedTeams.filter((t: any) => t.status === 'APPROVED').map((t: any) => t.teamId);
      await firebaseRest.update(`users/${uid}`, { teams: updatedTeams, approvedTeams });
      res.json({ success: true });
    } else res.status(404).json({ error: "User not found" });
  } catch (error: any) {
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

app.get("/api/auth/google/url", (req, res) => {
  const { uid } = req.query;
  const oauth2Client = createOAuth2Client(`${getBaseUrl(req)}/api/auth/google/callback`);
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline', prompt: 'consent', state: uid as string,
    scope: ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/drive.file']
  });
  res.json({ url });
});

app.get("/api/auth/google/callback", async (req, res) => {
  try {
    const { code, state } = req.query;
    const baseUrl = getBaseUrl(req);
    const oauth2Client = createOAuth2Client(`${baseUrl}/api/auth/google/callback`);
    const { tokens } = await oauth2Client.getToken(code as string);
    await admin.database().ref('drive_config/tokens').set(tokens);
    await admin.database().ref(`users/${state}/drive_tokens`).set(tokens);
    res.redirect(`${baseUrl}/workspace?auth=success`);
  } catch (error: any) {
    res.redirect(`${getBaseUrl(req)}/?error=auth_failed`);
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
    const { teamId, category, uid } = req.body;
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

app.post("/api/chat", async (req, res) => {
  try {
    const { messages } = req.body;
    if (!groq) throw new Error("AI Assistant offline");
    const completion = await groq.chat.completions.create({ messages, model: "llama-3.1-8b-instant" });
    res.json({ message: completion.choices[0]?.message?.content });
  } catch (error) {
    res.status(500).json({ error: "Failed to communicate with AI" });
  }
});

if (process.env.NODE_ENV === "production") {
  const distPath = path.join(process.cwd(), "dist");
  app.use(express.static(distPath));
  app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
}

if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, "0.0.0.0", () => console.log(`Server running on http://localhost:${PORT}`));
}

export default app;
