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

export interface TaskUpdate {
  id: string;
  taskId: string;
  userId: string;
  userName: string;
  userEmail?: string;
  progressPercent: number;
  attendance?: string;
  todayProgress: string;
  nextAction: string;
  resourcesNeeded: string;
  event: string;
  remarks: string;
  createdAt: any;
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
    let serviceAccount;

    if (fs.existsSync(serviceAccountPath)) {
      serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    }

    if (serviceAccount) {
      if (serviceAccount.private_key) {
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
      }
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: process.env.FIREBASE_DATABASE_URL
      });
      console.log("[Firebase] Admin SDK Initialized Successfully");
    } else {
      console.warn("[Firebase] No credentials found. Falling back to REST.");
    }
  } catch (err: any) {
    console.error("[Firebase] Initialization Failed:", err.message);
  }
}

// --- Groq Initialization ---
let groq: Groq | null = null;
try {
    // Env vars take priority, hardcoded fallback ensures Vercel works without manual setup
    const apiKey = (process.env.GROQ_API_KEY || "").trim();
    if (apiKey) {
      groq = new Groq({ apiKey });
      console.log("[Groq] SDK Initialized Successfully");
    }
} catch (e: any) {
  console.error("[Groq] Initialization failed:", e.message);
}

const upload = multer({ dest: os.tmpdir() });
const app = express();
const PORT = 3001;

// Disable ETags to prevent Vercel/browser 304 caching
app.disable('etag');

app.use(express.json());
app.use(cors());

// Force no-cache headers for all API requests to ensure real-time data
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
});

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("[Global Error]", err);
  res.status(500).json({ error: "Internal Server Error", message: err.message });
});

// Firebase-compatible push ID generator (pure JS — no admin SDK needed)
function generatePushId(): string {
  const PUSH_CHARS = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';
  let now = Date.now();
  let id = '';
  for (let i = 7; i >= 0; i--) {
    id = PUSH_CHARS[now % 64] + id;
    now = Math.floor(now / 64);
  }
  for (let i = 0; i < 12; i++) {
    id += PUSH_CHARS[Math.floor(Math.random() * 64)];
  }
  return id;
}

// Firebase credentials — env vars take priority, hardcoded fallbacks ensure Vercel works without manual setup
const FIREBASE_DB_URL = (process.env.FIREBASE_DATABASE_URL || "https://studio-1045950084-89865-default-rtdb.asia-southeast1.firebasedatabase.app").replace(/\/$/, "");
const FIREBASE_DB_SECRET = process.env.FIREBASE_DATABASE_SECRET || "nbN32sF35ZGFoP3IdVaGkVb5t9gW5NFj3V7Gu7rY";

// Firebase REST Helper
const firebaseRest = {
  get: async (path: string) => {
    try {
      const cleanPath = path.startsWith("/") ? path : `/${path}`;
      const url = `${FIREBASE_DB_URL}${cleanPath}.json?auth=${FIREBASE_DB_SECRET}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      return res.json();
    } catch (e) {
      return null;
    }
  },
  update: async (path: string, data: any) => {
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    const url = `${FIREBASE_DB_URL}${cleanPath}.json?auth=${FIREBASE_DB_SECRET}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Firebase PATCH failed (${res.status}): ${errText}`);
    }
    return res.json();
  },
  put: async (path: string, data: any) => {
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    const url = `${FIREBASE_DB_URL}${cleanPath}.json?auth=${FIREBASE_DB_SECRET}`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Firebase PUT failed (${res.status}): ${errText}`);
    }
    return res.json();
  },
  remove: async (path: string) => {
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    const url = `${FIREBASE_DB_URL}${cleanPath}.json?auth=${FIREBASE_DB_SECRET}`;
    const res = await fetch(url, { method: 'DELETE' });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Firebase DELETE failed (${res.status}): ${errText}`);
    }
    return true;
  }
};

// Mirror of AuthContext resolveRoleFromEmail - ensures backend profile creation gives correct role
function resolveRoleFromEmail(email: string): { role: string; teams: { teamId: string; status: string }[]; approvedTeams: string[] } {
  const e = email.toLowerCase().trim();
  
  const captains = [
    '727724eumc054@skcet.ac.in',
    '727724eumc036@skcet.ac.in',
    '727724eumc011@skcet.ac.in',
    '727725eumc604@skcet.ac.in',
    '727724eumc044@skcet.ac.in',
    '25mz122@skcet.ac.in',
    '727725eumc608@skcet.ac.in',
    // 4th Year Ex-Captains
    '727723eumt119@skcet.ac.in', // Sanjiv
    '727723eumt129@skcet.ac.in', // Sri Prenesh
    '727723eumt125@skcet.ac.in', // Shenbaga Raja
    '727723eumt092@skcet.ac.in', // Nitin
    '727723eumt094@skcet.ac.in', // Owshik Johnson
  ];

  if (captains.includes(e)) {
    const teams: { teamId: string; status: string }[] = [];
    if (e === '727724eumc044@skcet.ac.in') teams.push({ teamId: 'steering', status: 'APPROVED' }, { teamId: 'cost', status: 'APPROVED' });
    if (e === '25mz122@skcet.ac.in') teams.push({ teamId: 'innovation', status: 'APPROVED' });
    if (e === '727725eumc608@skcet.ac.in') teams.push({ teamId: 'pro', status: 'APPROVED' });
    return { role: 'CAPTAIN', teams, approvedTeams: teams.map(t => t.teamId) };
  }
  
  const teamLeads: Record<string, string> = {
    '25mz096@skcet.ac.in': 'suspension',
    '727724eumc114@skcet.ac.in': 'brakes',
    '25mz021@skcet.ac.in': 'transmission',
    '25mz045@skcet.ac.in': 'design',
    '727724eumc093@skcet.ac.in': 'electrical',
    '727724eumc026@skcet.ac.in': 'autonomous',
  };
  
  if (teamLeads[e]) {
    const teamId = teamLeads[e];
    return { role: 'TEAM_LEAD', teams: [{ teamId, status: 'APPROVED' }], approvedTeams: [teamId] };
  }
  
  return { role: 'MEMBER', teams: [], approvedTeams: [] };
}

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

app.get("/api/users/profile/:uid", async (req, res) => {
  try {
    const { uid } = req.params;
    if (!uid) return res.status(400).json({ error: "UID required" });

    let profile = await firebaseRest.get(`users/${uid}`);
    
    if (!profile && admin.apps.length > 0) {
      try {
        const snapshot = await admin.database().ref(`users/${uid}`).once("value");
        if (snapshot.exists()) profile = snapshot.val();
      } catch (e) {}
    }

    if (!profile) {
      // We don't have the email here, so create minimal profile
      // The frontend will sync the role via resolveRoleFromEmail on next load
      const defaultProfile = {
        uid,
        displayName: 'Engineer',
        role: 'MEMBER',
        onboarded: false,
        createdAt: new Date().toISOString()
      };
      
      if (admin.apps.length > 0) {
        await admin.database().ref(`users/${uid}`).set(defaultProfile);
      } else {
        await firebaseRest.put(`users/${uid}`, defaultProfile);
      }
      profile = defaultProfile;
    }

    // CRITICAL: Always re-apply email-based role resolution if email is available
    // This ensures CAPTAIN/TEAM_LEAD users are never downgraded to MEMBER by the backend
    const email = profile.email || '';
    if (email) {
      const { role, teams, approvedTeams } = resolveRoleFromEmail(email);
      const needsRoleUpdate = profile.role !== role;
      if (needsRoleUpdate) {
        const merged = { ...profile, role, teams, approvedTeams };
        if (admin.apps.length > 0) {
          await admin.database().ref(`users/${uid}`).update({ role, teams, approvedTeams }).catch(() => {});
        } else {
          await firebaseRest.update(`users/${uid}`, { role, teams, approvedTeams }).catch(() => {});
        }
        return res.json(merged);
      }
    }

    res.json(profile);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/users/profile/:uid/fix-role", async (req, res) => {
  try {
    const { uid } = req.params;
    const { email } = req.body;
    if (!uid || !email) return res.status(400).json({ error: "UID and email required" });
    
    const { role, teams, approvedTeams } = resolveRoleFromEmail(email);
    
    const updates = { role, teams, approvedTeams };
    if (admin.apps.length > 0) {
      await admin.database().ref(`users/${uid}`).update(updates);
    } else {
      await firebaseRest.update(`users/${uid}`, updates);
    }
    
    res.json({ success: true, role, teams, approvedTeams });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/users/profile/:uid/update", async (req, res) => {
  try {
    const { uid } = req.params;
    const updates = req.body;
    if (!uid) return res.status(400).json({ error: "UID required" });
    
    await admin.database().ref(`users/${uid}`).update(updates);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/users/teams/request", async (req, res) => {
  try {
    const { uid, teamIds } = req.body;
    if (!uid || !teamIds) return res.status(400).json({ error: "UID and teamIds required" });

    const userRef = admin.database().ref(`users/${uid}`);
    const snapshot = await userRef.once("value");
    
    if (snapshot.exists()) {
      const profile = snapshot.val();
      const currentTeams = profile.teams || [];
      
      const newTeamRequests = teamIds
        .filter((id: string) => !currentTeams.some((t: any) => t.teamId === id))
        .map((id: string) => ({ teamId: id, status: 'PENDING' }));

      if (newTeamRequests.length > 0) {
        const updatedTeams = [...currentTeams, ...newTeamRequests];
        await userRef.update({ teams: updatedTeams });
      }
      res.json({ success: true });
    } else {
      res.status(404).json({ error: "User not found" });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/admin/pending", async (req, res) => {
  try {
    const { teamIds } = req.query; // Expecting comma-separated or 'all'
    const snapshot = await admin.database().ref('users').once("value");
    const data = snapshot.val() || {};
    const members = Object.entries(data).map(([key, val]: [string, any]) => ({
      ...val,
      uid: val.uid || key
    }));

    const targets = teamIds === 'all' ? ['all'] : (teamIds as string || '').split(',');

    const filtered = members.filter((profile: any) => {
      if (targets.includes('all')) {
        return profile.teams?.some((t: any) => t.status === 'PENDING');
      }
      return profile.teams?.some((t: any) => t.status === 'PENDING' && targets.includes(t.teamId));
    });
    res.json(filtered);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/admin/members", async (req, res) => {
  try {
    const snapshot = await admin.database().ref('users').once("value");
    const data = snapshot.val() || {};
    const members = Object.entries(data).map(([key, val]: [string, any]) => ({
      ...val,
      uid: val.uid || key
    }));
    res.json(members);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/admin/users/delete", async (req, res) => {
  try {
    const { uid } = req.body;
    if (!uid) {
      return res.status(400).json({ error: "uid is required" });
    }

    // Safety check: Don't delete captains via this endpoint 
    const snapshot = await admin.database().ref(`users/${uid}`).once("value");
    if (snapshot.exists()) {
      const profile = snapshot.val();
      if (profile.role === 'CAPTAIN') {
        return res.status(403).json({ error: "Cannot delete a Captain account." });
      }
    }

    // 1. Delete user from Firebase Authentication
    try {
      await admin.auth().deleteUser(uid);
      console.log(`[Firebase Auth] Successfully deleted user ${uid}`);
    } catch (authError: any) {
      console.warn(`[Firebase Auth] Delete failed or user not in Auth: ${authError.message}`);
    }

    // 2. Remove user profile
    await admin.database().ref(`users/${uid}`).remove();

    // 3. Remove user notifications to save storage
    await admin.database().ref(`notifications/${uid}`).remove();

    // 4. Remove all task updates created by this user to save storage
    const updatesRef = admin.database().ref('task_updates');
    const updatesSnapshot = await updatesRef.orderByChild('userId').equalTo(uid).once('value');
    if (updatesSnapshot.exists()) {
      const updates = updatesSnapshot.val();
      const deletePromises = Object.keys(updates).map(updateId => 
        admin.database().ref(`task_updates/${updateId}`).remove()
      );
      await Promise.all(deletePromises);
      console.log(`[CleanUp] Removed ${deletePromises.length} task updates for user ${uid}`);
    }

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/tasks/:taskId", async (req, res) => {
  try {
    const { taskId } = req.params;
    const { subsystemId } = req.query;

    if (!taskId) {
      return res.status(400).json({ error: "taskId is required" });
    }
    if (!subsystemId) {
      return res.status(400).json({ error: "subsystemId is required" });
    }

    const db = admin.database();

    // Fetch task first to check status
    const taskSnapshot = await db.ref(`tasks/${taskId}`).once('value');
    if (!taskSnapshot.exists()) {
      return res.status(404).json({ error: "Task not found" });
    }
    const task = taskSnapshot.val();

    // 1. Delete all associated task updates
    const updatesRef = db.ref('task_updates');
    const snapshot = await updatesRef.orderByChild('taskId').equalTo(taskId).once('value');
    if (snapshot.exists()) {
      const updates = snapshot.val();
      const deletePromises = Object.keys(updates).map(updateId => 
        db.ref(`task_updates/${updateId}`).remove()
      );
      await Promise.all(deletePromises);
    }

    // 2. Delete all associated task notifications across all users
    const notificationsRef = db.ref('notifications');
    const notifSnapshot = await notificationsRef.once('value');
    if (notifSnapshot.exists()) {
      const allNotifications = notifSnapshot.val();
      const notifPromises: Promise<void>[] = [];
      for (const [userId, userNotifs] of Object.entries(allNotifications)) {
        if (userNotifs && typeof userNotifs === 'object') {
          for (const [notifId, notifData] of Object.entries(userNotifs)) {
            if (notifId.startsWith(`task_assign_${taskId}`) || notifId.startsWith(`task_rem_${taskId}`)) {
              notifPromises.push(db.ref(`notifications/${userId}/${notifId}`).remove());
            }
          }
        }
      }
      if (notifPromises.length > 0) {
        await Promise.all(notifPromises);
        console.log(`[CleanUp] Removed ${notifPromises.length} notifications associated with task ${taskId}`);
      }
    }

    // 3. Delete the task itself
    await db.ref(`tasks/${taskId}`).remove();

    // 4. Update the pending task count for the subsystem if the deleted task was not completed
    if (task.status !== 'COMPLETED') {
      const subsRef = db.ref(`subsystems/${subsystemId}/pendingTasks`);
      await subsRef.transaction((current) => {
        if (current === null) return 0;
        return Math.max(0, current - 1);
      });
    }

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/tasks/notify-assign", async (req, res) => {
  try {
    const { taskId, assignedToId, title, message } = req.body;
    if (!assignedToId) return res.status(400).json({ error: "assignedToId is required" });

    const snapshot = await admin.database().ref(`users/${assignedToId}`).once("value");
    if (!snapshot.exists()) {
      return res.status(404).json({ error: "User profile not found" });
    }
    const user = snapshot.val();

    const notifId = `task_assign_${taskId || Date.now()}`;
    const notification = {
      title: title || "New Task Assigned 📌",
      message: message || "You have been assigned a task.",
      type: 'INFO',
      timestamp: new Date().toISOString(),
      read: false,
      link: 'teams'
    };
    await admin.database().ref(`notifications/${assignedToId}/${notifId}`).set(notification);

    if (user.pushToken) {
      try {
        await admin.messaging().send({
          token: user.pushToken,
          notification: {
            title: notification.title,
            body: notification.message
          },
          data: {
            link: 'teams',
            type: 'INFO'
          }
        });
        console.log(`[FCM] Sent immediate assignment push to ${user.displayName || user.email}`);
      } catch (fcmError: any) {
        console.error(`[FCM] Immediate assignment push failed:`, fcmError.message);
      }
    }

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/notifications/send-custom", async (req, res) => {
  try {
    const { targetType, targetId, title, message } = req.body;
    if (!targetType) return res.status(400).json({ error: "targetType is required" });
    if (!title || !message) return res.status(400).json({ error: "title and message are required" });

    const db = admin.database();
    const usersSnapshot = await db.ref('users').once("value");
    const users = usersSnapshot.val() || {};

    let targets: [string, any][] = [];

    if (targetType === 'all') {
      targets = Object.entries(users);
    } else if (targetType === 'user') {
      if (!targetId) return res.status(400).json({ error: "targetId is required for user target" });
      if (users[targetId]) {
        targets = [[targetId, users[targetId]]];
      } else {
        return res.status(404).json({ error: "User not found" });
      }
    } else if (targetType === 'team') {
      if (!targetId) return res.status(400).json({ error: "targetId is required for team target" });
      const teamId = targetId.toLowerCase().trim();
      targets = Object.entries(users).filter(([uid, u]: [string, any]) => {
        const approvedTeams = u.approvedTeams || [];
        const teams = u.teams || [];
        return approvedTeams.includes(teamId) || teams.some((t: any) => t.teamId === teamId && t.status === 'APPROVED');
      });
    }

    if (targets.length === 0) {
      return res.status(400).json({ error: "No target users found for selection" });
    }

    const notifId = `custom_${Date.now()}`;
    const notification = {
      title,
      message,
      type: 'ANNOUNCEMENT',
      timestamp: new Date().toISOString(),
      read: false,
      link: 'teams'
    };

    let pushCount = 0;
    for (const [uid, u] of targets) {
      await db.ref(`notifications/${uid}/${notifId}`).set(notification);
      
      if (u.pushToken) {
        try {
          await admin.messaging().send({
            token: u.pushToken,
            notification: {
              title,
              body: message
            },
            data: {
              link: 'teams',
              type: 'ANNOUNCEMENT'
            }
          });
          pushCount++;
        } catch (fcmError: any) {
          console.error(`[FCM Custom] Failed to send push to ${uid}:`, fcmError.message);
        }
      }
    }

    res.json({ success: true, usersNotified: targets.length, pushDelivered: pushCount });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/users/approve", async (req, res) => {
  try {
    const { uid, teamId } = req.body;
    if (!uid || !teamId) return res.status(400).json({ error: "UID and teamId required" });

    const userRef = admin.database().ref(`users/${uid}`);
    const snapshot = await userRef.once("value");
    
    if (snapshot.exists()) {
      const profile = snapshot.val();
      const teams = profile.teams || [];
      const updatedTeams = teams.map((t: any) => t.teamId === teamId ? { ...t, status: 'APPROVED' } : t);
      const approvedTeams = updatedTeams.filter((t: any) => t.status === 'APPROVED').map((t: any) => t.teamId);
      await userRef.update({ teams: updatedTeams, approvedTeams });
      res.json({ success: true });
    } else res.status(404).json({ error: "User not found" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/users/reject", async (req, res) => {
  try {
    const { uid, teamId } = req.body;
    if (!uid || !teamId) return res.status(400).json({ error: "UID and teamId required" });

    const userRef = admin.database().ref(`users/${uid}`);
    const snapshot = await userRef.once("value");
    
    if (snapshot.exists()) {
      const profile = snapshot.val();
      const updatedTeams = (profile.teams || []).filter((t: any) => t.teamId !== teamId);
      const approvedTeams = updatedTeams.filter((t: any) => t.status === 'APPROVED').map((t: any) => t.teamId);
      await userRef.update({ teams: updatedTeams, approvedTeams });
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

app.get("/api/drive/status", async (req, res) => {
  try {
    const status = await firebaseRest.get('drive_config/status');
    const tokens = await firebaseRest.get('drive_config/tokens');
    res.json({ connected: !!status?.connected || !!tokens });
  } catch (error) {
    res.json({ connected: false });
  }
});

app.get("/api/drive/folders", async (req, res) => {
  try {
    const folders = await firebaseRest.get('drive_folders');
    res.json({ folders: folders || null });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/auth/google/callback", async (req, res) => {
  try {
    const { code, state } = req.query;
    const baseUrl = getBaseUrl(req);

    if (!code || !state) return res.redirect(`${baseUrl}/workspace?error=missing_params`);

    const oauth2Client = createOAuth2Client(`${baseUrl}/api/auth/google/callback`);
    const { tokens } = await oauth2Client.getToken(code as string);
    await admin.database().ref('drive_config/tokens').set(tokens);
    await admin.database().ref('drive_config/status').set({ connected: true, timestamp: Date.now() });
    await admin.database().ref(`users/${state}/drive_tokens`).set(tokens);
    res.redirect(`${baseUrl}/workspace?auth=success`);
  } catch (error: any) {
    console.error("[Auth Callback Error]", error.message);
    const baseUrl = getBaseUrl(req);
    res.redirect(`${baseUrl}/workspace?error=auth_failed`);
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
    const { messages, endpoint, model, apiKey } = req.body;
    
    let activeEndpoint = endpoint || "https://api.groq.com/openai/v1/chat/completions";
    const activeModel = model || "llama-3.1-8b-instant";
    const activeKey = apiKey || process.env.GROQ_API_KEY || "";

    // Prevent infinite recursion loops if user sets the proxy endpoint as the target
    if (activeEndpoint.includes("/api/chat")) {
      activeEndpoint = "https://api.groq.com/openai/v1/chat/completions";
    }

    if (!activeKey) throw new Error("AI Assistant offline (Missing API Key)");

    // Call the target API dynamically (handles any third-party or fine-tuned provider)
    const response = await fetch(activeEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${activeKey}`,
        'bypass-tunnel-reminder': 'true' // Bypasses localtunnel warning pages for API clients
      },
      body: JSON.stringify({
        model: activeModel,
        messages,
        temperature: 0.7,
        max_tokens: 1024
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI Provider returned error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const assistantMessage = data.choices?.[0]?.message?.content || "No response generated.";
    res.json({ message: assistantMessage });
  } catch (error: any) {
    console.error("Chat API Error:", error?.message || error);
    res.status(500).json({ error: error?.message || "Failed to communicate with AI" });
  }
});

// --- Full Data Backup Endpoint ---
app.get("/api/backup/full", async (req, res) => {
  try {
    const dbUrl = process.env.FIREBASE_DATABASE_URL || 'https://studio-1045950084-89865-default-rtdb.asia-southeast1.firebasedatabase.app/';
    const dbSecret = process.env.FIREBASE_DATABASE_SECRET || '';
    
    // Fetch all data from Firebase REST API
    const response = await fetch(`${dbUrl}.json?auth=${dbSecret}`);
    if (!response.ok) throw new Error(`Firebase REST error: ${response.status}`);
    const allData = await response.json();
    
    res.json({
      success: true,
      exportedAt: new Date().toISOString(),
      data: {
        users: allData.users || {},
        tasks: allData.tasks || {},
        subsystems: allData.subsystems || {},
        posts: allData.posts || {},
        queries: allData.queries || {},
        notebooks: allData.notebooks || {},
        teamRequests: allData.teamRequests || {},
        notifications: allData.notifications || {},
        innovation: allData.innovation || {},
        updates: allData.updates || {},
      }
    });
  } catch (error: any) {
    console.error("[Backup] Full backup failed:", error.message);
    res.status(500).json({ error: error.message });
  }
});

if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, "0.0.0.0", () => console.log(`Server running on http://localhost:${PORT}`));
}

// --- AI Intelligence Endpoints ---

/** Generic Analysis Endpoint - Used by getTaskInsights */
app.post("/api/analyze", async (req, res) => {
  try {
    if (!groq) return res.status(503).json({ error: "AI Service Unavailable (Missing Key)" });
    const { type, data, context = 'Mission Control' } = req.body;

    let systemPrompt = "You are ASTRA AI, the project intelligence lead. Provide a concise, professional summary (max 4 sentences) of the telemetry provided.";
    if (type === 'TASK_PROGRESS') {
      systemPrompt = "You are ASTRA AI, the project intelligence lead. Analyze the task telemetry and progress updates. Provide a concise, professional summary (max 4 sentences) of progress and bottlenecks. Use engineering terminology.";
    }

    const completion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Telemetry (${type}): ${JSON.stringify(data).slice(0, 4000)}. Context: ${context}` }
      ],
      model: "llama-3.1-8b-instant",
      temperature: 0.7,
      max_tokens: 300
    });

    res.json({ analysis: completion.choices[0]?.message?.content });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** Team-Specific Strategy - Used by getTeamAnalysis */
app.post("/api/ai/team-analysis", async (req, res) => {
  try {
    if (!groq) return res.status(503).json({ error: "AI Service Unavailable (Missing Key)" });
    const { tasks = [], members = [], progress = [], delays = [], subsystem = "General" } = req.body;

    const systemPrompt = `You are an AI Project Manager for a solar car team.
Analyze the provided telemetry and return a strategic assessment in STRICT JSON format:
{
  "priority_tasks": ["task 1", "task 2"],
  "at_risk_tasks": ["task 3"],
  "blocked_members": ["member name"],
  "team_efficiency": "Percentage or descriptive string",
  "recommendations": ["rec 1", "rec 2"],
  "team_summary": "1-sentence summary"
}`;

    const completion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Subsystem: ${subsystem}\nTasks: ${JSON.stringify(tasks).slice(0, 4000)}\nMembers: ${JSON.stringify(members)}\nProgress: ${JSON.stringify(progress)}\nDelays: ${JSON.stringify(delays)}` }
      ],
      model: "llama-3.1-8b-instant",
      temperature: 0.3,
      response_format: { type: "json_object" }
    });

    const content = completion.choices[0]?.message?.content || "{}";
    try {
      res.json(JSON.parse(content));
    } catch (e) {
      res.json({ team_summary: content.slice(0, 200), recommendations: ["Review logs manually (AI Parse Error)"] });
    }
  } catch (error: any) {
    res.status(500).json({ error: "AI Engine Busy", detail: error.message });
  }
});

/** Summarize Notes - Used by summarizeNotes */
app.post("/api/summarize", async (req, res) => {
  try {
    if (!groq) return res.status(503).json({ error: "AI Service Unavailable" });
    const { notes } = req.body;
    const completion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: "You are ASTRA Project Intelligence. Summarize the provided notes concisely." },
        { role: "user", content: `Notes: ${JSON.stringify(notes).slice(0, 4000)}` }
      ],
      model: "llama-3.1-8b-instant",
      max_tokens: 300
    });
    res.json({ summary: completion.choices[0]?.message?.content });
  } catch (error: any) {
    res.status(500).json({ error: "Summary Engine Busy", detail: error.message });
  }
});

/** Generic AI Analyze - Used by generateSchedule */
app.post("/api/ai/analyze", async (req, res) => {
  try {
    if (!groq) return res.status(503).json({ error: "AI Service Unavailable" });
    const { systemPrompt, userPrompt, model = "llama-3.1-8b-instant" } = req.body;
    const completion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      model,
      temperature: 0.3,
      response_format: { type: "json_object" }
    });
    res.json(JSON.parse(completion.choices[0]?.message?.content || "{}"));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** Generic AI Chat - Used by chatAssistant */
app.post("/api/ai/chat", async (req, res) => {
  try {
    if (!groq) return res.status(503).json({ error: "AI Service Unavailable" });
    const { messages } = req.body;
    const completion = await groq.chat.completions.create({
      messages,
      model: "llama-3.1-8b-instant",
      temperature: 0.7,
      max_tokens: 1024
    });
    res.json({ message: completion.choices[0]?.message?.content || "" });
  } catch (error: any) {
    res.status(500).json({ error: "Chat Engine Busy", detail: error.message });
  }
});

/** Test AI Connection - Diagnostics */
app.get("/api/ai/test-key", async (req, res) => {
  try {
    const apiKey = (process.env.GROQ_API_KEY || "").trim();
    if (!apiKey) return res.json({ ok: false, error: "Missing GROQ_API_KEY env var" });
    
    const testGroq = new Groq({ apiKey });
    await testGroq.chat.completions.create({
      messages: [{ role: "user", content: "ping" }],
      model: "llama-3.1-8b-instant",
      max_tokens: 1
    });
    
    res.json({ ok: true, message: "AI Neural Link Active", keyPrefix: `${apiKey.slice(0, 6)}...` });
  } catch (error: any) {
    res.status(401).json({ ok: false, error: "Invalid API Key", detail: error.message });
  }
});

/** Administrative Telemetry Bridge - Used by TaskTable CSV Export */
app.get("/api/admin/telemetry/updates", async (req, res) => {
  try {
    let data;
    if (admin.apps.length > 0) {
      const snapshot = await admin.database().ref('task_updates').once("value");
      data = snapshot.val() || {};
    } else {
      data = await firebaseRest.get('task_updates') || {};
    }
    const updates = Object.entries(data).map(([id, val]: [string, any]) => ({ id, ...val }));
    res.json(updates);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- BOM & Finances Proxy Endpoints ---

async function recalculateTeamTotal(teamName: string) {
  try {
    const data = await firebaseRest.get(`finances/bom/${teamName}`);
    let total = 0;
    if (data && typeof data === 'object') {
      total = (Object.values(data) as any[]).reduce((sum: number, item: any): number => sum + (Number(item?.totalMaterialCost) || 0), 0);
    }
    await firebaseRest.put(`finances/teams/${teamName}`, total);
    console.log(`[BOM] Recalculated total for ${teamName}: ${total}`);
  } catch (error: any) {
    console.error(`[BOM] Failed to recalculate total for ${teamName}:`, error.message);
  }
}

app.get("/api/bom/:teamName", async (req, res) => {
  try {
    const data = await firebaseRest.get(`finances/bom/${req.params.teamName}`);
    res.json(data || {});
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/bom/:teamName/add", async (req, res) => {
  try {
    const { teamName } = req.params;
    const newItem = req.body;
    // Use pure-JS Firebase-compatible push ID (no admin SDK dependency)
    const newId = generatePushId();
    console.log(`[BOM] Adding item to finances/bom/${teamName}/${newId}`);
    await firebaseRest.put(`finances/bom/${teamName}/${newId}`, newItem);
    console.log(`[BOM] Successfully added item ${newId}`);
    
    // Automatically trigger backend total recalculation
    await recalculateTeamTotal(teamName);
    
    res.json({ success: true, id: newId, data: newItem });
  } catch (error: any) {
    console.error("[BOM] Add error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/bom/:teamName/:id", async (req, res) => {
  try {
    const { teamName, id } = req.params;
    await firebaseRest.put(`finances/bom/${teamName}/${id}`, req.body);
    
    // Automatically trigger backend total recalculation
    await recalculateTeamTotal(teamName);
    
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/bom/:teamName/:id", async (req, res) => {
  try {
    const { teamName, id } = req.params;
    await firebaseRest.remove(`finances/bom/${teamName}/${id}`);
    
    // Automatically trigger backend total recalculation
    await recalculateTeamTotal(teamName);
    
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/finances/teams/:teamName/total", async (req, res) => {
  try {
    const { teamName } = req.params;
    const { total } = req.body;
    await firebaseRest.put(`finances/teams/${teamName}`, total);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- Rulebook Checklist Endpoints ---

// GET /api/rulebook/:category?team=TeamName (or team=all for overall)
app.get("/api/rulebook/:category", async (req, res) => {
  try {
    const { category } = req.params;
    const { team } = req.query as { team?: string };

    if (team && team !== 'all') {
      // Single team view
      const data = await firebaseRest.get(`rulebook/${category}/${team}`);
      if (!data) return res.json([]);
      const items = Object.entries(data).map(([id, val]: [string, any]) => ({ id, ...val }));
      res.json(items);
    } else {
      // Overall view — fetch all teams
      const data = await firebaseRest.get(`rulebook/${category}`);
      if (!data) return res.json([]);
      const items: any[] = [];
      for (const [teamId, teamItems] of Object.entries(data as Record<string, any>)) {
        if (teamItems && typeof teamItems === 'object') {
          for (const [id, val] of Object.entries(teamItems as Record<string, any>)) {
            items.push({ id, teamId, ...val });
          }
        }
      }
      res.json(items);
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/rulebook/:category/add
app.post("/api/rulebook/:category/add", async (req, res) => {
  try {
    const { category } = req.params;
    const { title, description, teamId, createdBy, createdByName } = req.body;
    if (!title || !teamId) return res.status(400).json({ error: "title and teamId required" });

    const newId = generatePushId();
    const newItem = {
      title,
      description: description || '',
      category,
      teamId,
      checked: false,
      createdBy: createdBy || 'unknown',
      createdByName: createdByName || 'Unknown',
      createdAt: new Date().toISOString(),
    };
    await firebaseRest.put(`rulebook/${category}/${teamId}/${newId}`, newItem);
    res.json({ success: true, id: newId });
  } catch (error: any) {
    console.error("[Rulebook] Add error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/rulebook/:category/:id/check  — toggle check
app.put("/api/rulebook/:category/:id/check", async (req, res) => {
  try {
    const { category, id } = req.params;
    const { checked, checkedBy, checkedAt, teamId } = req.body;
    if (!teamId) return res.status(400).json({ error: "teamId required" });
    await firebaseRest.update(`rulebook/${category}/${teamId}/${id}`, { checked, checkedBy, checkedAt });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/rulebook/:category/:id?teamId=...
app.delete("/api/rulebook/:category/:id", async (req, res) => {
  try {
    const { category, id } = req.params;
    const { teamId } = req.query as { teamId?: string };
    if (!teamId) return res.status(400).json({ error: "teamId query param required" });
    await firebaseRest.remove(`rulebook/${category}/${teamId}/${id}`);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- Cloud Usage & Analytics Endpoint ---
app.get("/api/cloud/usage", async (req, res) => {
  try {
    // Fetch all major data collections to calculate size
    const [tasks, users, subsystems, finances, posts, queries, taskUpdates, rulebook, archives, driveFolders] = await Promise.all([
      firebaseRest.get('tasks'),
      firebaseRest.get('users'),
      firebaseRest.get('subsystems'),
      firebaseRest.get('finances'),
      firebaseRest.get('posts'),
      firebaseRest.get('queries'),
      firebaseRest.get('task_updates'),
      firebaseRest.get('rulebook'),
      firebaseRest.get('archives'),
      firebaseRest.get('drive_folders'),
    ]);

    const calcSize = (data: any): number => {
      if (!data) return 0;
      return new TextEncoder().encode(JSON.stringify(data)).length;
    };

    const calcCount = (data: any): number => {
      if (!data || typeof data !== 'object') return 0;
      return Object.keys(data).length;
    };

    // Deep count for nested structures like rulebook
    const calcDeepCount = (data: any): number => {
      if (!data || typeof data !== 'object') return 0;
      let count = 0;
      for (const val of Object.values(data)) {
        if (val && typeof val === 'object') {
          count += Object.keys(val as object).length;
        } else {
          count++;
        }
      }
      return count;
    };

    const collections = {
      tasks: { count: calcCount(tasks), sizeBytes: calcSize(tasks) },
      users: { count: calcCount(users), sizeBytes: calcSize(users) },
      subsystems: { count: calcCount(subsystems), sizeBytes: calcSize(subsystems) },
      finances: { count: calcCount(finances), sizeBytes: calcSize(finances) },
      posts: { count: calcCount(posts), sizeBytes: calcSize(posts) },
      queries: { count: calcCount(queries), sizeBytes: calcSize(queries) },
      task_updates: { count: calcCount(taskUpdates), sizeBytes: calcSize(taskUpdates) },
      rulebook: { count: calcDeepCount(rulebook), sizeBytes: calcSize(rulebook) },
      archives: { count: calcDeepCount(archives), sizeBytes: calcSize(archives) },
      drive_folders: { count: calcCount(driveFolders), sizeBytes: calcSize(driveFolders) },
    };

    const totalSizeBytes = Object.values(collections).reduce((sum, c) => sum + c.sizeBytes, 0);
    const totalDocuments = Object.values(collections).reduce((sum, c) => sum + c.count, 0);

    // Firebase Spark plan limits
    const rtdbLimitBytes = 1 * 1024 * 1024 * 1024; // 1 GB
    const monthlyDownloadLimitBytes = 10 * 1024 * 1024 * 1024; // 10 GB/month (Spark plan)

    // Count active/online users
    const activeUsers = users ? Object.values(users).filter((u: any) => u.isOnline === true).length : 0;
    const totalUsers = calcCount(users);

    // Estimate monthly access (reads per collection * avg doc size)
    // For real usage, Firebase provides this in the console. We estimate based on data volume.
    const estimatedDailyReads = totalDocuments * 15; // ~15 reads per doc per day avg
    const estimatedMonthlyReadsGB = (estimatedDailyReads * 30 * (totalSizeBytes / Math.max(totalDocuments, 1))) / (1024 * 1024 * 1024);

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      storage: {
        usedBytes: totalSizeBytes,
        usedMB: +(totalSizeBytes / (1024 * 1024)).toFixed(3),
        limitGB: 1,
        percentUsed: +((totalSizeBytes / rtdbLimitBytes) * 100).toFixed(4),
      },
      bandwidth: {
        estimatedMonthlyGB: +estimatedMonthlyReadsGB.toFixed(3),
        limitGB: 10,
        percentUsed: +((estimatedMonthlyReadsGB / 10) * 100).toFixed(2),
      },
      documents: {
        total: totalDocuments,
        active: totalDocuments - calcDeepCount(archives),
        archived: calcDeepCount(archives),
      },
      users: {
        total: totalUsers,
        activeNow: activeUsers,
      },
      collections,
    });
  } catch (error: any) {
    console.error("[Cloud Usage] Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Helper to query/modify RTDB nodes dynamically (Vercel-safe)
async function getDbData(path: string) {
  if (admin.apps.length > 0) {
    const snap = await admin.database().ref(path).once("value");
    return snap.val();
  } else {
    return await firebaseRest.get(path);
  }
}

async function setDbData(path: string, val: any) {
  if (admin.apps.length > 0) {
    await admin.database().ref(path).set(val);
  } else {
    await firebaseRest.put(path, val);
  }
}

// Trigger daily task notifications for assigned members
async function triggerDailyTaskNotifications() {
  try {
    console.log("[Notifications] Starting task notification scan...");
    const tasks = await getDbData('tasks') || {};
    const users = await getDbData('users') || {};
    
    const activeTasks = Object.entries(tasks).map(([id, val]: [string, any]) => ({ id, ...val }))
      .filter(t => t.status !== 'COMPLETED');
      
    console.log(`[Notifications] Found ${activeTasks.length} active tasks.`);
    
    for (const task of activeTasks) {
      let targetUserId = task.assignedToId;
      let targetUser = null;
      
      if (targetUserId && users[targetUserId]) {
        targetUser = users[targetUserId];
      } else {
        const targetSearch = (task.assignedTo || "").toLowerCase().trim();
        if (targetSearch) {
          const matchedEntry = Object.entries(users).find(([uid, u]: [string, any]) => {
            return (u.email || "").toLowerCase().trim() === targetSearch || 
                   (u.displayName || "").toLowerCase().trim() === targetSearch;
          });
          if (matchedEntry) {
            targetUserId = matchedEntry[0];
            targetUser = matchedEntry[1];
          }
        }
      }
      
      if (targetUserId && targetUser) {
        const notifId = `task_rem_${task.id}_${new Date().toISOString().split('T')[0]}`;
        const userEmail = targetUser.email || "No email";
        const userName = targetUser.displayName || "Member";
        
        const notification = {
          title: "📌 Daily Task Reminder",
          message: `Task "${task.title}" is in progress. Deadline: ${task.deadline}. Assigned to: ${userName} (${userEmail})`,
          type: 'INFO',
          timestamp: new Date().toISOString(),
          read: false,
          link: 'teams'
        };
        
        await setDbData(`notifications/${targetUserId}/${notifId}`, notification);
        console.log(`[Notifications] Sent reminder to ${userName} (${userEmail}) for task "${task.title}"`);

        // Send background push notification if FCM pushToken exists
        if (targetUser.pushToken) {
          try {
            await admin.messaging().send({
              token: targetUser.pushToken,
              notification: {
                title: "📌 Daily Task Reminder",
                body: `Task "${task.title}" is in progress. Deadline: ${task.deadline}.`
              },
              data: {
                link: 'teams',
                type: 'INFO'
              }
            });
            console.log(`[FCM] Sent background push notification to ${userName} (${userEmail})`);
          } catch (fcmError: any) {
            console.error(`[FCM] Failed to send push to user ${targetUserId}:`, fcmError.message);
          }
        }
      }
    }
  } catch (err: any) {
    console.error("[Notifications] Error in task notification trigger:", err.message);
  }
}

// Cron endpoint called by Vercel
app.get("/api/cron/notifications", async (req, res) => {
  try {
    await triggerDailyTaskNotifications();
    res.json({ success: true, message: "Daily task notifications triggered successfully" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

if (process.env.NODE_ENV === "production") {
  const distPath = path.join(process.cwd(), "dist");
  app.use(express.static(distPath));
  app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
}

export default app;
