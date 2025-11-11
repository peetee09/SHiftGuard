import { db, storage, functions, collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc, query, where, orderBy, limit, onSnapshot, writeBatch, serverTimestamp, ref, uploadBytes, getDownloadURL, httpsCallable } from './firebase-config.js';
import authService from './auth-service.js';

class DataService {
    constructor() {
        this.unsubscribes = new Map();
        this.cache = new Map();
    }

    // Employee Management
    async getEmployees(filters = {}) {
        try {
            let q = collection(db, 'employees');
            
            if (filters.department) {
                q = query(q, where('department', '==', filters.department));
            }
            if (filters.agency) {
                q = query(q, where('agency', '==', filters.agency));
            }
            if (filters.costCentre) {
                q = query(q, where('costCentre', '==', filters.costCentre));
            }
            if (filters.isActive !== undefined) {
                q = query(q, where('isActive', '==', filters.isActive));
            } else {
                q = query(q, where('isActive', '==', true));
            }
            
            q = query(q, orderBy('name'));
            
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error('Error fetching employees:', error);
            throw error;
        }
    }

    async addEmployee(employeeData) {
        if (!authService.hasPermission('manager')) {
            throw new Error('Insufficient permissions');
        }

        try {
            const docRef = await addDoc(collection(db, 'employees'), {
                ...employeeData,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                isActive: true,
                createdBy: authService.currentUser.uid
            });
            
            await authService.logActivity('employee_created', {
                employeeId: docRef.id,
                employeeName: employeeData.name
            });
            
            return docRef.id;
        } catch (error) {
            console.error('Error adding employee:', error);
            throw error;
        }
    }

    // Timesheet Management
    async uploadTimesheet(file, metadata) {
        try {
            // Upload file to Firebase Storage
            const timestamp = Date.now();
            const fileName = `timesheet_${timestamp}_${file.name}`;
            const storageRef = ref(storage, `timesheets/${fileName}`);
            const snapshot = await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(snapshot.ref);

            // Create timesheet record
            const timesheetDoc = await addDoc(collection(db, 'timesheets'), {
                fileName: file.name,
                storagePath: snapshot.ref.fullPath,
                fileURL: downloadURL,
                uploadedBy: authService.currentUser.uid,
                uploadedAt: serverTimestamp(),
                status: 'processing',
                metadata: metadata,
                processedEntries: 0,
                error: null
            });

            // Trigger Cloud Function for processing
            const processTimesheet = httpsCallable(functions, 'processTimesheet');
            await processTimesheet({ 
                timesheetId: timesheetDoc.id,
                costCentre: metadata.costCentre
            });

            await authService.logActivity('timesheet_uploaded', {
                timesheetId: timesheetDoc.id,
                fileName: file.name,
                costCentre: metadata.costCentre
            });

            return timesheetDoc.id;
        } catch (error) {
            console.error('Error uploading timesheet:', error);
            throw error;
        }
    }

    // Calculations and Reports
    async getCalculations(filters = {}) {
        try {
            let q = collection(db, 'calculations');
            
            if (filters.costCentre) {
                q = query(q, where('costCentre', '==', filters.costCentre));
            }
            if (filters.startDate && filters.endDate) {
                q = query(q, 
                    where('calculationDate', '>=', filters.startDate),
                    where('calculationDate', '<=', filters.endDate)
                );
            }
            
            q = query(q, orderBy('calculationDate', 'desc'), limit(1000));
            
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error('Error fetching calculations:', error);
            throw error;
        }
    }

    async generateReport(reportType, params) {
        try {
            const generateReport = httpsCallable(functions, 'generateReport');
            const result = await generateReport({
                reportType,
                params,
                requestedBy: authService.currentUser.uid
            });
            
            await authService.logActivity('report_generated', {
                reportType,
                params
            });
            
            return result.data;
        } catch (error) {
            console.error('Error generating report:', error);
            throw error;
        }
    }

    // Real-time Subscriptions
    subscribeToEmployees(callback, filters = {}) {
        let q = collection(db, 'employees');
        q = query(q, where('isActive', '==', true), orderBy('name'));
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const employees = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback(employees);
        });
        
        this.unsubscribes.set('employees', unsubscribe);
        return unsubscribe;
    }

    subscribeToTimesheets(callback, limitCount = 10) {
        const q = query(
            collection(db, 'timesheets'),
            orderBy('uploadedAt', 'desc'),
            limit(limitCount)
        );
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const timesheets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback(timesheets);
        });
        
        this.unsubscribes.set('timesheets', unsubscribe);
        return unsubscribe;
    }

    // Cleanup
    cleanup() {
        this.unsubscribes.forEach(unsubscribe => unsubscribe());
        this.unsubscribes.clear();
        this.cache.clear();
    }

    // Utility methods
    async getCostCenters() {
        if (this.cache.has('costCenters')) {
            return this.cache.get('costCenters');
        }

        const costCenters = [
            { id: '3040034', name: 'General Operations', departments: ['Inbound', 'Inventory', 'Picking', 'Despatch'] },
            { id: '3040038', name: 'Beauty', departments: ['Beauty Inbound', 'Beauty Inventory', 'Beauty Picking', 'Beauty Despatch'] },
            { id: '3040040', name: 'Ecom/Bash', departments: ['Ecom', 'Bash'] }
        ];
        
        this.cache.set('costCenters', costCenters);
        return costCenters;
    }

    async getBusinessRules() {
        return {
            dayShiftHours: 8.5,
            nightShiftHours: 8,
            paidHoursPerShift: 7.5,
            standardHoursPerWeek: 45,
            overtimeRate: 1.5,
            nightShiftAllowanceRate: 0.10,
            comfortBreakMinutes: 20,
            teaBreakMinutes: 30,
            lunchBreakMinutes: 60
        };
    }
}

// Create global instance
const dataService = new DataService();
export default dataService;
