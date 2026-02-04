// js/setup.js
import { auth, db } from './config.js';
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

auth.onAuthStateChanged((user) => {
    if (user) {
        // Auto-fill the email and name from Google
        document.getElementById('email-display').value = user.email;
        
        // Split Google display name into First/Surname if possible
        const names = user.displayName ? user.displayName.split(' ') : ["", ""];
        document.getElementById('first-name').value = names[0];
        document.getElementById('surname').value = names.slice(1).join(' ');
    }
});

window.saveProfile = async () => {
    const user = auth.currentUser;
    const profileData = {
        email: user.email,
        firstName: document.getElementById('first-name').value,
        surname: document.getElementById('surname').value,
        photoURL: user.photoURL, // Keep their Google profile pic
        currentGroupId: null,
        createdAt: new Date()
    };

    await setDoc(doc(db, "users", user.uid), profileData);
    window.location.href = 'lobby.html';
};