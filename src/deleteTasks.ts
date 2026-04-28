
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

// Read the service account key
const serviceAccount = JSON.parse(fs.readFileSync('./firebase-admin-sdk.json', 'utf8'));

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://studio-1045950084-89865-default-rtdb.asia-southeast1.firebasedatabase.app/"
});

const rtdb = admin.database();

async function cleanup() {
  console.log("Starting cleanup...");

  // 1. Delete Competitions
  console.log("Deleting competitions node...");
  await rtdb.ref('competitions').remove();

  // 2. Delete Tasks and Updates
  const tasksRef = rtdb.ref('tasks');
  const snapshot = await tasksRef.get();
  
  if (snapshot.exists()) {
    const tasks = snapshot.val();
    const taskIdsToDelete: string[] = [];

    for (const [id, task] of Object.entries(tasks)) {
      const title = (task as any).title || "";
      if (title.toLowerCase().includes('chassis') || title.toLowerCase().includes('welding') || title.toLowerCase().includes('activation')) {
        console.log(`Found task to delete: ${title} (${id})`);
        taskIdsToDelete.push(id);
      }
    }

    if (taskIdsToDelete.length > 0) {
      console.log(`Deleting ${taskIdsToDelete.length} tasks...`);
      for (const id of taskIdsToDelete) {
        // Delete task
        await rtdb.ref(`tasks/${id}`).remove();
        
        // Find and delete associated updates
        const updatesRef = rtdb.ref('task_updates');
        const updatesSnapshot = await updatesRef.orderByChild('taskId').equalTo(id).get();
        if (updatesSnapshot.exists()) {
          const updates = updatesSnapshot.val();
          for (const updateId of Object.keys(updates)) {
            await rtdb.ref(`task_updates/${updateId}`).remove();
          }
        }
      }
    }
  }

  console.log("Cleanup complete.");
  process.exit(0);
}

cleanup().catch(err => {
  console.error("Cleanup failed:", err);
  process.exit(1);
});
