const functions = require('firebase-functions');
const admin = require('firebase-admin');
const XLSX = require('xlsx');
const { parse } = require('csv-parse/sync');

admin.initializeApp();

const BUSINESS_RULES = {
    DAY_SHIFT_HOURS: 8.5,
    NIGHT_SHIFT_HOURS: 8,
    PAID_HOURS_PER_SHIFT: 7.5,
    STANDARD_HOURS_PER_WEEK: 45,
    OVERTIME_RATE: 1.5,
    NIGHTSHIFT_ALLOWANCE_RATE: 0.10
};

// Process employee data from Excel/CSV
exports.processEmployeeImport = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }

    const { importId, costCentre } = data;

    try {
        // Update import status
        await admin.firestore().collection('employeeImports').doc(importId).update({
            status: 'processing',
            processedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Get import data
        const importDoc = await admin.firestore().collection('employeeImports').doc(importId).get();
        const importData = importDoc.data();

        // Download and process file
        const employees = await processEmployeeFile(importData.fileURL, costCentre);
        
        // Validate and process employees
        const results = await processEmployeeData(employees, costCentre, context.auth.uid);

        // Update import status
        await admin.firestore().collection('employeeImports').doc(importId).update({
            status: 'completed',
            processedEmployees: results.processed,
            errors: results.errors,
            completedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Log success
        await admin.firestore().collection('auditLog').add({
            action: 'employee_import_completed',
            details: {
                importId: importId,
                processed: results.processed,
                errors: results.errors.length,
                costCentre: costCentre
            },
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            userEmail: context.auth.token.email,
            userId: context.auth.uid
        });

        return { 
            success: true, 
            processed: results.processed,
            errors: results.errors,
            total: employees.length
        };

    } catch (error) {
        // Update import status to failed
        await admin.firestore().collection('employeeImports').doc(importId).update({
            status: 'failed',
            error: error.message,
            completedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Log error
        await admin.firestore().collection('auditLog').add({
            action: 'employee_import_failed',
            details: {
                importId: importId,
                error: error.message
            },
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            userEmail: context.auth.token.email,
            userId: context.auth.uid
        });

        throw new functions.https.HttpsError('internal', 'Import failed: ' + error.message);
    }
});

// Process employee file (Excel/CSV)
async function processEmployeeFile(fileURL, costCentre) {
    try {
        // In a real implementation, you would:
        // 1. Download the file from Firebase Storage
        // 2. Parse based on file type (Excel or CSV)
        // 3. Convert to standardized format
        
        // Mock implementation - replace with actual file processing
        const mockEmployees = [
            {
                employeeNumber: 'M1164899',
                name: 'Sibongiseni Ernest Khumalo',
                position: 'DCA',
                department: 'Beauty Picking',
                costCentre: '3040034',
                agency: 'Adcorp Blu',
                hourlyRate: 39.34,
                billRate: 55.86,
                rateGroup: 'Rate 1'
            },
            {
                employeeNumber: 'M1162371',
                name: 'Thabo Godfrey Junior Kgatuke',
                position: 'DCA',
                department: 'Inventory',
                costCentre: '3040034',
                agency: 'Adcorp Blu',
                hourlyRate: 39.34,
                billRate: 55.86,
                rateGroup: 'Rate 1'
            }
        ];

        return mockEmployees;
    } catch (error) {
        console.error('Error processing employee file:', error);
        throw error;
    }
}

// Process and validate employee data
async function processEmployeeData(employees, costCentre, userId) {
    const results = {
        processed: 0,
        errors: []
    };

    const batch = admin.firestore().batch();

    for (const [index, employee] of employees.entries()) {
        try {
            // Validate employee data
            validateEmployee(employee);

            // Generate a unique ID or use employee number
            const employeeId = employee.employeeNumber || `emp_${Date.now()}_${index}`;
            const employeeRef = admin.firestore().collection('employees').doc(employeeId);

            // Prepare employee data
            const employeeData = {
                ...employee,
                costCentre: costCentre,
                isActive: true,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                importedBy: userId,
                // Ensure numeric fields
                hourlyRate: parseFloat(employee.hourlyRate) || 0,
                billRate: parseFloat(employee.billRate) || 0
            };

            batch.set(employeeRef, employeeData);
            results.processed++;

        } catch (error) {
            results.errors.push({
                employee: employee.name || `Employee ${index}`,
                error: error.message
            });
        }
    }

    // Commit the batch
    if (results.processed > 0) {
        await batch.commit();
    }

    return results;
}

// Validate employee data
function validateEmployee(employee) {
    const required = ['employeeNumber', 'name', 'position', 'department', 'agency'];
    const missing = required.filter(field => !employee[field]);
    
    if (missing.length > 0) {
        throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }

    if (!employee.hourlyRate || isNaN(parseFloat(employee.hourlyRate))) {
        throw new Error('Invalid hourly rate');
    }

    if (parseFloat(employee.hourlyRate) <= 0) {
        throw new Error('Hourly rate must be positive');
    }

    // Validate cost centre
    const validCostCentres = ['3040034', '3040038', '3040040'];
    if (employee.costCentre && !validCostCentres.includes(employee.costCentre)) {
        throw new Error(`Invalid cost centre: ${employee.costCentre}`);
    }
}

// Keep the existing timesheet processing function
exports.processTimesheet = functions.https.onCall(async (data, context) => {
    // ... existing timesheet processing code ...
});

// Enhanced report generation
exports.generateReport = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }

    const { reportType, params, requestedBy } = data;

    try {
        let report;

        switch (reportType) {
            case 'employee_analysis':
                report = await generateEmployeeAnalysisReport(params);
                break;
            case 'cost_breakdown':
                report = await generateCostBreakdownReport(params);
                break;
            case 'weekly':
                report = await generateWeeklyReport(params);
                break;
            case 'department':
                report = await generateDepartmentReport(params);
                break;
            case 'agency':
                report = await generateAgencyReport(params);
                break;
            case 'overtime':
                report = await generateOvertimeReport(params);
                break;
            default:
                throw new Error('Unknown report type: ' + reportType);
        }

        // Store report
        const reportRef = await admin.firestore().collection('reports').add({
            ...report,
            reportType: reportType,
            generatedAt: admin.firestore.FieldValue.serverTimestamp(),
            generatedBy: context.auth.uid,
            parameters: params
        });

        return { 
            success: true, 
            reportId: reportRef.id,
            report: report
        };

    } catch (error) {
        throw new functions.https.HttpsError('internal', 'Report generation failed: ' + error.message);
    }
});

// Employee analysis report
async function generateEmployeeAnalysisReport(params) {
    const { costCentre, department } = params;

    let query = admin.firestore().collection('employees').where('isActive', '==', true);
    
    if (costCentre) {
        query = query.where('costCentre', '==', costCentre);
    }
    if (department) {
        query = query.where('department', '==', department);
    }

    const snapshot = await query.get();
    const employees = snapshot.docs.map(doc => doc.data());

    const analysis = {
        totalEmployees: employees.length,
        totalWeeklyCost: employees.reduce((sum, emp) => sum + (45 * (emp.hourlyRate || 0)), 0),
        averageHourlyRate: employees.reduce((sum, emp) => sum + (emp.hourlyRate || 0), 0) / employees.length,
        byPosition: {},
        byDepartment: {},
        byAgency: {}
    };

    employees.forEach(emp => {
        // Position analysis
        analysis.byPosition[emp.position] = analysis.byPosition[emp.position] || { count: 0, totalCost: 0 };
        analysis.byPosition[emp.position].count++;
        analysis.byPosition[emp.position].totalCost += 45 * (emp.hourlyRate || 0);

        // Department analysis
        analysis.byDepartment[emp.department] = analysis.byDepartment[emp.department] || { count: 0, totalCost: 0 };
        analysis.byDepartment[emp.department].count++;
        analysis.byDepartment[emp.department].totalCost += 45 * (emp.hourlyRate || 0);

        // Agency analysis
        analysis.byAgency[emp.agency] = analysis.byAgency[emp.agency] || { count: 0, totalCost: 0 };
        analysis.byAgency[emp.agency].count++;
        analysis.byAgency[emp.agency].totalCost += 45 * (emp.hourlyRate || 0);
    });

    return {
        reportType: 'employee_analysis',
        period: { generated: new Date().toISOString() },
        analysis,
        employees: employees.map(emp => ({
            name: emp.name,
            employeeNumber: emp.employeeNumber,
            position: emp.position,
            department: emp.department,
            agency: emp.agency,
            hourlyRate: emp.hourlyRate,
            weeklyCost: 45 * (emp.hourlyRate || 0)
        }))
    };
}

// Add other report functions as needed...
