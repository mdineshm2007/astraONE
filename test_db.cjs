const { initializeApp } = require('firebase/app');
const { getFirestore, collection, addDoc } = require('firebase/firestore');
const firebaseConfig = require('./firebase-applet-config.json');

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function testWrite() {
  console.log("Testing write to 'notes' in database:", firebaseConfig.firestoreDatabaseId);
  try {
    const docRef = await addDoc(collection(db, 'notes'), {
      title: 'Agent Test Note',
      content: 'If you see this, the database is finally working!',
      createdAt: new Date()
    });
    console.log("SUCCESS! Note written with ID:", docRef.id);
  } catch (e) {
    console.error("FAILURE! Error writing note:", e.message);
  }
  process.exit();
}

testWrite();
