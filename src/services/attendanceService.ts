import { ref, push, set, update, remove, onValue } from 'firebase/database';
import { rtdb } from '../firebase';
import { TrainingSession } from '../types';

export async function createTrainingSession(session: Omit<TrainingSession, 'id'>) {
  try {
    const sessionsRef = ref(rtdb, 'training_sessions');
    const newSessionRef = push(sessionsRef);
    const now = new Date().toISOString();
    
    const sessionWithDefaults = {
      ...session,
      createdAt: now,
    };

    const cleanSession = JSON.parse(JSON.stringify(sessionWithDefaults));
    await set(newSessionRef, cleanSession);
    return newSessionRef.key;
  } catch (err) {
    console.error('createTrainingSession error:', err);
    throw err;
  }
}

export async function updateTrainingSession(id: string, updates: Partial<TrainingSession>) {
  try {
    const sessionRef = ref(rtdb, `training_sessions/${id}`);
    const cleanUpdates = JSON.parse(JSON.stringify(updates));
    await update(sessionRef, cleanUpdates);
  } catch (err) {
    console.error('updateTrainingSession error:', err);
    throw err;
  }
}

export async function deleteTrainingSession(id: string) {
  try {
    const sessionRef = ref(rtdb, `training_sessions/${id}`);
    await remove(sessionRef);
  } catch (err) {
    console.error('deleteTrainingSession error:', err);
    throw err;
  }
}

export function subscribeToTrainingSessions(callback: (sessions: TrainingSession[]) => void) {
  const sessionsRef = ref(rtdb, 'training_sessions');
  const unsub = onValue(sessionsRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) {
      callback([]);
      return;
    }
    const sessions = Object.entries(data).map(([id, val]: [string, any]) => ({ id, ...val } as TrainingSession));
    callback(sessions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
  }, (err) => {
    console.error('subscribeToTrainingSessions error:', err);
  });

  return unsub;
}
