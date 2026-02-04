// js/dashboard.js
import { auth, db } from './config.js';
import {
    doc,
    getDoc,
    collection,
    query,
    where,
    onSnapshot,
    addDoc,
    updateDoc,
    getDocs,
    deleteDoc,
    serverTimestamp,
    arrayUnion
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let currentUser = null;
let userFriends = [];
let userLists = { personal: [], paired: [], group: [] };
let notifications = [];

// ===== INITIALIZATION & AUTH =====
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        
        // Restore theme preference
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') {
            document.body.classList.add('dark-theme');
        } else {
            document.body.classList.remove('dark-theme');
        }
        
        try {
            await loadUserData();
            await loadFriendsList();
            await loadUserLists();
            setupSearchListener();
            setupNotificationListener();
        } catch (error) {
            console.error("Dashboard init error:", error);
        }
    } else {
        window.location.href = 'index.html';
    }
});

// ===== LOAD USER DATA =====
async function loadUserData() {
    const userDoc = await getDoc(doc(db, "users", currentUser.uid));
    if (userDoc.exists()) {
        const data = userDoc.data();
        // Ensure user has a friendCode; if not, generate and persist one
        if (!data.friendCode) {
            try {
                const generated = await generateUniqueFriendCode();
                await updateDoc(doc(db, "users", currentUser.uid), { friendCode: generated });
                document.getElementById('user-code').textContent = generated;
            } catch (err) {
                console.error('Failed to generate friendCode:', err);
                document.getElementById('user-code').textContent = '---';
            }
        } else {
            document.getElementById('user-code').textContent = data.friendCode || '---';
        }
        if (data.photoURL) {
            document.getElementById('user-pfp').style.backgroundImage = `url('${data.photoURL}')`;
        }
    }
}

// Local helper: generate a 6-digit numeric ID
const generate6DigitId_local = () => Math.floor(100000 + Math.random() * 900000).toString();

async function generateUniqueFriendCode() {
    let attempts = 0;
    while (attempts < 20) {
        const candidate = generate6DigitId_local();
        const q = query(collection(db, "users"), where("friendCode", "==", candidate));
        const snap = await getDocs(q);
        if (snap.empty) return candidate;
        attempts++;
    }
    throw new Error('Unable to generate unique friend code');
}

// Ensure existing user documents have required fields with correct types
async function ensureUserDocumentSchema() {
    try {
        const userRef = doc(db, "users", currentUser.uid);
        const snap = await getDoc(userRef);
        if (!snap.exists()) return;
        const data = snap.data();
        const updates = {};

        if (typeof data.currentGroupId === 'undefined') updates.currentGroupId = null;
        if (!Array.isArray(data.friends)) updates.friends = [];
        if (!Array.isArray(data.notifications)) updates.notifications = [];
        if (typeof data.privacyVisibility === 'undefined') updates.privacyVisibility = true;
        if (typeof data.privacyNotifications === 'undefined') updates.privacyNotifications = true;
        if (!data.photoURL) updates.photoURL = data.photoURL || '';
        if (!data.dateOfBirth) updates.dateOfBirth = data.dateOfBirth || null;

        // Ensure userId exists (string)
        if (!data.userId) {
            // generate a candidate and ensure uniqueness
            let attempts = 0;
            while (attempts < 20) {
                const candidate = generate6DigitId_local();
                const q = query(collection(db, "users"), where("userId", "==", candidate));
                const existing = await getDocs(q);
                if (existing.empty) {
                    updates.userId = candidate;
                    break;
                }
                attempts++;
            }
        }

        // Ensure friendCode exists (string) - we already generate in loadUserData if missing
        // Ensure createdAt exists
        if (!data.createdAt) updates.createdAt = serverTimestamp();

        if (Object.keys(updates).length > 0) {
            await updateDoc(userRef, updates);
        }
    } catch (err) {
        console.error('Error ensuring user schema:', err);
    }
}

// Helper: Get user name by UID
async function getUserName(uid) {
    try {
        const userDoc = await getDoc(doc(db, "users", uid));
        return userDoc.exists() ? (userDoc.data().firstName || 'User') : 'Unknown';
    } catch {
        return 'Unknown';
    }
}

// ===== FRIENDS MANAGEMENT =====
async function loadFriendsList() {
    const userDoc = await getDoc(doc(db, "users", currentUser.uid));
    userFriends = userDoc.data()?.friends || [];
    renderFriendsList();
}

function renderFriendsList() {
    const friendsListEl = document.getElementById('friends-list');
    friendsListEl.innerHTML = '';

    if (userFriends.length === 0) {
        friendsListEl.innerHTML = '<p style="color:#999; font-size:0.85rem;">No friends yet</p>';
        return;
    }

    userFriends.forEach(friendUid => {
        const friendEl = document.createElement('div');
        friendEl.className = 'friend-item';
        friendEl.textContent = '👤 Loading...';
        friendsListEl.appendChild(friendEl);

        // Fetch friend name
        getDoc(doc(db, "users", friendUid)).then(snap => {
            if (snap.exists()) {
                friendEl.textContent = `👤 ${snap.data().firstName || 'Friend'}`;
            }
        });
    });
}

window.addFriendFromSidebar = async () => {
    const input = document.getElementById('friend-code-input');
    const code = input.value.trim();

    if (!code) {
        alert('Enter a friend code');
        return;
    }

    try {
        // Search by friendCode instead of userId
        const q = query(collection(db, "users"), where("friendCode", "==", code));
        const snap = await getDocs(q);

        if (snap.empty) {
            alert('Friend code not found');
            return;
        }

        const friendUid = snap.docs[0].id;
        const friendName = snap.docs[0].data().firstName;
        
        if (friendUid === currentUser.uid) {
            alert("That's your own code");
            return;
        }

        if (userFriends.includes(friendUid)) {
            alert(`Already friends with ${friendName}`);
            return;
        }

        // Add bidirectional friendship
        await updateDoc(doc(db, "users", currentUser.uid), {
            friends: arrayUnion(friendUid)
        });
        await updateDoc(doc(db, "users", friendUid), {
            friends: arrayUnion(currentUser.uid)
        });

        // Log activity for new friend
        await addDoc(collection(db, "activity"), {
            timestamp: serverTimestamp(),
            type: "friend_added",
            userId: friendUid,
            fromUser: currentUser.uid,
            fromUserName: await getUserName(currentUser.uid),
            message: `${await getUserName(currentUser.uid)} added you as a friend`
        });

        input.value = '';
        await loadFriendsList();
        alert(`✅ Friend added: ${friendName}`);
    } catch (error) {
        console.error('Error adding friend:', error);
        alert('Failed to add friend: ' + (error.message || 'unknown error'));
    }
};

// Join a list using an invite code
window.joinListByInviteCode = async () => {
    const input = document.getElementById('list-invite-input');
    const code = input.value.trim();
    if (!code) return alert('Enter a list invite code');
    if (!currentUser) return alert('Please sign in first');

    try {
        const q = query(collection(db, 'lists'), where('inviteCode', '==', code));
        const snap = await getDocs(q);
        if (snap.empty) return alert('Invite code not found');

        const listDoc = snap.docs[0];
        const listRef = doc(db, 'lists', listDoc.id);
        const listData = listDoc.data();

        if ((listData.members || []).includes(currentUser.uid)) {
            alert('You are already a member of this list');
            return;
        }

        await updateDoc(listRef, { members: arrayUnion(currentUser.uid) });

        // Log activity for owner
        await addDoc(collection(db, 'activity'), {
            timestamp: serverTimestamp(),
            type: 'list_join',
            userId: listData.owner,
            listId: listDoc.id,
            listTitle: listData.title || 'Untitled',
            fromUser: currentUser.uid,
            fromUserName: await getUserName(currentUser.uid),
            message: `${await getUserName(currentUser.uid)} joined your list "${listData.title || 'Untitled'}"`
        });

        alert('Successfully joined list');
        input.value = '';
        await loadUserLists();
    } catch (err) {
        console.error('Error joining list by invite code:', err);
        alert('Failed to join list: ' + (err.message || 'unknown'));
    }
};

// ===== LISTS MANAGEMENT =====
// Check if current user is the owner (lead editor) of a list
async function isListOwner(listId) {
    const listDoc = await getDoc(doc(db, "lists", listId));
    return listDoc.exists() && listDoc.data().owner === currentUser.uid;
}

// Check if current user is a member of a list
async function isListMember(listId) {
    const listDoc = await getDoc(doc(db, "lists", listId));
    return listDoc.exists() && listDoc.data().members.includes(currentUser.uid);
}

// Get user role in a list (owner or member)
async function getUserRole(listId) {
    const isOwner = await isListOwner(listId);
    return isOwner ? 'owner' : 'member';
}

// Owner-only: Add a member to a list
async function addListMember(listId, newMemberUid) {
    if (!(await isListOwner(listId))) {
        throw new Error('Only the owner can add members');
    }
    
    const listDoc = await getDoc(doc(db, "lists", listId));
    if (listDoc.data().members.includes(newMemberUid)) {
        throw new Error('User is already a member');
    }
    
    await updateDoc(doc(db, "lists", listId), {
        members: arrayUnion(newMemberUid)
    });
    
    // Log activity
    const listTitle = listDoc.data().title;
    const currentUserName = await getUserName(currentUser.uid);
    await addDoc(collection(db, "activity"), {
        timestamp: serverTimestamp(),
        type: "list_member_added",
        userId: newMemberUid,
        listId: listId,
        listTitle: listTitle,
        fromUser: currentUser.uid,
        fromUserName: currentUserName,
        message: `${currentUserName} added you to "${listTitle}"`
    });
}

// Owner-only: Remove a member from a list
async function removeListMember(listId, memberUid) {
    if (!(await isListOwner(listId))) {
        throw new Error('Only the owner can remove members');
    }
    
    const listRef = doc(db, "lists", listId);
    const listDoc = await getDoc(listRef);
    const members = listDoc.data().members.filter(uid => uid !== memberUid);
    
    await updateDoc(listRef, { members });
}

// Owner-only: Rename list
async function renameList(listId, newTitle) {
    if (!(await isListOwner(listId))) {
        throw new Error('Only the owner can rename the list');
    }
    
    await updateDoc(doc(db, "lists", listId), {
        title: newTitle
    });
}

// Owner-only: Delete list
async function deleteList(listId) {
    if (!(await isListOwner(listId))) {
        throw new Error('Only the owner can delete the list');
    }
    
    await deleteDoc(doc(db, "lists", listId));
}
async function loadUserLists() {
    // Query lists where user is owner or member
    const listsSnapshot = await getDocs(
        query(
            collection(db, "lists"),
            where("members", "array-contains", currentUser.uid)
        )
    );

    userLists = { personal: [], paired: [], group: [] };

    listsSnapshot.forEach(listDoc => {
        const listData = listDoc.data();
        const listCard = {
            id: listDoc.id,
            title: listData.title || 'Untitled',
            members: listData.members || [],
            inviteCode: listData.inviteCode
        };

        const memberCount = listCard.members.length;
        if (listData.owner === currentUser.uid) {
            userLists.personal.push(listCard);
        } else if (memberCount === 2) {
            userLists.paired.push(listCard);
        } else if (memberCount >= 3) {
            userLists.group.push(listCard);
        }
    });

    renderLists();
}

function renderLists() {
    // Personal Lists
    const personalEl = document.getElementById('personal-lists');
    const personalSection = document.getElementById('personal-section');
    personalEl.innerHTML = '';
    if (userLists.personal.length > 0) {
        personalSection.style.display = 'block';
        userLists.personal.forEach(list => {
            personalEl.appendChild(createListCard(list));
        });
    } else {
        personalSection.style.display = 'block';
        personalEl.appendChild(createEmptyStateCard('No Personal lists yet. Create one now!', 'openCreateListModal()'));
    }

    // Paired Lists
    const pairedEl = document.getElementById('paired-lists');
    const pairedSection = document.getElementById('paired-section');
    pairedEl.innerHTML = '';
    if (userLists.paired.length > 0) {
        pairedSection.style.display = 'block';
        userLists.paired.forEach(list => {
            pairedEl.appendChild(createListCard(list));
        });
    } else {
        pairedSection.style.display = 'block';
        pairedEl.appendChild(createEmptyStateCard('No Paired lists yet. Invite a friend!', 'openCreateListModal()'));
    }

    // Group Lists
    const groupEl = document.getElementById('group-lists');
    const groupSection = document.getElementById('group-section');
    groupEl.innerHTML = '';
    if (userLists.group.length > 0) {
        groupSection.style.display = 'block';
        userLists.group.forEach(list => {
            groupEl.appendChild(createListCard(list));
        });
    } else {
        groupSection.style.display = 'block';
        groupEl.appendChild(createEmptyStateCard('No Group lists yet. Create one with friends!', 'openCreateListModal()'));
    }
}

function createEmptyStateCard(message, onclick) {
    const card = document.createElement('div');
    card.className = 'list-card empty-state-card';
    card.style.cursor = 'pointer';
    card.style.opacity = '0.6';
    card.innerHTML = `
        <div style="text-align: center; width: 100%;">
            <div style="font-size: 2rem; margin-bottom: 5px;">✨</div>
            <div style="font-size: 0.75rem; color: #999;">${message}</div>
        </div>
    `;
    card.onclick = () => eval(onclick);
    return card;
}

function createListCard(list) {
    const card = document.createElement('div');
    card.className = 'list-card';
    card.innerHTML = `
        <div style="text-align: center; width: 100%;">
            <div style="font-size: 1.4rem; margin-bottom: 5px;">📝</div>
            <div style="font-size: 0.85rem;">${list.title}</div>
            <div style="font-size: 0.7rem; color: #999;">${list.members.length} members</div>
        </div>
    `;
    card.onclick = () => goToList(list.id);
    return card;
}

window.createNewList = async () => {
    // Open modal-based create flow
    openCreateListModal();
};

// ----- CREATE LIST MODAL LOGIC -----
let modalFriends = []; // { uid, name, photoURL }
let selectedFriendsForModal = [];

function openCreateListModal() {
    const modal = document.getElementById('create-list-modal');
    document.getElementById('new-list-title').value = '';
    selectedFriendsForModal = [];
    renderCreateFriends([]);
    updateCreateTargetLabel();
    fetchFriendsForModal();
    modal.style.display = 'flex';
}
// Expose to global scope so inline onclick in HTML can call it
window.openCreateListModal = openCreateListModal;

async function fetchFriendsForModal() {
    try {
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        const friends = userDoc.data()?.friends || [];
        modalFriends = [];

        for (const uid of friends) {
            const snap = await getDoc(doc(db, 'users', uid));
            if (snap.exists()) {
                modalFriends.push({ uid, name: snap.data().firstName || (snap.data().username || 'Friend'), photoURL: snap.data().photoURL || '' });
            }
        }

        renderCreateFriends(modalFriends);
    } catch (error) {
        console.error('Error fetching friends for modal:', error);
    }
}

function renderCreateFriends(list) {
    const container = document.getElementById('create-friends-list');
    if (!container) return;
    container.innerHTML = '';

    if (list.length === 0) {
        container.innerHTML = '<div style="color:#999;">No friends available</div>';
        return;
    }

    list.forEach(f => {
        const el = document.createElement('div');
        el.className = 'friend-item';
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.gap = '8px';
        el.style.padding = '8px';
        el.style.cursor = 'pointer';
        el.dataset.uid = f.uid;

        const img = document.createElement('div');
        img.style.width = '36px';
        img.style.height = '36px';
        img.style.borderRadius = '50%';
        img.style.backgroundSize = 'cover';
        img.style.backgroundPosition = 'center';
        img.style.backgroundColor = '#ddd';
        if (f.photoURL) img.style.backgroundImage = `url('${f.photoURL}')`;

        const name = document.createElement('div');
        name.textContent = f.name;

        el.appendChild(img);
        el.appendChild(name);

        el.addEventListener('click', () => toggleFriendSelection(f.uid, el));
        container.appendChild(el);
    });
}

function toggleFriendSelection(uid, el) {
    const idx = selectedFriendsForModal.indexOf(uid);
    if (idx === -1) {
        selectedFriendsForModal.push(uid);
        el.classList.add('selected');
    } else {
        selectedFriendsForModal.splice(idx, 1);
        el.classList.remove('selected');
    }
    updateCreateTargetLabel();
}

function updateCreateTargetLabel() {
    const label = document.getElementById('create-target-label');
    const n = selectedFriendsForModal.length;
    if (n === 0) label.textContent = 'Target: Personal Section';
    else if (n === 1) label.textContent = 'Target: Paired Section';
    else label.textContent = 'Target: Group Section';
}

async function generateUniqueInviteCode() {
    const generate5 = () => Math.floor(10000 + Math.random() * 90000).toString();
    let attempts = 0;
    while (attempts < 20) {
        const candidate = generate5();
        const q = query(collection(db, 'lists'), where('inviteCode', '==', candidate));
        const snap = await getDocs(q);
        if (snap.empty) return candidate;
        attempts++;
    }
    throw new Error('Unable to generate unique invite code');
}

async function createListFromModal() {
    if (!currentUser) {
        alert('Please sign in to create lists');
        return;
    }

    const title = document.getElementById('new-list-title').value.trim() || 'Untitled';
    const members = Array.from(new Set([currentUser.uid, ...selectedFriendsForModal]));
    const currentUserName = await getUserName(currentUser.uid);

    try {
        const inviteCode = await generateUniqueInviteCode();
        const category = (document.getElementById('new-list-category')?.value) || 'general';
        const listRef = await addDoc(collection(db, 'lists'), {
            title,
            owner: currentUser.uid,
            members,
            inviteCode,
            category,
            createdAt: serverTimestamp()
        });
        const listId = listRef.id;

        // Log activities for invited members
        for (const friendUid of selectedFriendsForModal) {
            const friendName = await getUserName(friendUid);
            await addDoc(collection(db, "activity"), {
                timestamp: serverTimestamp(),
                type: "list_invite",
                userId: friendUid,
                listId: listId,
                listTitle: title,
                fromUser: currentUser.uid,
                fromUserName: currentUserName,
                message: `${currentUserName} invited you to "${title}"`
            });
        }

        // Display invite code in the modal footer and copy to clipboard option
        const inviteDisplay = document.getElementById('new-list-invite-display');
        if (inviteDisplay) {
            inviteDisplay.innerHTML = `Code: <b>${inviteCode}</b> <button id="copy-invite-btn" style="padding:4px 8px; border-radius:6px;">Copy</button>`;
            const copyBtn = document.getElementById('copy-invite-btn');
            if (copyBtn) copyBtn.addEventListener('click', async () => {
                try { await navigator.clipboard.writeText(inviteCode); alert('Invite code copied'); } catch { alert('Copy failed'); }
            });
        }
        closeModal('create-list-modal');
        await loadUserLists();
    } catch (error) {
        console.error('Error creating list from modal:', error);
        alert('Failed to create list: ' + (error.message || 'unknown error'));
    }
}

// Expose create action to global scope for inline onclick in HTML
window.createListFromModal = createListFromModal;

function goToList(listId) {
    window.location.href = `dashboard.html?list=${listId}`;
}

// ===== OMNI-SEARCH (Fuzzy Matching) =====
const fuzzyMatch = (searchTerm, text) => {
    let searchIndex = 0;
    for (let i = 0; i < text.length; i++) {
        if (text[i].toLowerCase() === searchTerm[searchIndex].toLowerCase()) {
            searchIndex++;
            if (searchIndex === searchTerm.length) return true;
        }
    }
    return false;
};

function setupSearchListener() {
    const searchInput = document.getElementById('omni-search');
    const resultsDropdown = document.getElementById('search-results');

    searchInput.addEventListener('input', async (e) => {
        const term = e.target.value.trim().toLowerCase();
        resultsDropdown.innerHTML = '';

        if (!term) {
            resultsDropdown.classList.remove('active');
            return;
        }

        // Search friends
        const friendResults = [];
        for (const friendUid of userFriends) {
            const friendDoc = await getDoc(doc(db, "users", friendUid));
            if (friendDoc.exists()) {
                const name = friendDoc.data().firstName || 'Friend';
                if (fuzzyMatch(term, name)) {
                    friendResults.push({ type: 'friend', name, uid: friendUid });
                }
            }
        }

        // Search lists
        const listResults = [];
        userLists.personal.concat(userLists.paired, userLists.group).forEach(list => {
            if (fuzzyMatch(term, list.title)) {
                listResults.push({ type: 'list', name: list.title, id: list.id });
            }
        });

        // Render results
        if (friendResults.length + listResults.length === 0) {
            resultsDropdown.innerHTML = '<div class="search-result-item">No results</div>';
        } else {
            if (friendResults.length > 0) {
                resultsDropdown.innerHTML += '<div class="search-result-category">Friends</div>';
                friendResults.forEach(result => {
                    const item = document.createElement('div');
                    item.className = 'search-result-item';
                    item.textContent = `👤 ${result.name}`;
                    resultsDropdown.appendChild(item);
                });
            }

            if (listResults.length > 0) {
                resultsDropdown.innerHTML += '<div class="search-result-category">Lists</div>';
                listResults.forEach(result => {
                    const item = document.createElement('div');
                    item.className = 'search-result-item';
                    item.textContent = `📝 ${result.name}`;
                    item.onclick = () => goToList(result.id);
                    resultsDropdown.appendChild(item);
                });
            }
        }

        resultsDropdown.classList.add('active');
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-wrapper')) {
            resultsDropdown.classList.remove('active');
        }
    });
}

// ===== NOTIFICATIONS & ACTIVITY =====
let unreadActivities = [];

function setupNotificationListener() {
    // Listen for activities directed at the current user
    const q = query(
        collection(db, "activity"),
        where("userId", "==", currentUser.uid)
    );
    
    onSnapshot(q, (snapshot) => {
        unreadActivities = [];
        snapshot.forEach((doc) => {
            unreadActivities.push({ id: doc.id, ...doc.data() });
        });
        updateNotificationBadge();
    });
}

window.toggleNotifications = () => {
    const modal = document.getElementById('notification-modal');
    modal.style.display = modal.style.display === 'none' ? 'flex' : 'none';
    renderActivities();
};

function updateNotificationBadge() {
    const badge = document.getElementById('notification-badge');
    badge.style.display = unreadActivities.length > 0 ? 'inline' : 'none';
    if (unreadActivities.length > 0) {
        badge.textContent = unreadActivities.length > 9 ? '9+' : unreadActivities.length;
    }
}

function renderActivities() {
    const activityList = document.getElementById('notification-list');
    activityList.innerHTML = '';

    if (unreadActivities.length === 0) {
        activityList.innerHTML = '<p style="color:#999; text-align: center; padding: 20px;">No activities yet</p>';
        return;
    }

    unreadActivities.forEach((activity, idx) => {
        const item = document.createElement('div');
        item.style.padding = '12px 15px';
        item.style.borderBottom = '1px solid var(--border)';
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.alignItems = 'center';
        
        const icon = activity.type === 'list_invite' ? '📋' : activity.type === 'friend_added' ? '👥' : '📝';
        
        item.innerHTML = `
            <div>
                <p style="margin: 0; font-weight: 600;">${icon} ${activity.message}</p>
                <small style="color: #999;">${new Date(activity.timestamp?.toDate?.() || Date.now()).toLocaleDateString()}</small>
            </div>
            <button onclick="clearActivity('${activity.id}')" style="width:auto; padding:5px 10px; font-size:0.8rem;">✕</button>
        `;
        activityList.appendChild(item);
    });
}

window.clearActivity = async (activityId) => {
    try {
        await deleteDoc(doc(db, "activity", activityId));
        unreadActivities = unreadActivities.filter(a => a.id !== activityId);
        updateNotificationBadge();
        renderActivities();
    } catch (error) {
        console.error('Error clearing activity:', error);
    }
};

window.closeModal = (modalId) => {
    document.getElementById(modalId).style.display = 'none';
};

// ===== UTILS =====
window.toggleTheme = () => {
    document.body.classList.toggle('dark-theme');
    localStorage.setItem('theme', document.body.classList.contains('dark-theme') ? 'dark' : 'light');
};

window.goToSettings = () => {
    window.location.href = 'settings.html';
};

window.logout = async () => {
    await auth.signOut();
    window.location.href = 'index.html';
}; 