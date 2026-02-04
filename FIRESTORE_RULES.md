# Firestore Security Rules for NextStop

## Overview
These security rules enforce role-based access control for the NextStop application, ensuring data integrity and privacy.

## Rules Configuration

### Users Collection
- **Read**: Users can only read their own document and their friends' public profiles
- **Write**: Only the authenticated user can write to their own document
- **Create**: Automatically allowed on signup via Firebase Auth

```firestore
match /users/{userId} {
  allow read: if request.auth.uid == userId || 
              request.auth.uid in resource.data.friends;
  allow write: if request.auth.uid == userId;
  allow create: if request.auth.uid == userId;
}
```

### Lists Collection
- **Read**: Only list members can read list documents
- **Write**: 
  - Owner (lead editor) can modify all fields
  - Members can only read; cannot modify list settings
  - Only owner can delete

```firestore
match /lists/{listId} {
  allow read: if request.auth.uid in resource.data.members;
  
  allow update: if request.auth.uid == resource.data.owner;
  
  allow delete: if request.auth.uid == resource.data.owner;
  
  allow create: if request.auth.uid != null &&
                request.auth.uid in request.resource.data.members;
                
  // Sub-collection: list items (if implemented)
  match /items/{itemId} {
    allow read: if request.auth.uid in get(/databases/$(database)/documents/lists/$(listId)).data.members;
    allow create: if request.auth.uid in get(/databases/$(database)/documents/lists/$(listId)).data.members;
    allow update, delete: if request.auth.uid == resource.data.createdBy;
  }
}
```

### Activity Collection
- **Read**: Users can only read activities directed at them
- **Write**: Only the backend (or authorized server) can create activities
- **Delete**: Users can delete their own activities (to clear notifications)

```firestore
match /activity/{activityId} {
  allow read: if request.auth.uid == resource.data.userId;
  allow create: if request.auth.uid != null;
  allow delete: if request.auth.uid == resource.data.userId;
  allow update: if false; // Activity logs should be immutable
}
```

## Permission Levels

### Lead Editor (Owner)
- Can **view** list and all members
- Can **add/remove** members from the list
- Can **rename** the list
- Can **change category** (if implemented)
- Can **delete** the entire list
- Can **manage items** within the list

**Enforced by:**
- `isListOwner(listId)` function checks `owner == currentUser.uid`
- Functions like `renameList()`, `deleteList()`, `addListMember()` verify ownership
- Firestore rules restrict `update` and `delete` to owner only

### Member (Editor)
- Can **view** list contents and other members
- Can **add/edit/delete** items within the list
- **Cannot** modify list settings (name, members, category)
- **Cannot** delete the list

**Enforced by:**
- `isListMember(listId)` function checks `currentUser.uid in members array`
- Item-level operations allowed for all members
- List-level modifications rejected for non-owners (client-side + Firestore rules)

## Activity Logging

All system events are logged to the `activity` collection:

### Activity Types

1. **`friend_added`**
   - Triggered when User A adds User B as a friend
   - Logged to User B's activities
   - Message: "{User A} added you as a friend"

2. **`list_invite`**
   - Triggered when a list is created with invited members
   - Logged to each invited member's activities
   - Message: "{Owner Name} invited you to "{List Title}""

3. **`list_member_added`**
   - Triggered when an existing member is added to a list
   - Logged to new member's activities
   - Message: "{Owner Name} added you to "{List Title}""

4. **`list_item_updated`** (optional, for future use)
   - Triggered when items are added/modified in a list
   - Could log to all list members
   - Message: "{User Name} updated {List Title}"

### Activity Schema

```json
{
  "timestamp": "2026-02-04T12:00:00Z",
  "type": "list_invite | friend_added | list_member_added",
  "userId": "uid of recipient",
  "fromUser": "uid of action initiator",
  "fromUserName": "name of action initiator",
  "listId": "lists/{id} (if applicable)",
  "listTitle": "name of list (if applicable)",
  "message": "human readable activity message"
}
```

## Notification & Badge System

- **Notification Badge**: Shows count of unread activities for current user
- **Unread Definition**: Activities in the `activity` collection that haven't been cleared
- **Clearing**: User clicks × button to remove activity from their view
- **Persistence**: Activities persist in Firestore; clearing just removes from UI

## Implementation Checklist

- [x] Friend code uniqueness enforced at signup
- [x] Bidirectional friend relationships on `addFriendFromSidebar()`
- [x] Activity logging on friend addition
- [x] Activity logging on list creation with invites
- [x] Permission checking functions for list ownership
- [x] Empty state placeholders for list categories
- [x] Notification listener querying activity collection
- [x] Badge updates based on activity count
- [ ] **TODO**: Apply these exact rules in Firebase Console under Firestore Rules tab
- [ ] **TODO**: Implement item-level read/write restrictions (if using subcollections)

## Manual Setup Instructions

1. Go to **Firebase Console** → Your Project → **Firestore Database**
2. Navigate to **Rules** tab
3. Replace the default rules with the configuration above
4. Click **Publish**
5. Test with multiple users in different roles

## Client-Side Enforcement

All permission checks are also performed client-side before attempting mutations:

- `isListOwner(listId)` → Returns true if user is owner
- `isListMember(listId)` → Returns true if user is a member
- `addListMember()` → Throws error if user is not owner
- `deleteList()` → Throws error if user is not owner
- `renameList()` → Throws error if user is not owner

This provides both security (server-side Firestore rules) and UX (client-side validation).
