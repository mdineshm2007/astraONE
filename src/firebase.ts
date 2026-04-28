import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getDatabase } from 'firebase/database';
import firebaseConfig from '../firebase-applet-config.json';

// Use the explicit RTDB URL from the environment or fallback
const databaseURL = "https://studio-1045950084-89865-default-rtdb.asia-southeast1.firebasedatabase.app/";

const app = initializeApp({
  ...firebaseConfig,
  databaseURL
});

console.log("Firebase App Initialized:", firebaseConfig.projectId);
console.log("RTDB URL:", databaseURL);

export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId === '(default)' ? undefined : firebaseConfig.firestoreDatabaseId);
export const rtdb = getDatabase(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
