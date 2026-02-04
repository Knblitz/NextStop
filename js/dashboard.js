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
        document.getElementById('user-code').textContent = data.userId || '---';
        if (data.photoURL) {
            document.getElementById('user-pfp').style.backgroundImage = `url('${data.photoURL}')`;
        }
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
        alert('Enter a 6-digit code');
        return;
    }

    try {
        const q = query(collection(db, "users"), where("userId", "==", code));
        const snap = await getDocs(q);

        if (snap.empty) {
            alert('User not found');
            return;
        }

        const friendUid = snap.docs[0].id;
        if (friendUid === currentUser.uid) {
            alert("That's your own code");
            return;
        }

        if (userFriends.includes(friendUid)) {
            alert('Already friends');
            return;
        }

        // Add bidirectional friendship
        await updateDoc(doc(db, "users", currentUser.uid), {
            friends: arrayUnion(friendUid)
        });
        await updateDoc(doc(db, "users", friendUid), {
            friends: arrayUnion(currentUser.uid)
        });

        input.value = '';
        await loadFriendsList();
        alert('Friend added!');
    } catch (error) {
        console.error('Error adding friend:', error);
        alert('Failed to add friend');
    }
};

// ===== LISTS MANAGEMENT =====
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
        personalSection.style.display = 'none';
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
        pairedSection.style.display = 'none';
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
        groupSection.style.display = 'none';
    }
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
    const title = document.getElementById('new-list-title').value.trim() || 'Untitled';
    const members = [currentUser.uid, ...selectedFriendsForModal];

    try {
        const inviteCode = await generateUniqueInviteCode();
        await addDoc(collection(db, 'lists'), {
            title,
            owner: currentUser.uid,
            members,
            inviteCode,
            createdAt: serverTimestamp()
        });

        alert(`List created! Invite code: ${inviteCode}`);
        closeModal('create-list-modal');
        await loadUserLists();
    } catch (error) {
        console.error('Error creating list from modal:', error);
        alert('Failed to create list');
    }
}

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

// ===== NOTIFICATIONS =====
function setupNotificationListener() {
    const userDoc = doc(db, "users", currentUser.uid);
    onSnapshot(userDoc, (snap) => {
        const data = snap.data();
        notifications = data?.notifications || [];
        updateNotificationBadge();
    });
}

window.toggleNotifications = () => {
    const modal = document.getElementById('notification-modal');
    modal.style.display = modal.style.display === 'none' ? 'flex' : 'none';
    renderNotifications();
};

function updateNotificationBadge() {
    const badge = document.getElementById('notification-badge');
    badge.style.display = notifications.length > 0 ? 'inline' : 'none';
}

function renderNotifications() {
    const notifList = document.getElementById('notification-list');
    notifList.innerHTML = '';

    if (notifications.length === 0) {
        notifList.innerHTML = '<p style="color:#999;">No notifications</p>';
        return;
    }

    notifications.forEach((notif, idx) => {
        const item = document.createElement('div');
        item.style.padding = '10px';
        item.style.borderBottom = '1px solid #eee';
        item.innerHTML = `
            <p>${notif.message}</p>
            <button onclick="clearNotification(${idx})" style="width:auto; padding:5px 10px; font-size:0.85rem;">Clear</button>
        `;
        notifList.appendChild(item);
    });
}

window.clearNotification = async (idx) => {
    notifications.splice(idx, 1);
    await updateDoc(doc(db, "users", currentUser.uid), {
        notifications
    });
    renderNotifications();
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