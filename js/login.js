// js/login.js
import { auth, db, provider } from './config.js';
import { signInWithPopup } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

window.signInWithGoogle = async () => {
    try {
        const result = await signInWithPopup(auth, provider);
        const user = result.user;

        // Check if user already exists in Firestore
        const userDoc = await getDoc(doc(db, "users", user.uid));

        if (userDoc.exists()) {
            window.location.href = 'dashboard.html';
        } else {
            // First time login - go to setup to confirm details
            window.location.href = 'setup.html';
        }
    } catch (error) {
        console.error("Auth Error:", error);
        alert("Google Sign-In failed.");
    }
};