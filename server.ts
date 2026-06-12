import express from "express";
import cors from "cors";
// Replaced vite middleware import 
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import dotenv from "dotenv";
import admin from "firebase-admin";
import { createFolder, uploadFile, getOrCreateFolder, createOAuth2Client } from "./src/services/driveService.ts";

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

// Determine the correct role and initial teams from the user's email (mirrored from AuthContext)
function resolveRoleFromEmail(email: string): { role: string; teams: { teamId: string; status: 'PENDING' | 'APPROVED' }[] } {
  const e = email.toLowerCase().trim();
  
  // Captains (Global Admin)
  const captains = [
    '727724eumc054@skcet.ac.in', // Kanishka (Captain)
    '727724eumc036@skcet.ac.in', // Haresh kumar (Vice Captain)
    '727724eumc011@skcet.ac.in', // Asma (Static Captain)
    '727725eumc604@skcet.ac.in', // Harish (Dynamic Captain)
    '727724eumc044@skcet.ac.in', // Janani (Manager, Cost & Steering Lead)
    '25mz122@skcet.ac.in',       // Dinesh (App Technician, Innovation Lead)
    '727725eumc608@skcet.ac.in', // Nitheesh (PRO)
    // 4th Year Ex-Captains
    '727723eumt119@skcet.ac.in', // Sanjiv (4th Year Ex-Captain)
    '727723eumt129@skcet.ac.in', // Sri Prenesh (4th Year Ex-Captain)
    '727723eumt125@skcet.ac.in', // Shenbaga Raja (4th Year Ex-Captain)
    '727723eumt092@skcet.ac.in', // Nitin (4th Year Ex-Captain)
    '727723eumt094@skcet.ac.in', // Owshik Johnson (4th Year Ex-Captain)
  ];

  if (captains.includes(e)) {
    const teams: { teamId: string; status: 'APPROVED' }[] = [];
    if (e === '727724eumc044@skcet.ac.in') teams.push({ teamId: 'steering', status: 'APPROVED' }, { teamId: 'cost', status: 'APPROVED' });
    if (e === '25mz122@skcet.ac.in') teams.push({ teamId: 'innovation', status: 'APPROVED' });
    if (e === '727725eumc608@skcet.ac.in') teams.push({ teamId: 'pro', status: 'APPROVED' });
    return { role: 'CAPTAIN', teams };
  }
  
  // Team Leads (Assigned Subsystems)
  if (e === '25mz096@skcet.ac.in') return { role: 'TEAM_LEAD', teams: [{ teamId: 'suspension', status: 'APPROVED' }] };
  if (e === '727724eumc114@skcet.ac.in') return { role: 'TEAM_LEAD', teams: [{ teamId: 'brakes', status: 'APPROVED' }] };
  if (e === '25mz021@skcet.ac.in') return { role: 'TEAM_LEAD', teams: [{ teamId: 'transmission', status: 'APPROVED' }] };
  if (e === '25mz045@skcet.ac.in') return { role: 'TEAM_LEAD', teams: [{ teamId: 'design', status: 'APPROVED' }] };
  if (e === '727724eumc093@skcet.ac.in') return { role: 'TEAM_LEAD', teams: [{ teamId: 'electrical', status: 'APPROVED' }] };
  if (e === '727724eumc026@skcet.ac.in') return { role: 'TEAM_LEAD', teams: [{ teamId: 'autonomous', status: 'APPROVED' }] };
  
  // Default: Team Member
  return { role: 'MEMBER', teams: [] };
}

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
  put: async (path: string, data: any) => {
    try {
      const cleanUrl = (process.env.FIREBASE_DATABASE_URL || "").replace(/\/$/, "");
      const cleanPath = path.startsWith("/") ? path : `/${path}`;
      const url = `${cleanUrl}${cleanPath}.json?auth=${process.env.FIREBASE_DATABASE_SECRET}`;
      const res = await fetch(url, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
      if (!res.ok) {
        const errText = await res.text();
        console.error(`[Firebase REST] PUT ${path} failed (${res.status}):`, errText);
        return null;
      }
      return res.json();
    } catch (e) {
      console.error(`[Firebase REST] PUT ${path} error:`, e);
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



app.post("/api/users/profile/:uid/update", async (req, res) => {
  try {
    const { uid } = req.params;
    const updates = req.body;
    if (!uid) return res.status(400).json({ error: "UID required" });
    
    if (admin.apps.length > 0) {
      await admin.database().ref(`users/${uid}`).update(updates);
    } else {
      await firebaseRest.update(`users/${uid}`, updates);
    }
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/users/teams/request", async (req, res) => {
  try {
    const { uid, teamIds } = req.body;
    if (!uid || !teamIds) return res.status(400).json({ error: "UID and teamIds required" });

    if (admin.apps.length > 0) {
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
      } else res.status(404).json({ error: "User not found" });
    } else {
      const profile = await firebaseRest.get(`users/${uid}`);
      if (profile) {
        const currentTeams = profile.teams || [];
        const newTeamRequests = teamIds
          .filter((id: string) => !currentTeams.some((t: any) => t.teamId === id))
          .map((id: string) => ({ teamId: id, status: 'PENDING' }));
        if (newTeamRequests.length > 0) {
          const updatedTeams = [...currentTeams, ...newTeamRequests];
          await firebaseRest.update(`users/${uid}`, { teams: updatedTeams });
        }
        res.json({ success: true });
      } else res.status(404).json({ error: "User not found" });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/admin/pending", async (req, res) => {
  try {
    const { teamIds } = req.query;
    const snapshot = await admin.database().ref('users').once("value");
    const data = snapshot.val() || {};
    const members = Object.entries(data).map(([key, val]: [string, any]) => ({
      ...val,
      uid: val.uid || key
    }));
    const targets = teamIds === 'all' ? ['all'] : (teamIds as string || '').split(',');
    const filtered = members.filter((profile: any) => {
      if (targets.includes('all')) return profile.teams?.some((t: any) => t.status === 'PENDING');
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
      const { code, state } = req.query;
      const baseUrl = getBaseUrl(req);

      if (!code || !state) return res.redirect(`http://localhost:3050/workspace?error=missing_params`);

      const oauth2Client = createOAuth2Client(`${baseUrl}/api/auth/google/callback`);
      const { tokens } = await oauth2Client.getToken(code as string);
      
      // Save tokens
      await admin.database().ref('drive_config/tokens').set(tokens);
      await admin.database().ref('drive_config/status').set({ connected: true, timestamp: Date.now() });
      await admin.database().ref(`users/${state}/drive_tokens`).set(tokens);

      res.redirect(`http://localhost:3050/workspace?auth=success`);
    } catch (error: any) {
      console.error("OAuth Redirect Error:", error);
      res.redirect(`http://localhost:3050/workspace?error=auth_failed`);
    }
  });



  // User Profile Endpoints
  app.get("/api/users/profile/:uid", async (req, res) => {
    try {
      const { uid } = req.params;
      if (!uid) return res.status(400).json({ error: "UID required" });

      console.log(`[Profile] Fetching profile for UID: ${uid}`);
      
      let profile = null;

      // 1. Try REST Fallback (using Secret) FIRST as it is currently the only reliable method
      try {
        console.log(`[Profile] Attempting REST (Secret) fetch for ${uid}`);
        profile = await firebaseRest.get(`users/${uid}`);
        if (profile) {
          console.log(`[Profile] Found via REST (Secret) for ${uid}`);
        }
      } catch (restError: any) {
        console.warn(`[Profile] REST fetch failed for ${uid}:`, restError.message);
      }

      // 2. Try Admin SDK as secondary fallback
      if (!profile && admin.apps.length > 0) {
        try {
          console.log(`[Profile] Attempting Admin SDK fetch for ${uid}`);
          const userRef = admin.database().ref(`users/${uid}`);
          const snapshot = await Promise.race([
            userRef.once("value"),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Admin SDK Timeout")), 5000))
          ]) as admin.database.DataSnapshot;
          
          if (snapshot.exists()) {
            profile = snapshot.val();
            console.log(`[Profile] Found via Admin SDK for ${uid}`);
          }
        } catch (adminError: any) {
          console.warn(`[Profile] Admin SDK failed for ${uid}:`, adminError.message);
        }
      }
      
      if (profile) {
        res.json(profile);
      } else {
        console.log(`[Profile] Profile not found for ${uid}, creating default`);
        try {
          // We can't always get userRecord if Admin Auth failed, so we'll construct a minimal profile
          let email = '';
          let displayName = '';
          let photoURL = '';

          try {
             const userRecord = await admin.auth().getUser(uid);
             email = userRecord.email || '';
             displayName = userRecord.displayName || email.split('@')[0];
             photoURL = userRecord.photoURL || '';
          } catch (e) {
             console.warn("[Profile] Admin Auth failed, creating skeleton profile");
             // If we don't have email, we might have to wait for frontend to provide it,
             // but for now let's return a 404 so the frontend can try to set it.
             return res.status(404).json({ error: "Profile not found and could not be retrieved from Auth" });
          }

          const { role, teams } = resolveRoleFromEmail(email);
          
          const newProfile = {
            uid,
            email,
            displayName,
            photoURL,
            role,
            teams,
            approvedTeams: teams.filter((t: any) => t.status === 'APPROVED').map((t: any) => t.teamId),
            createdAt: new Date().toISOString(),
            isOnline: true,
            lastActive: new Date().toISOString(),
          };
          
          // Try to save using REST
          await firebaseRest.update(`users/${uid}`, newProfile);
          res.json(newProfile);
        } catch (createError: any) {
          console.error("[Profile] Failed to create profile:", createError);
          res.status(500).json({ error: "Failed to create user profile" });
        }
      }
    } catch (error: any) {
      console.error("Profile Fetch Error:", error);
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

  // AI Assistant - Dynamic Assistant (Llama 3.1 8B / Custom Fine-tuned Models)
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


  // Automated Intelligence Analysis (Llama 3.3 70B)


  // Team-Specific Intelligence Analysis (Structured JSON)


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

// --- BOM & Finances Proxy Endpoints ---
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
    let newId = "";
    if (admin.apps.length > 0) {
      newId = admin.database().ref().push().key || Date.now().toString();
    } else {
      newId = Date.now().toString(); // Fallback ID
    }
    await firebaseRest.put(`finances/bom/${teamName}/${newId}`, newItem);
    res.json({ success: true, id: newId, data: newItem });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/bom/:teamName/:id", async (req, res) => {
  try {
    const { teamName, id } = req.params;
    await firebaseRest.update(`finances/bom/${teamName}/${id}`, req.body);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/bom/:teamName/:id", async (req, res) => {
  try {
    const { teamName, id } = req.params;
    await firebaseRest.remove(`finances/bom/${teamName}/${id}`);
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

  // Only listen locally, Vercel uses the exported app
  if (process.env.NODE_ENV !== "production") {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
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
    res.status(500).json({ error: "Analysis Engine Busy", detail: error.message });
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
    const { systemPrompt, userPrompt } = req.body;
    const completion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      model: "llama-3.1-8b-instant",
      temperature: 0.3,
      response_format: { type: "json_object" }
    });
    const content = completion.choices[0]?.message?.content || "{}";
    res.json(JSON.parse(content));
  } catch (error: any) {
    res.status(500).json({ error: "Analysis Engine Busy", detail: error.message });
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

// Helper to query/modify RTDB nodes dynamically (server-side)
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

// Local dev background scheduler checking every 30 seconds
let lastTriggeredTime = "";
setInterval(() => {
  const now = new Date();
  const options = { timeZone: 'Asia/Kolkata', hour12: false, hour: '2-digit', minute: '2-digit' } as const;
  const timeString = now.toLocaleTimeString('en-US', options); // e.g. "16:30" or "21:00"
  
  if ((timeString === "16:30" || timeString === "21:00") && timeString !== lastTriggeredTime) {
    lastTriggeredTime = timeString;
    console.log(`[Scheduler] Local trigger active: matches ${timeString} IST. Running daily task notifications...`);
    triggerDailyTaskNotifications().catch(err => {
      console.error('[Scheduler] Local trigger failed:', err);
    });
  }
}, 30000);

// Endpoint to trigger manually for testing
app.get("/api/cron/notifications", async (req, res) => {
  try {
    await triggerDailyTaskNotifications();
    res.json({ success: true, message: "Notifications manually triggered successfully" });
  } catch (error: any) {
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

export default app;
