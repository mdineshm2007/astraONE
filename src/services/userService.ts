import { ref, get, update, onValue, runTransaction } from 'firebase/database';
import { rtdb } from '../firebase';
import { UserProfile } from '../types';

export async function requestToJoinTeams(uid: string, teamIds: string[]) {
  const userRef = ref(rtdb, `users/${uid}`);
  const snapshot = await get(userRef);
  
  if (snapshot.exists()) {
    const profile = snapshot.val() as UserProfile;
    const currentTeams = profile.teams || [];
    
    // Filter out teams the user has already requested or joined
    const newTeamRequests = teamIds
      .filter(id => !currentTeams.some(t => t.teamId === id))
      .map(id => ({ teamId: id, status: 'PENDING' as const }));

    if (newTeamRequests.length > 0) {
      const updatedTeams = [...currentTeams, ...newTeamRequests];
      await update(userRef, { teams: updatedTeams });
    }
  }
}

export function subscribeToPendingMembers(teamId: string, callback: (members: UserProfile[]) => void) {
  const usersRef = ref(rtdb, 'users');
  
  return onValue(usersRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) {
      callback([]);
      return;
    }
    
    // Use entries to preserve the key as UID
    const members = Object.entries(data).map(([key, val]: [string, any]) => {
      const finalUid = (val && val.uid && typeof val.uid === 'string' && val.uid.length > 5) ? val.uid : key;
      return { ...val, uid: finalUid };
    }) as UserProfile[];

    const pending = members.filter(profile => {
      if (teamId === 'all') {
        return profile.teams?.some(t => t.status === 'PENDING');
      }
      return profile.teams?.some(t => t.teamId === teamId && t.status === 'PENDING');
    });
    callback(pending);
  });
}

/**
 * Subscribes to pending members across multiple teams and merges them.
 */
export function subscribeToMultipleTeamsPendingMembers(teamIds: string[], callback: (members: UserProfile[]) => void) {
  if (teamIds.length === 0) {
    callback([]);
    return () => {};
  }
  
  if (teamIds.includes('all')) {
    return subscribeToPendingMembers('all', callback);
  }

  const usersRef = ref(rtdb, 'users');
  return onValue(usersRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) {
      callback([]);
      return;
    }
    // Ensure UID is present from the key if it's missing or invalid in the value
    const members = Object.entries(data).map(([key, val]: [string, any]) => {
      const finalUid = (val && val.uid && typeof val.uid === 'string' && val.uid.length > 5) ? val.uid : key;
      return {
        ...val,
        uid: finalUid
      };
    }) as UserProfile[];

    const filtered = members.filter(profile => 
      profile.teams?.some(t => t.status === 'PENDING' && teamIds.includes(t.teamId))
    );
    callback(filtered);
  });
}


export async function approveMember(uid: string, teamId: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  
  try {
    const response = await fetch('/api/users/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid, teamId }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to approve member");
    }
  } catch (error: any) {
    if (error.name === 'AbortError') throw new Error("Approval timed out. Backend is not responding.");
    throw error;
  }
}

export async function rejectMember(uid: string, teamId: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch('/api/users/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid, teamId }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to reject member");
    }
  } catch (error: any) {
    if (error.name === 'AbortError') throw new Error("Rejection timed out. Backend is not responding.");
    throw error;
  }
}

export async function assignTeamHead(uid: string, teamId: string) {
  const userRef = ref(rtdb, `users/${uid}`);
  // Give HEAD role and approve them for this team
  const snapshot = await get(userRef);
  if (snapshot.exists()) {
    const profile = snapshot.val() as UserProfile;
    const teams = profile.teams?.filter(t => t.teamId !== teamId) || [];
    teams.push({ teamId, status: 'APPROVED' });
    const approvedTeams = teams.filter(t => t.status === 'APPROVED').map(t => t.teamId);
    await update(userRef, { role: 'TEAM_LEAD', teams, approvedTeams });
  }
}

export function subscribeToUsers(callback: (users: UserProfile[]) => void) {
  const usersRef = ref(rtdb, 'users');
  return onValue(usersRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) {
      callback([]);
      return;
    }
    // Always pull uid from the database key in case it's missing or invalid in the value
    const users = Object.entries(data).map(([key, val]: [string, any]) => {
      const finalUid = (val && val.uid && typeof val.uid === 'string' && val.uid.length > 5) ? val.uid : key;
      return {
        ...val,
        uid: finalUid,
      };
    }) as UserProfile[];
    callback(users);
  });
}

export async function updateUserProfile(uid: string, updates: Partial<UserProfile>) {
  const userRef = ref(rtdb, `users/${uid}`);
  await update(userRef, updates);
}
