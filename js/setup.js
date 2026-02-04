// js/setup.js
import { auth, db } from './config.js';
import { doc, setDoc, collection, query, where, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

const storage = getStorage();
let selectedImageFile = null;
let profileImageUrl = null;
let currentUser = null;
let useGooglePhotoSelected = false;

// Populate email from Google Auth
auth.onAuthStateChanged((user) => {
    currentUser = user;
    if (user) {
        document.getElementById('email-display').value = user.email;
        if (user.displayName) {
            const names = user.displayName.split(' ');
            document.getElementById('first-name').value = names[0];
            document.getElementById('surname').value = names.slice(1).join(' ');
        }

        // Show Google profile picture preview if available
        const avatarEl = document.getElementById('profile-avatar');
        const useGoogleBtn = document.getElementById('use-google-photo-btn');
        if (user.photoURL) {
            avatarEl.style.backgroundImage = `url('${user.photoURL}')`;
            avatarEl.textContent = '';
            useGoogleBtn.style.display = 'inline-block';
            useGooglePhotoSelected = true; // default to Google photo until user uploads a file
        } else {
            avatarEl.style.backgroundImage = '';
            avatarEl.textContent = '📷';
            useGoogleBtn.style.display = 'none';
            useGooglePhotoSelected = false;
        }
    }
});

// Image Upload Handler
document.getElementById('profile-image-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        if (!file.type.startsWith('image/')) {
            alert('Please select an image file');
            return;
        }
        if (file.size > 5 * 1024 * 1024) { // 5MB max
            alert('Image must be smaller than 5MB');
            return;
        }

        selectedImageFile = file;
        useGooglePhotoSelected = false; // user chose a local file instead of Google photo
        const reader = new FileReader();
        reader.onload = (event) => {
            document.getElementById('profile-avatar').style.backgroundImage = `url('${event.target.result}')`;
            document.getElementById('profile-avatar').textContent = '';
        };
        reader.readAsDataURL(file);
    }
});

// Allow user to explicitly select their Google profile photo
window.useGooglePhoto = () => {
    if (!currentUser || !currentUser.photoURL) return;
    selectedImageFile = null;
    useGooglePhotoSelected = true;
    const avatarEl = document.getElementById('profile-avatar');
    avatarEl.style.backgroundImage = `url('${currentUser.photoURL}')`;
    avatarEl.textContent = '';
};

// Form Validation & Button Enable/Disable
const requiredInputs = [
    'username',
    'first-name',
    'surname',
    'mfa-checkbox',
    'terms-checkbox'
];

function validateForm() {
    const username = document.getElementById('username').value.trim();
    const firstName = document.getElementById('first-name').value.trim();
    const surname = document.getElementById('surname').value.trim();
    const mfaChecked = document.getElementById('mfa-checkbox').checked;
    const termsChecked = document.getElementById('terms-checkbox').checked;

    // Clear previous errors
    document.getElementById('username-error').style.display = 'none';

    const isValid = username && firstName && surname && mfaChecked && termsChecked;
    const btn = document.getElementById('create-account-btn');

    if (isValid) {
        btn.disabled = false;
        btn.classList.remove('button-disabled');
    } else {
        btn.disabled = true;
        btn.classList.add('button-disabled');
    }
}

// Attach listeners for real-time validation
document.getElementById('username').addEventListener('input', validateForm);
document.getElementById('first-name').addEventListener('input', validateForm);
document.getElementById('surname').addEventListener('input', validateForm);
document.getElementById('mfa-checkbox').addEventListener('change', validateForm);
document.getElementById('terms-checkbox').addEventListener('change', validateForm);

// Username Uniqueness Check
async function checkUsernameUniqueness(username) {
    const q = query(collection(db, "users"), where("username", "==", username.toLowerCase()));
    const snap = await getDocs(q);
    return snap.empty; // true if unique
}

// Upload Image to Firebase Storage
async function uploadProfileImage(userId) {
    if (!selectedImageFile) return null;

    try {
        const storageRef = ref(storage, `profile-images/${userId}-${Date.now()}`);
        await uploadBytes(storageRef, selectedImageFile);
        const downloadUrl = await getDownloadURL(storageRef);
        return downloadUrl;
    } catch (error) {
        console.error('Image upload error:', error);
        throw new Error('Failed to upload profile image');
    }
}

// Generate unique 6-digit IDs
const generate6DigitId = () => Math.floor(100000 + Math.random() * 900000).toString();

async function generateUniqueUserId() {
    let attempts = 0;
    while (attempts < 20) {
        const candidate = generate6DigitId();
        const q = query(collection(db, "users"), where("userId", "==", candidate));
        const snap = await getDocs(q);
        if (snap.empty) return candidate;
        attempts++;
    }
    throw new Error("Unable to generate unique user ID");
}

async function generateUniqueFriendCode() {
    let attempts = 0;
    while (attempts < 20) {
        const candidate = generate6DigitId();
        const q = query(collection(db, "users"), where("friendCode", "==", candidate));
        const snap = await getDocs(q);
        if (snap.empty) return candidate;
        attempts++;
    }
    throw new Error("Unable to generate unique friend code");
}

// Main Save Profile Function
window.saveProfile = async () => {
    const user = auth.currentUser;
    if (!user) {
        alert('Please sign in first');
        return;
    }

    const username = document.getElementById('username').value.trim().toLowerCase();
    const firstName = document.getElementById('first-name').value.trim();
    const surname = document.getElementById('surname').value.trim();
    const dateOfBirth = document.getElementById('date-of-birth').value;
    const gender = document.getElementById('gender').value;
    const mfaChecked = document.getElementById('mfa-checkbox').checked;
    const termsChecked = document.getElementById('terms-checkbox').checked;

    // Validate inputs
    if (!username || !firstName || !surname) {
        showFormError('Please fill in all required fields');
        return;
    }

    if (!mfaChecked || !termsChecked) {
        showFormError('You must agree to all terms and policies');
        return;
    }

    // Username validation (alphanumeric + underscore, 3-20 chars)
    if (!/^[a-z0-9_]{3,20}$/.test(username)) {
        showUsernameError('Username must be 3-20 characters (letters, numbers, underscore only)');
        return;
    }

    // Disable button during processing
    const btn = document.getElementById('create-account-btn');
    btn.disabled = true;
    btn.textContent = 'Creating account...';

    try {
        // Check username uniqueness
        const isUnique = await checkUsernameUniqueness(username);
        if (!isUnique) {
            showUsernameError('Username is already taken');
            btn.disabled = false;
            btn.textContent = 'Finish & Create Account';
            return;
        }

        // Generate unique 6-digit user ID
        const userId = await generateUniqueUserId();

        // Generate unique 6-digit friend code
        const friendCode = await generateUniqueFriendCode();

        // Decide photoURL: prefer uploaded image; else explicit Google choice; else Google photo or placeholder
        let photoURL = 'https://via.placeholder.com/150';
        if (selectedImageFile) {
            photoURL = await uploadProfileImage(user.uid);
        } else if (useGooglePhotoSelected && user.photoURL) {
            photoURL = user.photoURL;
        } else if (user.photoURL) {
            photoURL = user.photoURL;
        }

        // Build profile data
        const profileData = {
            email: user.email,
            username,
            firstName,
            surname,
            photoURL,
            userId,
            friendCode,
            dateOfBirth: dateOfBirth || null,
            gender: gender || null,
            friends: [],
            currentGroupId: null,
            privacyVisibility: true,
            privacyNotifications: true,
            notifications: [],
            createdAt: serverTimestamp()
        };

        // Save to Firestore
        await setDoc(doc(db, "users", user.uid), profileData);

        // Success
        alert(`✅ Account created! Your 6-digit code is: ${userId}`);
        window.location.href = 'dashboard.html';

    } catch (error) {
        console.error('Profile creation error:', error);
        showFormError(error.message || 'Failed to create account. Try again.');
        btn.disabled = false;
        btn.textContent = 'Finish & Create Account';
    }
};

function showFormError(message) {
    const errorEl = document.getElementById('form-error');
    errorEl.textContent = message;
    errorEl.style.display = 'block';
}

function showUsernameError(message) {
    const errorEl = document.getElementById('username-error');
    errorEl.textContent = message;
    errorEl.style.display = 'block';
} 