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
    const members = Object.values(data) as UserProfile[];
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
    // Ensure UID is present from the key if it's missing in the value
    const members = Object.entries(data).map(([uid, val]: [string, any]) => ({
      ...val,
      uid: val.uid || uid
    })) as UserProfile[];

    const filtered = members.filter(profile => 
      profile.teams?.some(t => t.status === 'PENDING' && teamIds.includes(t.teamId))
    );
    callback(filtered);
  });
}


export async function approveMember(uid: string, teamId: string) {
  const userRef = ref(rtdb, `users/${uid}`);
  const snapshot = await get(userRef);
  
  if (snapshot.exists()) {
    const profile = snapshot.val() as UserProfile;
    const teams = profile.teams || [];
    const updatedTeams = teams.map(t => 
      t.teamId === teamId ? { ...t, status: 'APPROVED' as const } : t
    );
    const approvedTeams = updatedTeams.filter(t => t.status === 'APPROVED').map(t => t.teamId);
    await update(userRef, { teams: updatedTeams, approvedTeams });
  }
}

export async function rejectMember(uid: string, teamId: string) {
  const userRef = ref(rtdb, `users/${uid}`);
  const snapshot = await get(userRef);
  
  if (snapshot.exists()) {
    const profile = snapshot.val() as UserProfile;
    const teams = profile.teams || [];
    const updatedTeams = teams.filter(t => t.teamId !== teamId);
    const approvedTeams = updatedTeams.filter(t => t.status === 'APPROVED').map(t => t.teamId);
    await update(userRef, { teams: updatedTeams, approvedTeams });
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
    // Always pull uid from the database key in case it's missing in the value
    const users = Object.entries(data).map(([uid, val]: [string, any]) => ({
      ...val,
      uid: val.uid || uid,
    })) as UserProfile[];
    callback(users);
  });
}

export async function updateUserProfile(uid: string, updates: Partial<UserProfile>) {
  const userRef = ref(rtdb, `users/${uid}`);
  await update(userRef, updates);
}
