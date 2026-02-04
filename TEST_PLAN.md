# NextStop Social & List Management - Test Plan

## End-to-End User Flow Tests

### Test 1: User Registration with Friend Code
**Objective**: Verify unique friendCode is generated and displayed

1. Sign up as User A with Google Auth
2. Fill profile form and create account
3. ✅ **Verify**: Dashboard shows 6-digit friendCode (not userId) in top-right chip
4. ✅ **Verify**: FriendCode is unique (same 6 digits never assigned twice)
5. ✅ **Verify**: FriendCode is stored in Firestore under `users/{uid}.friendCode`

---

### Test 2: Add Friend Using Friend Code
**Objective**: Verify bidirectional friendship and activity logging

**Setup**: Have User A (uid=abc) and User B (uid=xyz) both signed up

1. User B navigates to Dashboard
2. User B looks up User A's friendCode (display format: uppercase)
3. User B enters friendCode in sidebar "Add Friend" input
4. User B clicks "Add" button
5. ✅ **Expected**: Success alert with User A's name: "✅ Friend added: {FirstName}"
6. ✅ **Expected**: User A's name appears in User B's sidebar Friends list
7. ✅ **Expected**: User B's name appears in User A's sidebar (real-time via onSnapshot)
8. ✅ **Expected**: Activity logged in `activity` collection:
   - `type`: "friend_added"
   - `userId`: User A's uid (recipient)
   - `fromUser`: User B's uid (sender)
   - `message`: "{User B Name} added you as a friend"
9. ✅ **Expected**: User A sees notification badge (🔔) with unread count

---

### Test 3: Create Personal List (No Members)
**Objective**: Verify single-member lists are categorized as "Personal"

1. User A clicks "+ New" button under "My Lists" section
2. User A enters title: "My Bucket List"
3. User A does NOT select any friends
4. ✅ **Verify**: Target label shows "Target: Personal Section"
5. User A clicks "Create List"
6. ✅ **Expected**: Success alert with invite code (5 digits)
7. ✅ **Expected**: List appears in "My Lists" section (not Paired or Group)
8. ✅ **Expected**: Firestore document created at `lists/{id}` with:
   - `members`: [User A's uid] (only owner)
   - `owner`: User A's uid
   - `type`: "personal" (inferred from 1 member)

---

### Test 4: Create Paired List (One Friend)
**Objective**: Verify two-member lists are categorized as "Paired"

1. User A clicks "+ New" button
2. User A enters title: "Weekend Plans with Sarah"
3. User A selects User B (Sarah) from friend selection dropdown
4. ✅ **Verify**: User B's row highlights with `.selected` class (different background color)
5. ✅ **Verify**: Target label updates to "Target: Paired Section"
6. User A clicks "Create List"
7. ✅ **Expected**: List appears in "Paired Lists (1-on-1)" section
8. ✅ **Expected**: Firestore `lists/{id}.members` = [User A uid, User B uid]
9. ✅ **Expected**: Activity logged in `activity` collection for User B:
   - `type`: "list_invite"
   - `message`: "{User A Name} invited you to "{Weekend Plans with Sarah}""
10. ✅ **Expected**: User B's notification badge appears with count = 1

---

### Test 5: Create Group List (2+ Friends)
**Objective**: Verify 3+ member lists are categorized as "Group"

1. User A clicks "+ New" button
2. User A enters title: "Coffee Shop Recommendations"
3. User A selects User B AND User C from friends
4. ✅ **Verify**: Both friends highlighted in dropdown
5. ✅ **Verify**: Target label shows "Target: Group Section"
6. User A clicks "Create List"
7. ✅ **Expected**: List appears in "Group Lists" section
8. ✅ **Expected**: Firestore `members` = [User A, User B, User C]
9. ✅ **Expected**: Activities logged for both User B and User C:
   - Each receives "list_invite" activity
   - Both notification badges update

---

### Test 6: Lead Editor Permissions (Owner)
**Objective**: Verify owner has full access

**Setup**: User A created a list

1. User A can view the list ✅
2. User A can add members to the list:
   - Click "Add Member" (or similar)
   - Select User D from friends
   - ✅ **Expected**: User D added to Firestore `members` array
   - ✅ **Expected**: Activity logged for User D
3. User A can remove members:
   - Click remove button next to User B's name
   - ✅ **Expected**: User B removed from `members`
4. User A can rename list:
   - Click edit button, change title
   - ✅ **Expected**: Firestore `title` updated
5. User A can delete list:
   - Click delete button
   - Confirm
   - ✅ **Expected**: List document deleted from Firestore
   - ✅ **Expected**: List disappears from dashboard

---

### Test 7: Member Permissions (Non-Owner)
**Objective**: Verify members have limited access

**Setup**: User A owns list, User B is a member

1. User B views the list ✅
2. User B attempts to rename list:
   - ✅ **Expected**: "Edit" button does NOT appear (or error if clicked)
3. User B attempts to add member:
   - ✅ **Expected**: "Add Member" button hidden or disabled
4. User B attempts to delete list:
   - ✅ **Expected**: "Delete" button hidden; Firestore rules reject mutation

---

### Test 8: Empty State Placeholders
**Objective**: Verify all three categories show placeholders when empty

**Setup**: User C has no lists

1. User C navigates to Dashboard
2. ✅ **Expected**: "My Lists" section shows placeholder card:
   - Icon: ✨
   - Text: "No Personal lists yet. Create one now!"
   - Clicking opens create-list-modal
3. ✅ **Expected**: "Paired Lists" shows similar placeholder
4. ✅ **Expected**: "Group Lists" shows similar placeholder
5. Create a Personal list
6. ✅ **Expected**: Personal placeholder disappears, actual list card appears
7. ✅ **Expected**: Paired and Group still show placeholders

---

### Test 9: Notification Bell & Activity View
**Objective**: Verify notification system works

**Setup**: User B was invited to multiple lists

1. User B navigates to Dashboard
2. ✅ **Expected**: Notification bell shows badge with count (e.g., "3")
3. User B clicks notification bell (🔔)
4. ✅ **Expected**: Modal opens showing all activities:
   - Friend request from User A
   - List invites with list names
   - Each activity shows icon (👥 for friend, 📋 for list)
   - Each activity shows human-readable message
   - Each activity shows date
5. User B clicks × button to clear one activity
6. ✅ **Expected**: Activity removed from modal and Firestore
7. ✅ **Expected**: Badge count decrements
8. ✅ **Expected**: All activities cleared → badge hidden

---

### Test 10: Dark Mode Persistence
**Objective**: Verify dark mode toggle and localStorage

1. User A clicks "🌙 Dark Mode" button in sidebar
2. ✅ **Expected**: All colors invert:
   - Background: cream → charcoal
   - Text: dark → light
   - Cards maintain contrast
3. User A refreshes page
4. ✅ **Expected**: Dark mode persists (localStorage read on load)
5. User A clicks "🌙 Dark Mode" again
6. ✅ **Expected**: Light mode restored and persists after refresh

---

## Edge Cases & Error Handling

### Invalid Friend Code
- User enters non-existent code → "Friend code not found"
- User enters their own code → "That's your own code"
- User tries to add existing friend → "Already friends with {Name}"

### Permission Violations
- Non-owner clicks delete list → Hidden button / Firestore rejects
- Non-owner modifies list title → Field locked / Firestore rejects

### Conflict Handling
- Two users try to add same friend simultaneously → Both succeed, no duplicate (arrayUnion handles)
- Two users try to create list with same name → Both succeed, different Firestore docs

---

## Automated Test Cases (Optional)

```javascript
// Example: Test unique friendCode generation
async function testUniqueFriendCode() {
  const user1FriendCode = /* get from user doc */;
  const user2FriendCode = /* get from user doc */;
  console.assert(user1FriendCode !== user2FriendCode, "Codes must be unique");
}

// Example: Test activity logging
async function testActivityLogged() {
  const activities = await getDocs(
    query(collection(db, "activity"), where("type", "==", "friend_added"))
  );
  console.assert(activities.size > 0, "Activity should be logged");
}
```

---

## Test Checklist

- [ ] User registration generates unique friendCode
- [ ] Friend code format displayed correctly in sidebar
- [ ] Adding friend by code works bidirectionally
- [ ] Friend activities logged and visible
- [ ] Personal lists (1 member) categorized correctly
- [ ] Paired lists (2 members) categorized correctly
- [ ] Group lists (3+ members) categorized correctly
- [ ] Owner can add/remove/rename/delete
- [ ] Member cannot modify list settings
- [ ] Empty state placeholders appear
- [ ] Empty state placeholders disappear when list created
- [ ] Notification badge shows count
- [ ] Activities cleared properly
- [ ] Dark mode toggles and persists
- [ ] Firestore security rules enforce permissions
- [ ] No duplicate friends (idempotent add)
- [ ] All activity types logged correctly

