const admin = require('firebase-admin');
const fs = require('fs');

const serviceAccount = JSON.parse(fs.readFileSync('./firebase-admin-sdk.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://studio-1045950084-89865-default-rtdb.asia-southeast1.firebasedatabase.app" // I'll try to guess or find this
});

async function countUsers() {
  try {
    const db = admin.database();
    const ref = db.ref('users');
    const snapshot = await ref.once('value');
    if (snapshot.exists()) {
      const users = snapshot.val();
      const emails = Object.values(users).map(u => u.email).filter(Boolean);
      console.log(`Total users in database: ${emails.length}`);
      console.log("Emails:");
      emails.forEach(email => console.log(`- ${email}`));
    } else {
      console.log("No users found in database.");
    }
  } catch (error) {
    console.error("Error fetching users:", error.message);
  }
  process.exit();
}

countUsers();
