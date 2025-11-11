import { auth, db, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile, doc, getDoc, setDoc, serverTimestamp } from './firebase-config.js';

class AuthService {
    constructor() {
        this.currentUser = null;
        this.userProfile = null;
        this.initAuthListener();
    }

    initAuthListener() {
        onAuthStateChanged(auth, async (user) => {
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
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            
            // Update last login
            if (userCredential.user) {
                await updateDoc(doc(db, 'users', userCredential.user.uid), {
                    lastLogin: serverTimestamp()
                });
            }
            
            // Log login activity
            await this.logActivity('login_success', { email });
            
            return { success: true, user: userCredential.user };
        } catch (error) {
            await this.logActivity('login_failed', { email, error: error.message });
            return { success: false, error: error.message };
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

    updateUI() {
        if (this.userProfile) {
            document.getElementById('userName').textContent = this.userProfile.name || this.currentUser.email;
            document.getElementById('userRole').textContent = this.userProfile.role;
            
            // Update navigation based on role
            this.updateNavigation();
        }
    }

    updateNavigation() {
        const adminView = document.querySelector('a[data-view="admin"]');
        if (adminView) {
            if (this.userProfile.role !== 'admin') {
                adminView.style.display = 'none';
            } else {
                adminView.style.display = 'block';
            }
        }
    }

    showApp() {
        document.getElementById('loginView').classList.add('d-none');
        document.getElementById('appView').classList.remove('d-none');
    }

    showLogin() {
        document.getElementById('loginView').classList.remove('d-none');
        document.getElementById('appView').classList.add('d-none');
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
