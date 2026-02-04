# NextStop - Quick Start Implementation Checklist

## 🚀 Before You Test - Complete These Steps

### Step 1: Deploy Firestore Security Rules
**Location**: Firebase Console → Firestore Database → Rules tab

Copy and paste the rules from `FIRESTORE_RULES.md` into your Firestore Rules editor:
- Users collection: Restrict to own docs + friends' docs
- Lists collection: Restrict to members only, modifications to owner only
- Activity collection: User can only read their own activities

**Status**: ⚠️ CRITICAL - Without these rules, anyone can delete anyone's lists

### Step 2: Verify Setup.js Generates friendCode
When a user signs up, they should get a friendCode instead of just userId.

**Test in Firebase Console → Firestore**:
1. Sign up a new user
2. Check `/users/{uid}` document
3. Should have both:
   - `friendCode`: "382915" (or similar)
   - `userId`: "845729" (legacy, for backward compatibility)

### Step 3: Test Friend Code Flow
1. Sign in as User A
2. Copy their friendCode from top-right chip (e.g., "382915")
3. Sign out, sign in as User B
4. Paste friendCode in sidebar "Add Friend" input
5. Click "Add"
6. ✅ Expected: "✅ Friend added: {User A's Name}"
7. Both users should see each other in Friends sidebar

### Step 4: Test List Creation & Categorization
**Scenario A**: User creates list alone
1. Click "+ New"
2. Enter title: "My Personal List"
3. Don't select any friends
4. Label should say: "Target: Personal Section"
5. Create list
6. ✅ List appears under "My Lists"

**Scenario B**: User creates list with 1 friend
1. Click "+ New"
2. Enter title: "Plans with Sarah"
3. Select Sarah from friends list (should highlight)
4. Label should say: "Target: Paired Section"
5. Create list
6. ✅ List appears under "Paired Lists (1-on-1)"
7. ✅ Sarah gets activity notification

**Scenario C**: User creates list with 2+ friends
1. Click "+ New"
2. Enter title: "Group Trip"
3. Select Sarah and Tom (both highlight)
4. Label should say: "Target: Group Section"
5. Create list
6. ✅ List appears under "Group Lists"
7. ✅ Both Sarah and Tom get activity notifications

### Step 5: Test Notification Bell
1. User receives invite notification (from Step 4B or 4C)
2. ✅ Notification bell 🔔 shows red badge with count
3. Click bell
4. ✅ Modal opens showing activities:
   - Friend requests
   - List invites with list names
   - Human-readable messages
5. Click × to clear one activity
6. ✅ Activity removed from Firestore
7. ✅ Badge count decrements
8. Clear all → Badge disappears

### Step 6: Test Empty States
1. User with no lists visits dashboard
2. ✅ "My Lists" shows: "✨ No Personal lists yet. Create one now!"
3. ✅ "Paired Lists" shows: "✨ No Paired lists yet. Invite a friend!"
4. ✅ "Group Lists" shows: "✨ No Group lists yet. Create one with friends!"
5. Create a list → Placeholder disappears for that category

### Step 7: Test Permission System
**Setup**: User A created a list, User B is invited member

**User A (Owner)**:
- Click list → Should see edit/delete buttons
- Can add User C to list
- Can remove User B from list
- Can rename list
- Can delete entire list

**User B (Member)**:
- Click list → Should NOT see edit/delete buttons
- Cannot add/remove members (button hidden)
- Cannot rename or delete list
- Can only add items inside list

### Step 8: Test Dark Mode
1. Click "🌙 Dark Mode" button in sidebar
2. ✅ All colors invert (cream→charcoal, text darkens)
3. Refresh page
4. ✅ Dark mode persists (saved in localStorage)
5. Click again to toggle back to light mode

---

## 🔍 Troubleshooting

### Issue: "Friend code not found"
- ✅ Check: Is the friendCode correct? (6 digits, uppercase)
- ✅ Check: Does Firestore user doc have `friendCode` field?
- ✅ Check: If only has `userId`, user signed up before this update - run update script

### Issue: Friend not appearing in sidebar
- ✅ Check: Both users have bidirectional friendship? (Check Firestore users collection)
- ✅ Check: Page refreshed? (onSnapshot should update in real-time)
- ✅ Check: Correct UID? Compare sidebar UID with friend's actual UID

### Issue: Lists not appearing in correct section
- ✅ Check: Count members in list, compare to categorization rules
- ✅ Check: Is creator the current user? (Own lists always in "My Lists")
- ✅ Check: Reload dashboard (sometimes React state needs refresh)

### Issue: Notification badge not showing
- ✅ Check: Activity documents created in Firestore `/activity` collection?
- ✅ Check: `userId` field matches current user's UID?
- ✅ Check: Use browser DevTools to verify `onSnapshot` listener is active

### Issue: Permission denied error from Firestore
- ✅ Check: Are Firestore rules published? (Must click "Publish")
- ✅ Check: Rule syntax correct? (Copy-paste from FIRESTORE_RULES.md)
- ✅ Check: Is user member of list? (Check `members` array)

---

## 📋 Key File Locations

**Core Logic**:
- `js/setup.js` - friendCode generation (line 149-157)
- `js/dashboard.js` - All social/list/activity logic (major rewrite)

**UI Templates**:
- `dashboard.html` - Dashboard layout with create-list modal

**Styles**:
- `css/styles.css` - All styling (dashboard, modals, dark mode, empty states)

**Configuration**:
- `js/config.js` - Firebase initialization (unchanged)

**Documentation**:
- `FIRESTORE_RULES.md` - Security rules + schema
- `IMPLEMENTATION_GUIDE.md` - Function reference + code examples
- `TEST_PLAN.md` - Complete end-to-end test scenarios
- `IMPLEMENTATION_COMPLETE.md` - This session's summary

---

## 🧪 Manual Testing Commands

### Verify friendCode in Console
```javascript
// In browser console on dashboard:
auth.currentUser.uid  // Get current UID
```

### Query friendCode in Firestore
```javascript
// In Firestore Console, run query:
db.collection("users").where("friendCode", "==", "382915").get()
```

### Check Activities
```javascript
// In Firestore Console, view:
/activity (collection)
// Filter: userId == current user's uid
```

---

## 📝 What's Next After Testing

1. **Optimize**: Add indexes for frequently queried fields (Firestore suggests these)
2. **Extend**: Implement list items functionality (add items to lists)
3. **Refine**: Add UI for managing list members (add/remove buttons)
4. **Polish**: Add animations for empty states → list creation transitions
5. **Scale**: Monitor Firestore reads/writes, optimize queries if needed

---

## ✅ Deployment Checklist

- [ ] Firestore rules deployed and tested
- [ ] All 8 test scenarios pass
- [ ] Notification badge shows/updates correctly
- [ ] Dark mode persists across page reload
- [ ] Empty states display for new users
- [ ] Friend code format is 6 digits (uppercase)
- [ ] Permission system enforced (owner/member)
- [ ] Activities logged for friend adds and list invites
- [ ] No console errors
- [ ] Database indexes optimized (Firestore recommendations)

---

## 📞 Support

**For questions about**:
- **Security Rules**: See `FIRESTORE_RULES.md` section "Rules Configuration"
- **Function Usage**: See `IMPLEMENTATION_GUIDE.md` section "Key Functions Reference"
- **Test Scenarios**: See `TEST_PLAN.md` for complete examples
- **Architecture**: See `IMPLEMENTATION_COMPLETE.md` for data flow diagrams

