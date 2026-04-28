import { ref, get, set, update, remove, onValue } from 'firebase/database';
import { rtdb } from '../firebase';
import { Subsystem } from '../types';

export const DEFAULT_SUBSYSTEMS: Subsystem[] = [
  { id: 'steering', name: 'Steering', headName: 'Janani', progress: 0, status: 'Active', color: '#7dd3fc', headId: '', riskScore: 0, readiness: 0, pendingTasks: 0 },
  { id: 'suspension', name: 'Suspension', headName: 'Yugesh', progress: 0, status: 'Active', color: '#ff6b6b', headId: '', riskScore: 0, readiness: 0, pendingTasks: 0 },
  { id: 'brakes', name: 'Brakes', headName: 'Siddarthan', progress: 0, status: 'Active', color: '#fca5a5', headId: '', riskScore: 0, readiness: 0, pendingTasks: 0 },
  { id: 'transmission', name: 'Transmission', headName: 'Sanjeevi', progress: 0, status: 'Active', color: '#fdba74', headId: '', riskScore: 0, readiness: 0, pendingTasks: 0 },
  { id: 'design', name: 'Design', headName: 'Rishi Karthick', progress: 0, status: 'Active', color: '#f472b6', headId: '', riskScore: 0, readiness: 0, pendingTasks: 0 },
  { id: 'electrical', name: 'Electricals', headName: 'Sanjay', progress: 0, status: 'Active', color: '#fde047', headId: '', riskScore: 0, readiness: 0, pendingTasks: 0 },
  { id: 'innovation', name: 'Innovation', headName: 'Dinesh', progress: 0, status: 'Active', color: '#86efac', headId: '', riskScore: 0, readiness: 0, pendingTasks: 0 },
  { id: 'autonomous', name: 'Autonomous', headName: 'Dheeshith', progress: 0, status: 'Active', color: '#c084fc', headId: '', riskScore: 0, readiness: 0, pendingTasks: 0 },
  { id: 'cost', name: 'COST', headName: 'Janani', progress: 0, status: 'Active', color: '#94a3b8', headId: '', riskScore: 0, readiness: 0, pendingTasks: 0 },
  { id: 'pro', name: 'PRO', headName: 'Nitheesh', progress: 0, status: 'Active', color: '#38bdf8', headId: '', riskScore: 0, readiness: 0, pendingTasks: 0 }
];

export async function seedSubsystems() {
  const subsystemsRef = ref(rtdb, 'subsystems');
  const snapshot = await get(subsystemsRef);
  
  if (!snapshot.exists() || Object.keys(snapshot.val()).length < 10) {
    for (const sub of DEFAULT_SUBSYSTEMS) {
      await set(ref(rtdb, `subsystems/${sub.id}`), {
        ...sub,
        headId: '',
        riskScore: 0,
        readiness: sub.progress,
        pendingTasks: 0
      });
    }
  }
}

export function subscribeToSubsystems(callback: (subsystems: Subsystem[]) => void) {
  const subsystemsRef = ref(rtdb, 'subsystems');

  return onValue(subsystemsRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) {
      callback(DEFAULT_SUBSYSTEMS);
      return;
    }
    const subsystems = Object.entries(data).map(([id, val]: [string, any]) => ({ ...val, id }));
    callback(subsystems);
  }, (error) => {
    console.error("Error fetching subsystems, falling back to local data:", error);
    callback(DEFAULT_SUBSYSTEMS);
  });
}

export async function createSubsystem(subsystem: Subsystem) {
  return set(ref(rtdb, `subsystems/${subsystem.id}`), subsystem);
}

export async function deleteSubsystem(id: string) {
  return remove(ref(rtdb, `subsystems/${id}`));
}

export async function updateSubsystem(id: string, updates: Partial<Subsystem>) {
  const sRef = ref(rtdb, `subsystems/${id}`);
  return update(sRef, updates);
}

