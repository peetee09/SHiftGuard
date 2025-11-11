import { db, storage, functions, collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc, query, where, orderBy, limit, onSnapshot, writeBatch, serverTimestamp, ref, uploadBytes, getDownloadURL, httpsCallable } from './firebase-config.js';
import authService from './auth-service.js';

class DataService {
    constructor() {
        this.unsubscribes = new Map();
        this.cache = new Map();
        this.BUSINESS_RULES = {
            DAY_SHIFT_HOURS: 8.5,
            NIGHT_SHIFT_HOURS: 8,
            PAID_HOURS_PER_SHIFT: 7.5,
            STANDARD_HOURS_PER_WEEK: 45,
            OVERTIME_RATE: 1.5,
            NIGHTSHIFT_ALLOWANCE_RATE: 0.10,
            COMFORT_BREAK_MINUTES: 20,
            TEA_BREAK_MINUTES: 30,
            LUNCH_BREAK_MINUTES: 60
        };
    }

    // ==================== LOST HOURS CALCULATIONS ====================

    /**
     * Calculate lost hours from employee shifts
     * @param {Array} employeeShifts - Array of shift objects
     * @returns {Object} Comprehensive lost hours analysis
     */
    calculateLostHours(employeeShifts) {
        const lostHoursData = {
            totalLostHours: 0,
            totalLostCost: 0,
            byDepartment: {},
            byAgency: {},
            byCostCentre: {},
            byEmployee: [],
            dailyBreakdown: {},
            efficiencyMetrics: {
                overallEfficiency: 0,
                departmentEfficiency: {},
                totalScheduledHours: 0,
                totalActualHours: 0
            },
            alerts: [],
            trends: []
        };

        let totalScheduled = 0;
        let totalActual = 0;

        employeeShifts.forEach(shift => {
            const scheduledHours = this.BUSINESS_RULES.PAID_HOURS_PER_SHIFT;
            const actualHours = shift.totalHours || 0;
            const lostHours = Math.max(0, scheduledHours - actualHours);
            
            // Track totals for efficiency calculation
            totalScheduled += scheduledHours;
            totalActual += actualHours;

            if (lostHours > 0) {
                const lostCost = lostHours * (shift.hourlyRate || 0);
                
                // Aggregate totals
                lostHoursData.totalLostHours += lostHours;
                lostHoursData.totalLostCost += lostCost;
                
                // Department breakdown
                if (!lostHoursData.byDepartment[shift.department]) {
                    lostHoursData.byDepartment[shift.department] = {
                        lostHours: 0,
                        lostCost: 0,
                        employees: 0,
                        efficiency: 0,
                        scheduledHours: 0,
                        actualHours: 0
                    };
                }
                lostHoursData.byDepartment[shift.department].lostHours += lostHours;
                lostHoursData.byDepartment[shift.department].lostCost += lostCost;
                lostHoursData.byDepartment[shift.department].employees++;
                lostHoursData.byDepartment[shift.department].scheduledHours += scheduledHours;
                lostHoursData.byDepartment[shift.department].actualHours += actualHours;
                
                // Agency breakdown
                if (!lostHoursData.byAgency[shift.agency]) {
                    lostHoursData.byAgency[shift.agency] = {
                        lostHours: 0,
                        lostCost: 0,
                        employees: 0
                    };
                }
                lostHoursData.byAgency[shift.agency].lostHours += lostHours;
                lostHoursData.byAgency[shift.agency].lostCost += lostCost;
                lostHoursData.byAgency[shift.agency].employees++;
                
                // Cost centre breakdown
                if (!lostHoursData.byCostCentre[shift.costCentre]) {
                    lostHoursData.byCostCentre[shift.costCentre] = {
                        lostHours: 0,
                        lostCost: 0,
                        employees: 0
                    };
                }
                lostHoursData.byCostCentre[shift.costCentre].lostHours += lostHours;
                lostHoursData.byCostCentre[shift.costCentre].lostCost += lostCost;
                lostHoursData.byCostCentre[shift.costCentre].employees++;
                
                // Daily breakdown
                const dateKey = shift.date || 'unknown';
                if (!lostHoursData.dailyBreakdown[dateKey]) {
                    lostHoursData.dailyBreakdown[dateKey] = {
                        lostHours: 0,
                        lostCost: 0,
                        employees: 0
                    };
                }
                lostHoursData.dailyBreakdown[dateKey].lostHours += lostHours;
                lostHoursData.dailyBreakdown[dateKey].lostCost += lostCost;
                lostHoursData.dailyBreakdown[dateKey].employees++;
                
                // Employee details
                const efficiency = (actualHours / scheduledHours) * 100;
                lostHoursData.byEmployee.push({
                    id: shift.employeeId,
                    name: shift.employeeName,
                    employeeNumber: shift.employeeNumber,
                    department: shift.department,
                    agency: shift.agency,
                    costCentre: shift.costCentre,
                    scheduledHours,
                    actualHours,
                    lostHours,
                    lostCost,
                    hourlyRate: shift.hourlyRate,
                    date: shift.date,
                    efficiency: efficiency,
                    status: this.getEfficiencyStatus(efficiency)
                });

                // Generate alerts for significant lost hours
                if (lostHours > 2) {
                    lostHoursData.alerts.push({
                        type: 'high_lost_hours',
                        employee: shift.employeeName,
                        department: shift.department,
                        lostHours: lostHours,
                        cost: lostCost,
                        date: shift.date,
                        severity: lostHours > 3 ? 'high' : 'medium'
                    });
                }
            }
        });

        // Calculate efficiency metrics
        lostHoursData.efficiencyMetrics.totalScheduledHours = totalScheduled;
        lostHoursData.efficiencyMetrics.totalActualHours = totalActual;
        lostHoursData.efficiencyMetrics.overallEfficiency = totalScheduled > 0 ? 
            (totalActual / totalScheduled) * 100 : 0;

        // Calculate department efficiencies
        Object.keys(lostHoursData.byDepartment).forEach(dept => {
            const deptData = lostHoursData.byDepartment[dept];
            deptData.efficiency = deptData.scheduledHours > 0 ? 
                (deptData.actualHours / deptData.scheduledHours) * 100 : 0;
        });

        // Sort employees by lost hours (highest first)
        lostHoursData.byEmployee.sort((a, b) => b.lostHours - a.lostHours);

        return lostHoursData;
    }

    /**
     * Get lost hours trends over time
     * @param {string} timeframe - Time period for trends ('7d', '30d', '90d')
     * @returns {Array} Trend data
     */
    async getLostHoursTrends(timeframe = '30d') {
        try {
            const calculations = await this.getCalculations({ timeframe });
            
            const trends = calculations.reduce((acc, calc) => {
                const date = calc.calculationDate?.split('T')[0] || 'unknown';
                const lostHours = Math.max(0, this.BUSINESS_RULES.PAID_HOURS_PER_SHIFT - calc.regularHours);
                
                if (!acc[date]) {
                    acc[date] = { 
                        lostHours: 0, 
                        cost: 0, 
                        employees: 0,
                        departments: new Set(),
                        totalScheduled: 0,
                        totalActual: 0
                    };
                }
                
                acc[date].lostHours += lostHours;
                acc[date].cost += lostHours * calc.hourlyRate;
                acc[date].employees++;
                acc[date].departments.add(calc.department);
                acc[date].totalScheduled += this.BUSINESS_RULES.PAID_HOURS_PER_SHIFT;
                acc[date].totalActual += calc.regularHours;
                
                return acc;
            }, {});
            
            return Object.entries(trends)
                .sort(([dateA], [dateB]) => new Date(dateA) - new Date(dateB))
                .map(([date, data]) => ({
                    date,
                    lostHours: data.lostHours,
                    cost: data.cost,
                    employees: data.employees,
                    departments: data.departments.size,
                    averagePerEmployee: data.lostHours / data.employees,
                    efficiency: (data.totalActual / data.totalScheduled) * 100,
                    trend: this.calculateDailyTrend(trends, date)
                }));
        } catch (error) {
            console.error('Error getting lost hours trends:', error);
            return [];
        }
    }

    /**
     * Get department-wise lost hours analysis
     * @param {string} department - Specific department filter
     * @returns {Object} Department analysis
     */
    async getDepartmentLostHoursAnalysis(department = null) {
        try {
            const filters = {};
            if (department) filters.department = department;
            
            const calculations = await this.getCalculations(filters);
            const lostHoursData = this.calculateLostHours(calculations);
            
            // Add department-specific insights
            const analysis = {
                summary: {
                    totalEmployees: calculations.length,
                    totalLostHours: lostHoursData.totalLostHours,
                    totalLostCost: lostHoursData.totalLostCost,
                    averageEfficiency: lostHoursData.efficiencyMetrics.overallEfficiency
                },
                departments: lostHoursData.byDepartment,
                topIssues: lostHoursData.byEmployee.slice(0, 10),
                recommendations: this.generateLostHoursRecommendations(lostHoursData),
                trends: await this.getLostHoursTrends('30d')
            };

            return analysis;
        } catch (error) {
            console.error('Error in department lost hours analysis:', error);
            throw error;
        }
    }

    /**
     * Generate actionable recommendations from lost hours data
     * @param {Object} lostHoursData - Lost hours analysis
     * @returns {Array} Recommendation objects
     */
    generateLostHoursRecommendations(lostHoursData) {
        const recommendations = [];

        // Department-specific recommendations
        Object.entries(lostHoursData.byDepartment).forEach(([dept, data]) => {
            if (data.efficiency < 85) {
                recommendations.push({
                    type: 'department_efficiency',
                    department: dept,
                    currentEfficiency: Math.round(data.efficiency),
                    targetEfficiency: 90,
                    potentialSavings: data.lostCost * 4, // Monthly projection
                    action: `Implement efficiency improvements in ${dept}`,
                    priority: data.efficiency < 80 ? 'high' : 'medium'
                });
            }
        });

        // High lost hours individuals
        lostHoursData.byEmployee.slice(0, 5).forEach(emp => {
            if (emp.lostHours > 2) {
                recommendations.push({
                    type: 'individual_performance',
                    employee: emp.name,
                    department: emp.department,
                    lostHours: emp.lostHours,
                    cost: emp.lostCost,
                    action: `Schedule performance review with ${emp.name}`,
                    priority: emp.lostHours > 3 ? 'high' : 'medium'
                });
            }
        });

        // Agency performance
        Object.entries(lostHoursData.byAgency).forEach(([agency, data]) => {
            const avgLostPerEmployee = data.lostHours / data.employees;
            if (avgLostPerEmployee > 1.5) {
                recommendations.push({
                    type: 'agency_performance',
                    agency: agency,
                    averageLostHours: avgLostPerEmployee.toFixed(1),
                    totalCost: data.lostCost,
                    action: `Review contract and performance with ${agency}`,
                    priority: avgLostPerEmployee > 2 ? 'high' : 'medium'
                });
            }
        });

        return recommendations.sort((a, b) => {
            const priorityOrder = { high: 3, medium: 2, low: 1 };
            return priorityOrder[b.priority] - priorityOrder[a.priority];
        });
    }

    // ==================== ENHANCED EMPLOYEE MANAGEMENT ====================

    /**
     * Get employees with lost hours calculations
     * @param {Object} filters - Filter criteria
     * @returns {Array} Employees with lost hours data
     */
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
            const employees = snapshot.docs.map(doc => ({ 
                id: doc.id, 
                ...doc.data()
            }));

            // Enhance with lost hours calculations
            return await this.enhanceEmployeesWithLostHours(employees);
        } catch (error) {
            console.error('Error fetching employees:', error);
            throw error;
        }
    }

    /**
     * Enhance employee data with lost hours calculations
     * @param {Array} employees - Basic employee data
     * @returns {Array} Enhanced employee data
     */
    async enhanceEmployeesWithLostHours(employees) {
        try {
            // Get recent calculations for these employees
            const employeeIds = employees.map(emp => emp.employeeNumber || emp.id);
            const calculations = await this.getCalculations({ 
                employeeIds,
                timeframe: '7d'
            });

            // Group calculations by employee
            const calculationsByEmployee = calculations.reduce((acc, calc) => {
                const empId = calc.employeeId;
                if (!acc[empId]) acc[empId] = [];
                acc[empId].push(calc);
                return acc;
            }, {});

            // Enhance each employee with lost hours data
            return employees.map(emp => {
                const empCalculations = calculationsByEmployee[emp.employeeNumber || emp.id] || [];
                const lostHoursData = this.calculateEmployeeLostHours(empCalculations);
                
                return {
                    ...emp,
                    ...lostHoursData,
                    calculations: empCalculations.length,
                    lastActivity: empCalculations.length > 0 ? 
                        empCalculations[0].calculationDate : null
                };
            });
        } catch (error) {
            console.error('Error enhancing employees with lost hours:', error);
            return employees; // Return basic data if enhancement fails
        }
    }

    /**
     * Calculate lost hours for a single employee
     * @param {Array} calculations - Employee's time calculations
     * @returns {Object} Employee lost hours summary
     */
    calculateEmployeeLostHours(calculations) {
        const summary = {
            totalLostHours: 0,
            totalLostCost: 0,
            averageEfficiency: 0,
            shiftsWorked: calculations.length,
            recentLostHours: 0,
            trend: 'stable'
        };

        if (calculations.length === 0) return summary;

        let totalScheduled = 0;
        let totalActual = 0;

        calculations.forEach(calc => {
            const scheduled = this.BUSINESS_RULES.PAID_HOURS_PER_SHIFT;
            const actual = calc.regularHours || 0;
            const lostHours = Math.max(0, scheduled - actual);
            
            totalScheduled += scheduled;
            totalActual += actual;
            summary.totalLostHours += lostHours;
            summary.totalLostCost += lostHours * (calc.hourlyRate || 0);
        });

        // Calculate efficiency
        summary.averageEfficiency = totalScheduled > 0 ? 
            (totalActual / totalScheduled) * 100 : 0;

        // Recent lost hours (last 3 shifts)
        const recentShifts = calculations.slice(0, 3);
        summary.recentLostHours = recentShifts.reduce((sum, calc) => {
            const scheduled = this.BUSINESS_RULES.PAID_HOURS_PER_SHIFT;
            const actual = calc.regularHours || 0;
            return sum + Math.max(0, scheduled - actual);
        }, 0);

        // Calculate trend
        if (calculations.length >= 2) {
            const firstHalf = calculations.slice(0, Math.floor(calculations.length / 2));
            const secondHalf = calculations.slice(Math.floor(calculations.length / 2));
            
            const firstEfficiency = this.calculateEfficiencyForShifts(firstHalf);
            const secondEfficiency = this.calculateEfficiencyForShifts(secondHalf);
            
            summary.trend = secondEfficiency > firstEfficiency ? 'improving' : 
                          secondEfficiency < firstEfficiency ? 'declining' : 'stable';
        }

        return summary;
    }

    // ==================== CALCULATIONS MANAGEMENT ====================

    /**
     * Get calculations with advanced filtering
     * @param {Object} filters - Filter criteria
     * @returns {Array} Calculation data
     */
    async getCalculations(filters = {}) {
        try {
            let q = collection(db, 'calculations');
            
            // Apply filters
            if (filters.costCentre) {
                q = query(q, where('costCentre', '==', filters.costCentre));
            }
            if (filters.department) {
                q = query(q, where('department', '==', filters.department));
            }
            if (filters.agency) {
                q = query(q, where('agency', '==', filters.agency));
            }
            if (filters.employeeIds) {
                // Firestore doesn't support OR queries easily, so we'll filter client-side
            }
            if (filters.startDate && filters.endDate) {
                q = query(q, 
                    where('calculationDate', '>=', filters.startDate),
                    where('calculationDate', '<=', filters.endDate)
                );
            }
            
            // Timeframe filter
            if (filters.timeframe) {
                const startDate = this.getStartDateFromTimeframe(filters.timeframe);
                q = query(q, where('calculationDate', '>=', startDate));
            }
            
            q = query(q, orderBy('calculationDate', 'desc'), limit(1000));
            
            const snapshot = await getDocs(q);
            let calculations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Apply client-side filters
            if (filters.employeeIds) {
                calculations = calculations.filter(calc => 
                    filters.employeeIds.includes(calc.employeeId)
                );
            }

            return calculations;
        } catch (error) {
            console.error('Error fetching calculations:', error);
            throw error;
        }
    }

    // ==================== FILE PROCESSING ====================

    /**
     * Process employee data from Excel/CSV
     * @param {File} file - Employee data file
     * @param {Object} metadata - Import metadata
     * @returns {string} Import ID
     */
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
                error: null,
                type: 'employee_data'
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

    // ==================== UTILITY METHODS ====================

    /**
     * Get efficiency status based on percentage
     * @param {number} efficiency - Efficiency percentage
     * @returns {string} Status label
     */
    getEfficiencyStatus(efficiency) {
        if (efficiency >= 95) return 'excellent';
        if (efficiency >= 90) return 'good';
        if (efficiency >= 85) return 'fair';
        if (efficiency >= 80) return 'needs_improvement';
        return 'poor';
    }

    /**
     * Calculate daily trend for lost hours
     * @param {Object} trends - Trends data
     * @param {string} currentDate - Current date
     * @returns {string} Trend direction
     */
    calculateDailyTrend(trends, currentDate) {
        const dates = Object.keys(trends).sort();
        const currentIndex = dates.indexOf(currentDate);
        
        if (currentIndex < 1) return 'stable';
        
        const prevDate = dates[currentIndex - 1];
        const currentLost = trends[currentDate].lostHours;
        const prevLost = trends[prevDate].lostHours;
        
        if (currentLost < prevLost) return 'improving';
        if (currentLost > prevLost) return 'declining';
        return 'stable';
    }

    /**
     * Calculate efficiency for a set of shifts
     * @param {Array} shifts - Shift calculations
     * @returns {number} Efficiency percentage
     */
    calculateEfficiencyForShifts(shifts) {
        if (shifts.length === 0) return 0;
        
        const totalScheduled = shifts.length * this.BUSINESS_RULES.PAID_HOURS_PER_SHIFT;
        const totalActual = shifts.reduce((sum, shift) => sum + (shift.regularHours || 0), 0);
        
        return (totalActual / totalScheduled) * 100;
    }

    /**
     * Get start date from timeframe string
     * @param {string} timeframe - Timeframe identifier
     * @returns {string} ISO date string
     */
    getStartDateFromTimeframe(timeframe) {
        const now = new Date();
        const startDate = new Date(now);
        
        switch (timeframe) {
            case '7d':
                startDate.setDate(now.getDate() - 7);
                break;
            case '30d':
                startDate.setDate(now.getDate() - 30);
                break;
            case '90d':
                startDate.setDate(now.getDate() - 90);
                break;
            default:
                startDate.setDate(now.getDate() - 30);
        }
        
        return startDate.toISOString();
    }

    // ==================== REAL-TIME SUBSCRIPTIONS ====================

    subscribeToEmployees(callback, filters = {}) {
        let q = collection(db, 'employees');
        q = query(q, where('isActive', '==', true), orderBy('name'));
        
        const unsubscribe = onSnapshot(q, async (snapshot) => {
            const employees = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const enhancedEmployees = await this.enhanceEmployeesWithLostHours(employees);
            callback(enhancedEmployees);
        });
        
        this.unsubscribes.set('employees', unsubscribe);
        return unsubscribe;
    }

    subscribeToCalculations(callback, filters = {}) {
        let q = collection(db, 'calculations');
        q = query(q, orderBy('calculationDate', 'desc'), limit(50));
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const calculations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback(calculations);
        });
        
        this.unsubscribes.set('calculations', unsubscribe);
        return unsubscribe;
    }

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

    // ==================== CLEANUP ====================

    cleanup() {
        this.unsubscribes.forEach(unsubscribe => unsubscribe());
        this.unsubscribes.clear();
        this.cache.clear();
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

    // ==================== CONFIGURATION DATA ====================

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

    async getBusinessRules() {
        return this.BUSINESS_RULES;
    }
}

// Create global instance
const dataService = new DataService();
export default dataService;
