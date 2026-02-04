// js/settings.js
import { auth, db } from './config.js';
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// 1. Pre-fill the form with existing data
auth.onAuthStateChanged(async (user) => {
    if (user) {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
            const data = userDoc.data();
            document.getElementById('edit-first-name').value = data.firstName || '';
            document.getElementById('edit-surname').value = data.surname || '';
        }
    } else {
        window.location.href = 'index.html';
    }
});

// 2. Handle Profile Update
window.updateProfile = async (e) => {
    const user = auth.currentUser;
    const newFirstName = document.getElementById('edit-first-name').value;
    const newSurname = document.getElementById('edit-surname').value;

    try {
        await updateDoc(doc(db, "users", user.uid), {
            firstName: newFirstName,
            surname: newSurname
        });
        alert("Profile updated successfully!");
    } catch (error) {
        console.error("Error updating profile:", error);
        alert("Update failed.");
    }
};

// 3. Handle Logout
window.logout = async () => {
    try {
        await signOut(auth);
        window.location.href = 'index.html';
    } catch (error) {
        console.error("Logout Error:", error);
    }
};