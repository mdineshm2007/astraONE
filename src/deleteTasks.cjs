
const admin = require('firebase-admin');
const fs = require('fs');

const serviceAccount = JSON.parse(fs.readFileSync('./firebase-admin-sdk.json', 'utf8'));

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

  // 2. Fetch all updates once to avoid indexing issues
  console.log("Fetching all task updates...");
  const allUpdatesSnapshot = await rtdb.ref('task_updates').get();
  const allUpdates = allUpdatesSnapshot.exists() ? allUpdatesSnapshot.val() : {};

  // 3. Delete Tasks and corresponding Updates
  const tasksRef = rtdb.ref('tasks');
  const snapshot = await tasksRef.get();
  
  if (snapshot.exists()) {
    const tasks = snapshot.val();
    let deletedCount = 0;

    for (const [id, task] of Object.entries(tasks)) {
      const title = task.title || "";
      if (title.toLowerCase().includes('chassis') || title.toLowerCase().includes('welding') || title.toLowerCase().includes('activation')) {
        console.log(`Deleting task: ${title} (${id})`);
        
        // Delete task
        await rtdb.ref(`tasks/${id}`).remove();
        
        // Filter and delete updates in memory
        for (const [updateId, update] of Object.entries(allUpdates)) {
          if (update.taskId === id) {
            console.log(`  Deleting associated update: ${updateId}`);
            await rtdb.ref(`task_updates/${updateId}`).remove();
          }
        }
        deletedCount++;
      }
    }
    console.log(`Successfully deleted ${deletedCount} tasks.`);
  }

  console.log("Cleanup complete.");
  process.exit(0);
}

cleanup().catch(err => {
  console.error("Cleanup failed:", err);
  process.exit(1);
});
