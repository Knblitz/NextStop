# NextStop Social & List Management - Implementation Guide

## Quick Reference

### 1. Friend Code System

**What**: Each user gets a unique 6-digit friend code (not their user ID)

**Generation** (setup.js):
```javascript
async function generateUniqueFriendCode() {
    let attempts = 0;
    while (attempts < 20) {
        const candidate = generate6DigitId(); // e.g., "382915"
        const q = query(collection(db, "users"), where("friendCode", "==", candidate));
        const snap = await getDocs(q);
        if (snap.empty) return candidate;
        attempts++;
    }
}
```

**Stored in Firestore**:
```json
{
  "uid": "google-auth-uid",
  "friendCode": "382915",
  "userId": "845729"  // Legacy, keep for backward compatibility
}
```

**Display to User**: Top-right chip in dashboard shows friendCode (uppercase)

---

### 2. Adding Friends by Code

**Trigger**: User clicks "Add" button in sidebar after entering friend's code

**Flow**:
1. Search `users` collection by `friendCode` (case-insensitive)
2. If found, add both UIDs to each other's `friends` arrays (bidirectional)
3. Log activity to `activity` collection with type "friend_added"
4. Display success message with friend's name

**Code** (dashboard.js):
```javascript
window.addFriendFromSidebar = async () => {
    const code = input.value.trim().toUpperCase();
    const q = query(collection(db, "users"), where("friendCode", "==", code));
    const snap = await getDocs(q);
    
    if (snap.empty) {
        alert('Friend code not found');
        return;
    }
    
    const friendUid = snap.docs[0].id;
    
    // Add bidirectional friendship
    await updateDoc(doc(db, "users", currentUser.uid), {
        friends: arrayUnion(friendUid)
    });
    await updateDoc(doc(db, "users", friendUid), {
        friends: arrayUnion(currentUser.uid)
    });
    
    // Log activity
    await addDoc(collection(db, "activity"), {
        timestamp: serverTimestamp(),
        type: "friend_added",
        userId: friendUid,
        fromUser: currentUser.uid,
        fromUserName: await getUserName(currentUser.uid),
        message: `${friendName} added you as a friend`
    });
};
```

---

### 3. List Creation with Automatic Categorization

**Categories**:
- **Personal**: 1 member (creator only)
- **Paired**: 2 members (creator + 1 friend)
- **Group**: 3+ members (creator + 2+ friends)

**Creation Flow**:
1. User opens "Create List" modal
2. Enters list title
3. Selects 0+ friends from dropdown
4. Modal updates: "Target: Personal/Paired/Group Section"
5. User clicks "Create List"
6. List created in Firestore with all selected members + creator
7. Activity logged to each invited member's activities
8. List appears in correct UI section (automatically categorized by member count)

**Code** (dashboard.js):
```javascript
async function createListFromModal() {
    const title = document.getElementById('new-list-title').value.trim();
    const members = [currentUser.uid, ...selectedFriendsForModal];
    
    const inviteCode = await generateUniqueInviteCode();
    const listId = (await addDoc(collection(db, 'lists'), {
        title,
        owner: currentUser.uid,
        members,
        inviteCode,
        createdAt: serverTimestamp()
    })).id;
    
    // Log activities for invited members
    for (const friendUid of selectedFriendsForModal) {
        await addDoc(collection(db, "activity"), {
            timestamp: serverTimestamp(),
            type: "list_invite",
            userId: friendUid,
            listId: listId,
            listTitle: title,
            fromUser: currentUser.uid,
            message: `${currentUserName} invited you to "${title}"`
        });
    }
}
```

**Categorization** (automatic in renderLists):
```javascript
listsSnapshot.forEach(listDoc => {
    const memberCount = listDoc.data().members.length;
    
    if (listDoc.data().owner === currentUser.uid) {
        userLists.personal.push(listCard);
    } else if (memberCount === 2) {
        userLists.paired.push(listCard);
    } else if (memberCount >= 3) {
        userLists.group.push(listCard);
    }
});
```

**Note**: User's own lists ALWAYS appear in "My Lists" (Personal) section, regardless of member count

---

### 4. Permission System

**Owner (Lead Editor)**:
- Can view list
- Can add members: `addListMember(listId, newMemberUid)`
- Can remove members: `removeListMember(listId, memberUid)`
- Can rename: `renameList(listId, newTitle)`
- Can delete: `deleteList(listId)`
- Can edit/delete items

**Member (Editor)**:
- Can view list
- Can edit/delete items
- **Cannot**: Modify list settings, delete list, add/remove members

**Verification**:
```javascript
async function isListOwner(listId) {
    const listDoc = await getDoc(doc(db, "lists", listId));
    return listDoc.exists() && listDoc.data().owner === currentUser.uid;
}

async function isListMember(listId) {
    const listDoc = await getDoc(doc(db, "lists", listId));
    return listDoc.exists() && listDoc.data().members.includes(currentUser.uid);
}
```

**Enforced at**:
- Client-side: UI buttons hidden for non-owners
- Server-side: Firestore security rules reject unauthorized mutations

---

### 5. Activity Logging

**Triggered by**:
1. User A adds User B as friend → Activity logged to User B
2. List created with invitees → Activity logged to each invitee
3. Member added to existing list → Activity logged to new member

**Activity Types**:
- `friend_added`: Friend request received
- `list_invite`: Invited to new list
- `list_member_added`: Added to existing list

**Activity Document**:
```json
{
  "id": "auto-generated",
  "timestamp": "ISO-8601",
  "type": "friend_added | list_invite | list_member_added",
  "userId": "uid of recipient",
  "fromUser": "uid of sender",
  "fromUserName": "First Name",
  "listId": "lists/{id} (if applicable)",
  "listTitle": "List Name (if applicable)",
  "message": "Human readable message"
}
```

**Querying Activities**:
```javascript
const q = query(
    collection(db, "activity"),
    where("userId", "==", currentUser.uid)
);

onSnapshot(q, (snapshot) => {
    unreadActivities = [];
    snapshot.forEach((doc) => {
        unreadActivities.push({ id: doc.id, ...doc.data() });
    });
});
```

---

### 6. Notification Bell & Activities

**Badge**:
- Shows count of unread activities (max "9+")
- Displays red dot (•) with pulse animation
- Hidden when no activities

**Modal**:
- Click 🔔 to open modal showing all activities
- Each activity shows:
  - Icon (👥 for friend, 📋 for list)
  - Message (e.g., "Sarah added you as a friend")
  - Date
  - × button to clear

**Clearing**:
- User clicks × → Activity deleted from Firestore
- Badge updates immediately
- Activity removed from modal

**Code**:
```javascript
window.clearActivity = async (activityId) => {
    await deleteDoc(doc(db, "activity", activityId));
    unreadActivities = unreadActivities.filter(a => a.id !== activityId);
    updateNotificationBadge();
    renderActivities();
};
```

---

### 7. Empty States

**When**: List category has zero results

**Display**: Placeholder card showing:
- ✨ icon
- Message: "No {Type} lists yet. {Action}"
- Clickable to create new list

**Code** (dashboard.js):
```javascript
function createEmptyStateCard(message, onclick) {
    const card = document.createElement('div');
    card.className = 'list-card empty-state-card';
    card.innerHTML = `
        <div style="text-align: center;">
            <div style="font-size: 2rem;">✨</div>
            <div style="font-size: 0.75rem;">${message}</div>
        </div>
    `;
    card.onclick = () => eval(onclick);
    return card;
}
```

**Examples**:
- "No Personal lists yet. Create one now!"
- "No Paired lists yet. Invite a friend!"
- "No Group lists yet. Create one with friends!"

---

## Firestore Collections & Schema

### `/users/{uid}`
```json
{
  "email": "user@example.com",
  "username": "john_doe",
  "firstName": "John",
  "surname": "Doe",
  "friendCode": "382915",
  "userId": "845729",
  "photoURL": "https://...",
  "friends": ["uid1", "uid2"],
  "createdAt": "timestamp",
  "privacyVisibility": true,
  "privacyNotifications": true
}
```

### `/lists/{listId}`
```json
{
  "title": "Weekend Plans",
  "owner": "uid of creator",
  "members": ["uid1", "uid2", "uid3"],
  "inviteCode": "45829",
  "createdAt": "timestamp"
}
```

### `/activity/{activityId}`
```json
{
  "timestamp": "timestamp",
  "type": "friend_added | list_invite | list_member_added",
  "userId": "uid of recipient",
  "fromUser": "uid of sender",
  "fromUserName": "Sender's First Name",
  "listId": "lists/{id} (optional)",
  "listTitle": "List Name (optional)",
  "message": "Human readable message"
}
```

---

## Key Functions Reference

### User & Friend Management
- `loadFriendsList()` - Fetch and render user's friends in sidebar
- `addFriendFromSidebar()` - Add friend by code
- `getUserName(uid)` - Helper to fetch user's name

### List Management
- `loadUserLists()` - Query and categorize user's lists
- `createListFromModal()` - Create list with selected members
- `isListOwner(listId)` - Check if user is owner
- `isListMember(listId)` - Check if user is member
- `addListMember(listId, uid)` - Owner-only: add member
- `removeListMember(listId, uid)` - Owner-only: remove member
- `renameList(listId, newTitle)` - Owner-only: rename
- `deleteList(listId)` - Owner-only: delete

### Activity & Notifications
- `setupNotificationListener()` - Real-time activity listener
- `updateNotificationBadge()` - Update badge count
- `renderActivities()` - Display activities in modal
- `clearActivity(activityId)` - Delete activity from Firestore

### UI Utilities
- `toggleTheme()` - Toggle dark mode + persist to localStorage
- `goToSettings()` - Navigate to settings.html
- `logout()` - Sign out and redirect to index.html

---

## Testing Checklist

- [ ] Friend code is unique per user
- [ ] Friend code displays in dashboard (not userId)
- [ ] Add friend by code works bidirectionally
- [ ] Friend activity logged and visible
- [ ] Personal lists (1 member) appear in "My Lists"
- [ ] Paired lists (2 members) appear in "Paired Lists"
- [ ] Group lists (3+ members) appear in "Group Lists"
- [ ] Owner can modify list (name, members, delete)
- [ ] Member cannot modify list settings
- [ ] Empty state placeholders appear
- [ ] Notification badge shows unread count
- [ ] Dark mode toggles and persists
- [ ] All activity types logged correctly
- [ ] Firestore security rules enforced

