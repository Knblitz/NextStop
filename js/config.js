// js/config.js

// We use the "compat" or CDN version for standard HTML/JS projects
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDJ6H_wr6MHhTKUsNtJEaLbGAYK5CROpI8",
  authDomain: "nextstop-ab495.firebaseapp.com",
  projectId: "nextstop-ab495",
  storageBucket: "nextstop-ab495.firebasestorage.app",
  messagingSenderId: "831594247399",
  appId: "1:831594247399:web:6dd762aa06bcd2336a9e42",
  measurementId: "G-9LHV44XZ27"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export instances to use in other files
export const auth = getAuth(app);
export const db = getFirestore(app);
export const provider = new GoogleAuthProvider();