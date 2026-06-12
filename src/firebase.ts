import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getDatabase } from 'firebase/database';
const firebaseConfig = {
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "studio-1045950084-89865",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:716181639100:web:edafc5eb847da8f6c625b9",
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCYl6kw9gHzr3o6rEQKDingVrn9drjZh6Y",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "studio-1045950084-89865.firebaseapp.com",
  firestoreDatabaseId: import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || "(default)",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "studio-1045950084-89865.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "716181639100",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || ""
};

// Use the explicit RTDB URL from the environment or fallback
const databaseURL = import.meta.env.VITE_FIREBASE_DATABASE_URL || "https://studio-1045950084-89865-default-rtdb.asia-southeast1.firebasedatabase.app";

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
