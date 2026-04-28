import { ref, push, set, update, remove, onValue, query, orderByChild, equalTo, serverTimestamp, runTransaction, get } from 'firebase/database';
import { rtdb } from '../firebase';
import { Task, TaskUpdate } from '../types';

const LOCAL_TASKS_KEY = 'astra_tasks_cache';

export function subscribeToTasks(subsystem: string | null, callback: (tasks: Task[]) => void) {
  const tasksRef = ref(rtdb, 'tasks');
  
  // Load from cache first for instant UI
  const cached = localStorage.getItem(LOCAL_TASKS_KEY);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      const filtered = subsystem ? parsed.filter((t: any) => t.subsystem === subsystem) : parsed;
      callback(filtered);
    } catch (e) {
      console.warn("Failed to load task cache");
    }
  }

  const unsub = onValue(tasksRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) {
      callback([]);
      localStorage.setItem(LOCAL_TASKS_KEY, JSON.stringify([]));
      return;
    }
    const tasks = Object.entries(data).map(([id, val]: [string, any]) => ({ id, ...val } as Task));
    
    // Save to cache
    localStorage.setItem(LOCAL_TASKS_KEY, JSON.stringify(tasks));
    
    const filtered = subsystem ? tasks.filter(t => t.subsystem === subsystem) : tasks;
    callback(filtered.sort((a, b) => new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime()));
  }, (err) => {
    console.error('subscribeToTasks error:', err);
  });

  return unsub;
}

export function subscribeToTasksByAssignee(userId: string, callback: (tasks: Task[]) => void) {
  const tasksRef = ref(rtdb, 'tasks');
  const unsub = onValue(tasksRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) {
      callback([]);
      return;
    }
    const tasks = Object.entries(data)
      .map(([id, val]: [string, any]) => ({ id, ...val } as Task))
      .filter(t => t.assignedToId === userId);
    callback(tasks.sort((a, b) => new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime()));
  });
  return unsub;
}

export async function createTask(task: Omit<Task, 'id'>) {
  try {
    const tasksRef = ref(rtdb, 'tasks');
    const newTaskRef = push(tasksRef);
    const now = new Date().toISOString();
    
    // Default values for new fields
    const taskWithDefaults = {
      ...task,
      workstream: task.workstream || 'R&D',
      startDate: task.startDate || now,
      progressPercent: 0,
      createdAt: now,
      updatedAt: now,
    };

    const cleanTask = JSON.parse(JSON.stringify(taskWithDefaults));
    await set(newTaskRef, cleanTask);

    // Update subsystem pending count
    const subsRef = ref(rtdb, `subsystems/${task.subsystem}/pendingTasks`);
    await runTransaction(subsRef, (current) => (current || 0) + 1);
    
    return newTaskRef.key;
  } catch (err) {
    console.error('createTask error:', err);
    throw err;
  }
}

export async function updateTask(taskId: string, updates: Partial<Task>, oldTask?: Task) {
  const taskRef = ref(rtdb, `tasks/${taskId}`);
  const now = new Date().toISOString();

  try {
    const cleanUpdates = JSON.parse(JSON.stringify(updates));
    const finalUpdates = { ...cleanUpdates, updatedAt: now };

    if (updates.status === 'COMPLETED' && oldTask?.status !== 'COMPLETED') {
      await update(taskRef, finalUpdates);
      const subsRef = ref(rtdb, `subsystems/${oldTask!.subsystem}/pendingTasks`);
      await runTransaction(subsRef, (current) => (current || 0) - 1);
    } else {
      await update(taskRef, finalUpdates);
    }
  } catch (err) {
    console.error('updateTask error:', err);
    throw err;
  }
}

export async function deleteTask(taskId: string, subsystemId: string) {
  try {
    // 1. Delete all associated task updates
    const updatesRef = ref(rtdb, 'task_updates');
    const updatesQuery = query(updatesRef, orderByChild('taskId'), equalTo(taskId));
    const snapshot = await get(updatesQuery);
    
    if (snapshot.exists()) {
      const updates = snapshot.val();
      const deletePromises = Object.keys(updates).map(updateId => 
        remove(ref(rtdb, `task_updates/${updateId}`))
      );
      await Promise.all(deletePromises);
    }

    // 2. Delete the task itself
    await remove(ref(rtdb, `tasks/${taskId}`));
    
    // 3. Update the pending task count for the subsystem
    const subsRef = ref(rtdb, `subsystems/${subsystemId}/pendingTasks`);
    await runTransaction(subsRef, (current) => (current || 0) - 1);
  } catch (err) {
    console.error('deleteTask error:', err);
    throw err;
  }
}

export async function saveTaskUpdate(updateData: Omit<TaskUpdate, 'id'>) {
  try {
    const cleanData = JSON.parse(JSON.stringify(updateData)); // Safely strip undefined values
    const dateStr = new Date().toISOString().split('T')[0];
    
    // Create a deterministic key: taskId_userId_date
    // This ensures only ONE update per member per task per day exists.
    const updateKey = `${updateData.taskId}_${updateData.userId}_${dateStr}`;
    const updateRef = ref(rtdb, `task_updates/${updateKey}`);
    
    await set(updateRef, {
      ...cleanData,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('saveTaskUpdate error:', err);
  }
}

export function subscribeToTaskUpdates(taskId: string, callback: (updates: TaskUpdate[]) => void) {
  const updatesRef = ref(rtdb, 'task_updates');
  return onValue(updatesRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) {
      callback([]);
      return;
    }
    const updates = Object.entries(data)
      .map(([id, val]: [string, any]) => ({ id, ...val } as TaskUpdate));
    
    const filtered = taskId 
      ? updates.filter(u => u.taskId === taskId)
      : updates;

    callback(filtered.sort((a, b) => new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime()));
  });
}

