// Use compatible Firebase SDK versions
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js';
import { 
    getAuth, 
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    updateProfile
} from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js';
import { 
    getFirestore, 
    collection, 
    doc, 
    getDocs, 
    getDoc,
    addDoc,
    updateDoc,
    setDoc,
    query,
    where,
    orderBy,
    limit,
    onSnapshot,
    serverTimestamp
} from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js';
import { 
    getStorage, 
    ref, 
    uploadBytes, 
    getDownloadURL
} from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js';
import { 
    getFunctions, 
    httpsCallable 
} from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-functions.js';

const firebaseConfig = {
    apiKey: "AIzaSyBq3IuxjMRX82FPwox66g2uN53eqGmiS9U",
    authDomain: "shift-guard.firebaseapp.com",
    projectId: "shift-guard",
    storageBucket: "shift-guard.firebasestorage.app",
    messagingSenderId: "557303792577",
    appId: "1:557303792577:web:5977a52774908d5619a540",
    measurementId: "G-DNZLDKHE3Q"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize services - make them global
window.auth = getAuth(app);
window.db = getFirestore(app);
window.storage = getStorage(app);
window.functions = getFunctions(app);

// Make Firebase functions globally available
window.firebaseServices = {
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    collection, doc, getDocs, getDoc, addDoc, updateDoc, setDoc,
    query, where, orderBy, limit, onSnapshot, serverTimestamp,
    ref, uploadBytes, getDownloadURL,
    httpsCallable
};
