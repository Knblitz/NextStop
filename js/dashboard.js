// js/dashboard.js
import { auth, db } from './config.js';
import { 
    doc, 
    getDoc, 
    collection, 
    addDoc, 
    query, 
    onSnapshot, 
    orderBy, 
    deleteDoc,
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let currentGroupId = null;

// 1. INITIALIZE DASHBOARD & AUTH LISTENER
auth.onAuthStateChanged(async (user) => {
    if (user) {
        try {
            // Get user data to find their Group ID
            const userDoc = await getDoc(doc(db, "users", user.uid));
            
            if (userDoc.exists() && userDoc.data().currentGroupId) {
                currentGroupId = userDoc.data().currentGroupId;
                
                // Start listening for items and partner info
                loadItems(currentGroupId);
                getPartnerName(currentGroupId, user.uid);
            } else {
                // If no group, send them back to the lobby
                window.location.href = 'lobby.html';
            }
        } catch (error) {
            console.error("Dashboard initialization error:", error);
        }
    } else {
        // No user logged in
        window.location.href = 'index.html';
    }
});

// 2. GET PARTNER NAME
async function getPartnerName(groupId, myUid) {
    const groupDoc = await getDoc(doc(db, "groups", groupId));
    const members = groupDoc.data().members || [];
    
    // Find the ID in the array that isn't yours
    const partnerUid = members.find(uid => uid !== myUid);

    const infoElement = document.getElementById('partner-info');
    
    if (partnerUid) {
        const partnerDoc = await getDoc(doc(db, "users", partnerUid));
        if (partnerDoc.exists()) {
            infoElement.innerText = `Paired with ${partnerDoc.data().firstName}`;
        }
    } else {
        infoElement.innerText = "Waiting for partner to join...";
    }
}

// 3. LISTEN FOR ITEMS IN REAL-TIME
function loadItems(groupId) {
    const q = query(
        collection(db, "groups", groupId, "items"), 
        orderBy("createdAt", "desc")
    );

    // This updates the UI automatically whenever you or your partner adds/deletes
    onSnapshot(q, (snapshot) => {
        const listElement = document.getElementById('items-list');
        listElement.innerHTML = ''; 

        snapshot.forEach((itemDoc) => {
            const item = itemDoc.data();
            const itemDiv = document.createElement('div');
            itemDiv.className = 'item-card';
            
            itemDiv.innerHTML = `
                <div>
                    <p><strong>${item.title}</strong></p>
                    <a href="${item.url}" target="_blank">View Link</a>
                </div>
                <button class="delete-btn" onclick="deleteItem('${itemDoc.id}')">✕</button>
            `;
            listElement.appendChild(itemDiv);
        });
    });
}

// 4. ADD NEW ITEM (Global function for HTML button)
window.addItem = async () => {
    const titleInput = document.getElementById('item-title');
    const urlInput = document.getElementById('item-url');

    if (!titleInput.value || !urlInput.value) {
        alert("Please fill in both fields");
        return;
    }

    try {
        await addDoc(collection(db, "groups", currentGroupId, "items"), {
            title: titleInput.value,
            url: urlInput.value,
            addedBy: auth.currentUser.uid,
            createdAt: serverTimestamp()
        });
        
        // Clear inputs after success
        titleInput.value = '';
        urlInput.value = '';
    } catch (error) {
        console.error("Error adding item:", error);
    }
};

// 5. DELETE ITEM (Global function for list buttons)
window.deleteItem = async (itemId) => {
    if (confirm("Remove this from our list?")) {
        try {
            await deleteDoc(doc(db, "groups", currentGroupId, "items", itemId));
        } catch (error) {
            console.error("Error deleting item:", error);
        }
    }
};