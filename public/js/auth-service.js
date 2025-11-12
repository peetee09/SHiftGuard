import { 
    auth, 
    db, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged, 
    updateProfile, 
    doc, 
    getDoc, 
    setDoc, 
    collection,
    addDoc,
    serverTimestamp 
} from './firebase-config.js';

class AuthService {
    constructor() {
        this.currentUser = null;
        this.userProfile = null;
        this.initAuthListener();
    }

    initAuthListener() {
        onAuthStateChanged(auth, async (user) => {
            console.log('Auth state changed:', user);
            if (user) {
                this.currentUser = user;
                await this.loadUserProfile(user.uid);
                this.showApp();
            } else {
                this.currentUser = null;
                this.userProfile = null;
                this.showLogin();
            }
        });
    }

    async loadUserProfile(uid) {
        try {
            const userDoc = await getDoc(doc(db, 'users', uid));
            if (userDoc.exists()) {
                this.userProfile = userDoc.data();
                console.log('User profile loaded:', this.userProfile);
                this.updateUI();
            } else {
                // Create user profile if it doesn't exist
                await this.createUserProfile(uid);
            }
        } catch (error) {
            console.error('Error loading user profile:', error);
        }
    }

    async createUserProfile(uid) {
        try {
            const userData = {
                email: this.currentUser.email,
                role: 'viewer', // Default role
                createdAt: serverTimestamp(),
                lastLogin: serverTimestamp(),
                isActive: true
            };
            
            await setDoc(doc(db, 'users', uid), userData);
            this.userProfile = userData;
            this.updateUI();
        } catch (error) {
            console.error('Error creating user profile:', error);
        }
    }

    async login(email, password) {
        try {
            console.log('Attempting login for:', email);
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            console.log('Login successful:', userCredential.user);
            
            // Update last login
            if (userCredential.user) {
                await setDoc(doc(db, 'users', userCredential.user.uid), {
                    lastLogin: serverTimestamp()
                }, { merge: true });
            }
            
            // Log login activity
            await this.logActivity('login_success', { email });
            
            return { success: true, user: userCredential.user };
        } catch (error) {
            console.error('Login error:', error);
            await this.logActivity('login_failed', { email, error: error.message });
            return { success: false, error: this.getAuthErrorMessage(error) };
        }
    }

    async logout() {
        try {
            if (this.currentUser) {
                await this.logActivity('logout', { email: this.currentUser.email });
            }
            await signOut(auth);
        } catch (error) {
            console.error('Logout error:', error);
        }
    }

    async logActivity(action, details) {
        try {
            await addDoc(collection(db, 'auditLog'), {
                action,
                details,
                timestamp: serverTimestamp(),
                userEmail: this.currentUser?.email,
                userId: this.currentUser?.uid
            });
        } catch (error) {
            console.error('Error logging activity:', error);
        }
    }

    getAuthErrorMessage(error) {
        switch (error.code) {
            case 'auth/invalid-email':
                return 'Invalid email address';
            case 'auth/user-disabled':
                return 'This account has been disabled';
            case 'auth/user-not-found':
                return 'No account found with this email';
            case 'auth/wrong-password':
                return 'Incorrect password';
            case 'auth/too-many-requests':
                return 'Too many failed attempts. Please try again later';
            default:
                return 'Login failed. Please try again';
        }
    }

    updateUI() {
        if (this.userProfile && this.currentUser) {
            const userNameElement = document.getElementById('userName');
            const userRoleElement = document.getElementById('userRole');
            
            if (userNameElement) {
                userNameElement.textContent = this.userProfile.name || this.currentUser.email;
            }
            if (userRoleElement) {
                userRoleElement.textContent = this.userProfile.role;
            }
            
            // Update navigation based on role
            this.updateNavigation();
        }
    }

    updateNavigation() {
        const adminView = document.querySelector('a[data-view="admin"]');
        if (adminView) {
            if (this.userProfile?.role !== 'admin') {
                adminView.style.display = 'none';
            } else {
                adminView.style.display = 'block';
            }
        }
    }

    showApp() {
        const loginView = document.getElementById('loginView');
        const appView = document.getElementById('appView');
        
        if (loginView) loginView.classList.add('d-none');
        if (appView) appView.classList.remove('d-none');
        
        console.log('Showing app view');
    }

    showLogin() {
        const loginView = document.getElementById('loginView');
        const appView = document.getElementById('appView');
        
        if (loginView) loginView.classList.remove('d-none');
        if (appView) appView.classList.add('d-none');
        
        console.log('Showing login view');
    }

    hasPermission(requiredRole) {
        const roles = ['viewer', 'supervisor', 'manager', 'admin'];
        const userRoleIndex = roles.indexOf(this.userProfile?.role);
        const requiredRoleIndex = roles.indexOf(requiredRole);
        
        return userRoleIndex >= requiredRoleIndex;
    }
}

// Create global instance
const authService = new AuthService();
export default authService;
