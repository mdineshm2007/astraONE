import { ref, push, set, query, limitToLast, get } from 'firebase/database';
import { rtdb } from '../firebase';

export async function logUserActivity(uid: string, action: string, details: any) {
  const logsRef = ref(rtdb, `logs/${uid}`);
  const newLogRef = push(logsRef);
  return set(newLogRef, {
    action,
    details,
    timestamp: new Date().toISOString()
  });
}

export async function getRecentLogs(uid: string, limit: number = 20) {
  const logsRef = ref(rtdb, `logs/${uid}`);
  const q = query(logsRef, limitToLast(limit));
  const snapshot = await get(q);
  if (!snapshot.exists()) return [];
  return Object.values(snapshot.val());
}
