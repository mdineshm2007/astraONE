import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User, signInWithPopup, GoogleAuthProvider, signOut, signInWithCredential } from 'firebase/auth';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { ref, get, set, update, onValue, onDisconnect } from 'firebase/database';
import { auth, rtdb } from '../firebase';
import { UserProfile, UserRole } from '../types';
import { resolveNameFromEmail } from '../utils/userUtils';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: () => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  error: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Determine the correct role and initial teams from the user's email
function resolveRoleFromEmail(email: string): { role: UserRole; teams: { teamId: string; status: 'PENDING' | 'APPROVED' }[] } {
  const e = email.toLowerCase().trim();
  
  // Captains (Global Admin)
  const captains = [
    '727724eumc054@skcet.ac.in', // Kanishka (Captain)
    '727724eumc036@skcet.ac.in', // Haresh kumar (Vice Captain)
    '727724eumc011@skcet.ac.in', // Asma (Static Captain)
    '727725eumc604@skcet.ac.in', // Harish (Dynamic Captain)
    '727724eumc044@skcet.ac.in', // Janani (Manager, Cost & Steering Lead)
    '25mz122@skcet.ac.in',       // Dinesh (App Technician, Innovation Lead)
    '727725eumc608@skcet.ac.in'  // Nitheesh (PRO)
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log("[Auth] State changed:", firebaseUser?.email || "No user");
      
      // Clean up previous listeners
      if (unsubProfile) { 
        console.log("[Auth] Cleaning up previous profile listener");
        unsubProfile(); 
        unsubProfile = null; 
      }

      setUser(firebaseUser);

      if (!firebaseUser) {
        setProfile(null);
        setLoading(false);
        return;
      }

      // 1. Set loading to true while we fetch the new profile
      setLoading(true);

      const email = firebaseUser.email || '';
      const { role: correctRole, teams: initialTeams } = resolveRoleFromEmail(email);
      const userRef = ref(rtdb, `users/${firebaseUser.uid}`);

      // Helper for backend fallback
      const fetchProfileFallback = async (source: string) => {
        try {
          console.log(`[Auth] Attempting backend profile fallback (${source}) for:`, firebaseUser.uid);
          
          // Use AbortController for timeout
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10000);
          
          const response = await fetch(`/api/users/profile/${firebaseUser.uid}`, {
            signal: controller.signal
          });
          
          clearTimeout(timeout);
          
          if (response.ok) {
            const data = await response.json();
            console.log(`[Auth] Profile loaded successfully from backend (${source})`);
            setProfile(data);
            setLoading(false);
            setError(null);
            return true;
          } else {
            const errText = await response.text();
            console.warn(`[Auth] Backend fallback failed (${source}):`, response.status, errText);
            setError(`Backend Error ${response.status}: ${errText.slice(0, 50)}`);
          }
        } catch (e: any) {
          if (e.name === 'AbortError') {
            console.error(`[Auth] Backend fallback TIMED OUT (${source})`);
            setError("Handshake Timeout");
          } else {
            console.error(`[Auth] Backend fallback error (${source}):`, e.message);
            setError(`Handshake Error: ${e.message}`);
          }
        }
        return false;
      };

      // 2. Soft Timeout (5s): Try backend if RTDB is slow but keep waiting for RTDB
      const softTimeoutId = setTimeout(async () => {
        if (!profile) {
          console.warn("[Auth] RTDB slow - triggering early backend fallback");
          await fetchProfileFallback("soft-timeout");
        }
      }, 5000);

      // 3. Hard Safety Timeout (15s): Stop loading even if everything fails
      const hardTimeoutId = setTimeout(() => {
        if (loading) {
          console.warn("[Auth] Critical timeout - forcing loading to false");
          setLoading(false);
        }
      }, 15000);

      try {
        console.log("[Auth] Connecting to RTDB Profile Listener...");
        unsubProfile = onValue(userRef, async (snap) => {
          try {
            console.log("[Auth] RTDB Data received");
            clearTimeout(softTimeoutId);
            clearTimeout(hardTimeoutId);
            
            if (snap.exists()) {
              const data = snap.val();
              const existing = { ...data, uid: firebaseUser.uid } as UserProfile;
              setProfile(existing);
              
              // Background sync logic (don't block UI)
              const existingApproved = existing.approvedTeams || [];
              const correctApproved = initialTeams.filter(t => t.status === 'APPROVED').map(t => t.teamId);
              const isMissingTeams = correctApproved.some(id => !existingApproved.includes(id));
              
              if (existing.role !== correctRole || isMissingTeams) {
                console.log("[Auth] Auto-syncing profile permissions/roles");
                const mergedTeams = [...(existing.teams || [])];
                initialTeams.forEach(it => {
                  if (!mergedTeams.some(et => et.teamId === it.teamId)) {
                    mergedTeams.push(it);
                  } else if (it.status === 'APPROVED') {
                    const idx = mergedTeams.findIndex(et => et.teamId === it.teamId);
                    if (mergedTeams[idx].status === 'PENDING') mergedTeams[idx] = it;
                  }
                });
                await update(userRef, {
                  role: correctRole,
                  teams: mergedTeams,
                  approvedTeams: mergedTeams.filter(t => t.status === 'APPROVED').map(t => t.teamId),
                }).catch(e => {
                   if (e.message.includes('permission_denied')) {
                     console.warn("[Auth] Client-side update denied, backend will sync eventually.");
                   } else {
                     console.warn("[Auth] Background sync failed:", e.message);
                   }
                });
              }
            } else {
              console.log("[Auth] Profile missing in RTDB, creating default...");
              const newProfile: UserProfile = {
                uid: firebaseUser.uid,
                email,
                displayName: firebaseUser.displayName || resolveNameFromEmail(email),
                photoURL: firebaseUser.photoURL || '',
                role: correctRole,
                teams: initialTeams,
                approvedTeams: initialTeams.filter(t => t.status === 'APPROVED').map(t => t.teamId),
                createdAt: new Date().toISOString(),
                isOnline: true,
                lastActive: new Date().toISOString(),
              };
              
              setProfile(newProfile);
              await set(userRef, newProfile).catch(async (e) => {
                console.error("[Auth] Client-side profile creation denied, using backend proxy:", e.message);
                await fetchProfileFallback("creation-denied");
              });
            }
            setLoading(false);
          } catch (err) {
            console.error("[Auth] Listener callback error:", err);
            await fetchProfileFallback("callback-error");
          }
        }, async (error) => {
          console.error("[Auth] RTDB Listener Connection Error:", error);
          clearTimeout(softTimeoutId);
          clearTimeout(hardTimeoutId);
          
          // CRITICAL: If permission denied, trigger backend fallback IMMEDIATELY
          const isPermissionDenied = error.message.toLowerCase().includes('permission') || error.message.toLowerCase().includes('access_denied');
          if (isPermissionDenied) {
            console.warn("[Auth] Permission Denied from RTDB - bypassing to backend proxy");
          }
          
          const success = await fetchProfileFallback(isPermissionDenied ? "permission-denied" : "rtdb-error");
          if (!success) setLoading(false);
        });

        // Setup presence
        const statusRef = ref(rtdb, `users/${firebaseUser.uid}/isOnline`);
        const lastActiveRef = ref(rtdb, `users/${firebaseUser.uid}/lastActive`);
        update(userRef, { isOnline: true }).catch(e => console.warn("[Auth] Presence update failed:", e.message));
        onDisconnect(statusRef).set(false);
        onDisconnect(lastActiveRef).set(new Date().toISOString());

      } catch (err) {
        console.error("[Auth] Setup error:", err);
        clearTimeout(softTimeoutId);
        clearTimeout(hardTimeoutId);
        setLoading(false);
      }
    });

    return () => {
      unsubAuth();
      if (unsubProfile) unsubProfile();
    };
  }, []);

  const signIn = async () => {
    try {
      // Capacitor check: Use native Google Auth if available
      if ((window as any).Capacitor?.isNativePlatform()) {
        console.log("Using native Capacitor Google Auth");
        const result = await FirebaseAuthentication.signInWithGoogle();
        if (result.credential) {
          const credential = GoogleAuthProvider.credential(result.credential.idToken);
          await signInWithCredential(auth, credential);
          return;
        }
      }

      // Fallback to web popup
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error("Sign-In Error:", error);
      if (error.code === 'auth/popup-blocked') {
        alert("Sign-in popup was blocked. Please allow popups or use a supported browser.");
      } else if (error.code === 'auth/operation-not-supported-in-this-environment') {
        alert("Native authentication failed. If you are on Android, please ensure you have configured the Google SHA-1 in Firebase Console.");
      } else {
        alert("Authentication failed: " + error.message);
      }
    }
  };

  const logout = async () => {
    if (user) {
      try {
        const userRef = ref(rtdb, `users/${user.uid}`);
        await update(userRef, { isOnline: false, lastActive: new Date().toISOString() });
      } catch (err) {
        console.warn("Could not update online status during logout:", err);
      }
    }
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Sign out error:", err);
    }
  };

  const refreshProfile = async () => {
    await fetchProfileFallback("manual-refresh");
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, logout, refreshProfile, error }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
