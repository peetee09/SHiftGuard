import { db, storage, functions, collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc, query, where, orderBy, limit, onSnapshot, writeBatch, serverTimestamp, ref, uploadBytes, getDownloadURL, httpsCallable } from './firebase-config.js';
import authService from './auth-service.js';

class DataService {
    constructor() {
        this.unsubscribes = new Map();
        this.cache = new Map();
    }

    // Enhanced Employee Management with Excel Support
    async processEmployeeExcel(file, metadata) {
        try {
            // Upload file to Firebase Storage
            const timestamp = Date.now();
            const fileName = `employees_${timestamp}_${file.name}`;
            const storageRef = ref(storage, `employee-data/${fileName}`);
            const snapshot = await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(snapshot.ref);

            // Create employee import record
            const importDoc = await addDoc(collection(db, 'employeeImports'), {
                fileName: file.name,
                storagePath: snapshot.ref.fullPath,
                fileURL: downloadURL,
                uploadedBy: authService.currentUser.uid,
                uploadedAt: serverTimestamp(),
                status: 'processing',
                metadata: metadata,
                processedEmployees: 0,
                error: null
            });

            // Trigger Cloud Function for processing
            const processEmployeeImport = httpsCallable(functions, 'processEmployeeImport');
            await processEmployeeImport({ 
                importId: importDoc.id,
                costCentre: metadata.costCentre
            });

            await authService.logActivity('employee_import_uploaded', {
                importId: importDoc.id,
                fileName: file.name,
                costCentre: metadata.costCentre
            });

            return importDoc.id;
        } catch (error) {
            console.error('Error uploading employee data:', error);
            throw error;
        }
    }

    // Get employees with advanced filtering
    async getEmployees(filters = {}) {
        try {
            let q = collection(db, 'employees');
            
            // Apply filters
            if (filters.department) {
                q = query(q, where('department', '==', filters.department));
            }
            if (filters.agency) {
                q = query(q, where('agency', '==', filters.agency));
            }
            if (filters.costCentre) {
                q = query(q, where('costCentre', '==', filters.costCentre));
            }
            if (filters.position) {
                q = query(q, where('position', '==', filters.position));
            }
            if (filters.isActive !== undefined) {
                q = query(q, where('isActive', '==', filters.isActive));
            } else {
                q = query(q, where('isActive', '==', true));
            }
            
            q = query(q, orderBy('name'));
            
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({ 
                id: doc.id, 
                ...doc.data(),
                // Add calculated fields
                weeklyCost: this.calculateWeeklyCost(doc.data())
            }));
        } catch (error) {
            console.error('Error fetching employees:', error);
            throw error;
        }
    }

    // Enhanced employee addition with validation
    async addEmployee(employeeData) {
        if (!authService.hasPermission('manager')) {
            throw new Error('Insufficient permissions');
        }

        try {
            // Validate employee data
            this.validateEmployeeData(employeeData);

            const docRef = await addDoc(collection(db, 'employees'), {
                ...employeeData,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                isActive: true,
                createdBy: authService.currentUser.uid,
                // Ensure numeric fields
                hourlyRate: parseFloat(employeeData.hourlyRate),
                billRate: parseFloat(employeeData.billRate) || 0
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

    // Update employee
    async updateEmployee(employeeId, updates) {
        if (!authService.hasPermission('manager')) {
            throw new Error('Insufficient permissions');
        }

        try {
            await updateDoc(doc(db, 'employees', employeeId), {
                ...updates,
                updatedAt: serverTimestamp(),
                updatedBy: authService.currentUser.uid
            });

            await authService.logActivity('employee_updated', {
                employeeId: employeeId,
                updates: Object.keys(updates)
            });
        } catch (error) {
            console.error('Error updating employee:', error);
            throw error;
        }
    }

    // Bulk employee operations
    async bulkUpdateEmployees(employeeIds, updates) {
        if (!authService.hasPermission('admin')) {
            throw new Error('Insufficient permissions');
        }

        const batch = writeBatch(db);
        
        employeeIds.forEach(employeeId => {
            const employeeRef = doc(db, 'employees', employeeId);
            batch.update(employeeRef, {
                ...updates,
                updatedAt: serverTimestamp(),
                updatedBy: authService.currentUser.uid
            });
        });

        try {
            await batch.commit();
            await authService.logActivity('employees_bulk_updated', {
                count: employeeIds.length,
                updates: Object.keys(updates)
            });
        } catch (error) {
            console.error('Error in bulk update:', error);
            throw error;
        }
    }

    // Employee search
    async searchEmployees(searchTerm, filters = {}) {
        try {
            // Since Firestore doesn't support full-text search, we'll filter client-side
            const allEmployees = await this.getEmployees(filters);
            
            return allEmployees.filter(emp => 
                emp.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                emp.employeeNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                emp.department?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                emp.position?.toLowerCase().includes(searchTerm.toLowerCase())
            );
        } catch (error) {
            console.error('Error searching employees:', error);
            throw error;
        }
    }

    // Employee statistics
    async getEmployeeStats() {
        try {
            const employees = await this.getEmployees();
            
            const stats = {
                total: employees.length,
                byDepartment: {},
                byAgency: {},
                byCostCentre: {},
                byPosition: {},
                active: employees.filter(emp => emp.isActive).length,
                inactive: employees.filter(emp => !emp.isActive).length,
                totalWeeklyCost: employees.reduce((sum, emp) => sum + (emp.weeklyCost || 0), 0)
            };

            employees.forEach(emp => {
                // Department stats
                stats.byDepartment[emp.department] = (stats.byDepartment[emp.department] || 0) + 1;
                
                // Agency stats
                stats.byAgency[emp.agency] = (stats.byAgency[emp.agency] || 0) + 1;
                
                // Cost centre stats
                stats.byCostCentre[emp.costCentre] = (stats.byCostCentre[emp.costCentre] || 0) + 1;
                
                // Position stats
                stats.byPosition[emp.position] = (stats.byPosition[emp.position] || 0) + 1;
            });

            return stats;
        } catch (error) {
            console.error('Error getting employee stats:', error);
            throw error;
        }
    }

    // Validation helper
    validateEmployeeData(employeeData) {
        const required = ['employeeNumber', 'name', 'department', 'costCentre', 'position', 'agency', 'hourlyRate'];
        const missing = required.filter(field => !employeeData[field]);
        
        if (missing.length > 0) {
            throw new Error(`Missing required fields: ${missing.join(', ')}`);
        }

        if (isNaN(parseFloat(employeeData.hourlyRate))) {
            throw new Error('Hourly rate must be a number');
        }

        if (parseFloat(employeeData.hourlyRate) <= 0) {
            throw new Error('Hourly rate must be positive');
        }
    }

    // Cost calculation helper
    calculateWeeklyCost(employee) {
        const standardHours = 45; // Standard work week
        const hourlyRate = parseFloat(employee.hourlyRate) || 0;
        return standardHours * hourlyRate;
    }

    // Real-time subscriptions for employee imports
    subscribeToEmployeeImports(callback, limitCount = 10) {
        const q = query(
            collection(db, 'employeeImports'),
            orderBy('uploadedAt', 'desc'),
            limit(limitCount)
        );
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const imports = snapshot.docs.map(doc => ({ 
                id: doc.id, 
                ...doc.data(),
                statusText: this.getImportStatusText(doc.data().status)
            }));
            callback(imports);
        });
        
        this.unsubscribes.set('employeeImports', unsubscribe);
        return unsubscribe;
    }

    getImportStatusText(status) {
        const statusMap = {
            'processing': 'Processing...',
            'completed': 'Completed',
            'failed': 'Failed',
            'validating': 'Validating data'
        };
        return statusMap[status] || status;
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
            { 
                id: '3040034', 
                name: 'General Operations', 
                departments: ['Inbound', 'Inventory', 'Picking', 'Despatch'],
                color: '#3498db'
            },
            { 
                id: '3040038', 
                name: 'Beauty', 
                departments: ['Beauty Inbound', 'Beauty Inventory', 'Beauty Picking', 'Beauty Despatch'],
                color: '#e74c3c'
            },
            { 
                id: '3040040', 
                name: 'Ecom/Bash', 
                departments: ['Ecom', 'Bash'],
                color: '#2ecc71'
            }
        ];
        
        this.cache.set('costCenters', costCenters);
        return costCenters;
    }

    async getAgencies() {
        return ['Adcorp Blu', 'Workforce', 'TFG Permanent', 'Other'];
    }

    async getPositions() {
        return [
            'DCA', 
            'DCA Trainee', 
            'General Worker Historic', 
            'Order Picker/Forklift Driver Historic',
            'Service Delivery Assistant',
            'VNA Operator Historic',
            'Clerk',
            'Assistant Technician Historic',
            'Supervisor',
            'Manager'
        ];
    }
}

// Create global instance
const dataService = new DataService();
export default dataService;
