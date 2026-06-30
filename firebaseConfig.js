// firebaseConfig.js
import { initializeApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getAuth, browserLocalPersistence, setPersistence } from "firebase/auth"; 
// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_API_KEY, 
  authDomain: "financial-friend-8988d.firebaseapp.com",
  projectId: "financial-friend-8988d",
  storageBucket: "financial-friend-8988d.firebasestorage.app",
  messagingSenderId: "681849131234",
  appId: "1:681849131234:web:e39271a046ac352d008ebb"
};

// Initialize Firebase Core Engine
const app = initializeApp(firebaseConfig);

// Initialize Firestore with robust local offline cache synchronization enabled
const db = initializeFirestore(app, {
  localCache: persistentLocalCache(
    { tabManager: persistentMultipleTabManager() }
  )
});

// Initialize Web Auth Engine
const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence);

export { db, auth };