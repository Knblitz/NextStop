// js/lobby.js
import { auth, db } from './config.js';
import { 
    doc, 
    setDoc, 
    updateDoc, 
    getDoc, 
    collection, 
    query, 
    where, 
    getDocs,
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// --- HELPERS ---
// Generates a 6-character alphanumeric code
const generateInviteCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();

// --- CREATE GROUP ---
window.createGroup = async () => {
    const user = auth.currentUser;
    if (!user) return alert("Please sign in first.");

    const inviteCode = generateInviteCode();
    // Unique ID for the group document
    const groupId = `group_${user.uid}_${Date.now()}`;

    try {
        // 1. Create the Group document in the 'groups' collection
        await setDoc(doc(db, "groups", groupId), {
            inviteCode: inviteCode,
            admin: user.uid,
            members: [user.uid],
            createdAt: serverTimestamp()
        });

        // 2. Link the current User's profile to this new Group ID
        await updateDoc(doc(db, "users", user.uid), {
            currentGroupId: groupId
        });

        // Update UI to show the code to share
        const codeDisplay = document.getElementById('display-code');
        if (codeDisplay) {
            codeDisplay.innerText = `Your Code: ${inviteCode}`;
        }
        
        alert("Group Created! Share this code with your partner.");
        
        // After a short delay, move to dashboard
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 3000);

    } catch (error) {
        console.error("Error creating group:", error);
        alert("Failed to create group. Check console.");
    }
};

// --- JOIN GROUP ---
window.joinGroup = async () => {
    const user = auth.currentUser;
    const codeInput = document.getElementById('join-input').value.trim().toUpperCase();

    if (!user) return alert("Please sign in first.");
    if (!codeInput) return alert("Please enter a code.");

    try {
        // 1. Search for a group that has this specific inviteCode
        const q = query(collection(db, "groups"), where("inviteCode", "==", codeInput));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            alert("Invalid Code! Please check with your partner.");
            return;
        }
 
        // Get the first matching group document
        const groupDoc = querySnapshot.docs[0];
        const groupId = groupDoc.id;
        const groupData = groupDoc.data();

        // 2. Check if user is already a member
        if (groupData.members.includes(user.uid)) {
            window.location.href = 'dashboard.html';
            return;
        }

        // 3. Update Group members list (Add your UID to the array)
        const updatedMembers = [...groupData.members, user.uid];
        await updateDoc(doc(db, "groups", groupId), {
            members: updatedMembers
        });

        // 4. Update your User profile to link to this Group
        await updateDoc(doc(db, "users", user.uid), {
            currentGroupId: groupId
        });

        alert("Successfully joined the group!");
        window.location.href = 'dashboard.html';

    } catch (error) {
        console.error("Error joining group:", error);
        alert("Failed to join group.");
    }
};