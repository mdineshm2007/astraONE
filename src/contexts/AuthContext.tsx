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

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log("Auth state changed:", firebaseUser?.email || "No user");
      if (unsubProfile) { unsubProfile(); unsubProfile = null; }
      setUser(firebaseUser);

      if (!firebaseUser) {
        setProfile(null);
        setLoading(false);
        return;
      }

      // Safety timeout to ensure app opens even if DB is slow
      const timeoutId = setTimeout(() => {
        setLoading(false);
        console.warn("Auth setup timed out - opening app anyway");
      }, 15000);

      try {
        const email = firebaseUser.email || '';
        const { role: correctRole, teams: initialTeams } = resolveRoleFromEmail(email);
        const userRef = ref(rtdb, `users/${firebaseUser.uid}`);
        
        // Use a single onValue for both initialization and updates
        unsubProfile = onValue(userRef, async (snap) => {
          console.log("Profile data received from RTDB");
          clearTimeout(timeoutId);
          
          if (snap.exists()) {
            const existing = { ...snap.val(), uid: firebaseUser.uid } as UserProfile;
            setProfile(existing);
            
            // Background check for role/team updates
            const existingApproved = existing.approvedTeams || [];
            const correctApproved = initialTeams.filter(t => t.status === 'APPROVED').map(t => t.teamId);
            const isMissingTeams = correctApproved.some(id => !existingApproved.includes(id));
            if (existing.role !== correctRole || isMissingTeams) {
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
              });
            }
          } else {
            console.log("Creating new user profile in RTDB");
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
            await set(userRef, newProfile);
            setProfile(newProfile);
          }
          setLoading(false);
        }, (error) => {
          console.error("RTDB Profile Error:", error);
          clearTimeout(timeoutId);
          setLoading(false);
        });

        // Setup online status and presence separately
        const statusRef = ref(rtdb, `users/${firebaseUser.uid}/isOnline`);
        const lastActiveRef = ref(rtdb, `users/${firebaseUser.uid}/lastActive`);
        update(userRef, { isOnline: true }).catch(e => console.warn("Presence update failed:", e));
        onDisconnect(statusRef).set(false);
        onDisconnect(lastActiveRef).set(new Date().toISOString());

      } catch (error) {
        console.error('Error setting up user profile:', error);
        clearTimeout(timeoutId);
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
      const userRef = ref(rtdb, `users/${user.uid}`);
      await update(userRef, { isOnline: false, lastActive: new Date().toISOString() });
    }
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
