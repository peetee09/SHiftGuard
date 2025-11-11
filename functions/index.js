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

// Process uploaded timesheet
exports.processTimesheet = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }

    const { timesheetId, costCentre } = data;

    try {
        // Update timesheet status
        await admin.firestore().collection('timesheets').doc(timesheetId).update({
            status: 'processing',
            processedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Get timesheet data
        const timesheetDoc = await admin.firestore().collection('timesheets').doc(timesheetId).get();
        const timesheetData = timesheetDoc.data();

        // Process the timesheet file
        const entries = await processTimesheetFile(timesheetData.fileURL, costCentre);
        
        // Calculate costs
        const calculations = await calculateCosts(entries, costCentre);

        // Store calculations in batch
        const batch = admin.firestore().batch();
        calculations.forEach(calc => {
            const calcRef = admin.firestore().collection('calculations').doc();
            batch.set(calcRef, {
                ...calc,
                timesheetId: timesheetId,
                calculatedAt: admin.firestore.FieldValue.serverTimestamp(),
                calculatedBy: context.auth.uid
            });
        });

        await batch.commit();

        // Update timesheet status
        await admin.firestore().collection('timesheets').doc(timesheetId).update({
            status: 'completed',
            processedEntries: entries.length,
            completedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Log success
        await admin.firestore().collection('auditLog').add({
            action: 'timesheet_processed',
            details: {
                timesheetId: timesheetId,
                entriesProcessed: entries.length,
                costCentre: costCentre
            },
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            userEmail: context.auth.token.email,
            userId: context.auth.uid
        });

        return { 
            success: true, 
            processedEntries: entries.length,
            calculations: calculations.length 
        };

    } catch (error) {
        // Update timesheet status to failed
        await admin.firestore().collection('timesheets').doc(timesheetId).update({
            status: 'failed',
            error: error.message,
            completedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Log error
        await admin.firestore().collection('auditLog').add({
            action: 'timesheet_processing_failed',
            details: {
                timesheetId: timesheetId,
                error: error.message
            },
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            userEmail: context.auth.token.email,
            userId: context.auth.uid
        });

        throw new functions.https.HttpsError('internal', 'Processing failed: ' + error.message);
    }
});

// Generate reports
exports.generateReport = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }

    const { reportType, params, requestedBy } = data;

    try {
        let report;

        switch (reportType) {
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

// Helper functions
async function processTimesheetFile(fileURL, costCentre) {
    // This is a simplified implementation
    // In production, you would download and parse the actual file
    
    // Mock data for demonstration
    return [
        {
            employeeId: 'EMP001',
            employeeName: 'John Doe',
            date: '2024-01-15',
            hours: 8.5,
            isNightShift: false,
            department: 'Picking'
        },
        {
            employeeId: 'EMP002',
            employeeName: 'Jane Smith',
            date: '2024-01-15',
            hours: 9.0,
            isNightShift: true,
            department: 'Despatch'
        }
    ];
}

async function calculateCosts(entries, costCentre) {
    const calculations = [];

    for (const entry of entries) {
        // Get employee data
        const employeeSnapshot = await admin.firestore()
            .collection('employees')
            .where('employeeNumber', '==', entry.employeeId)
            .limit(1)
            .get();

        if (employeeSnapshot.empty) {
            console.warn(`Employee not found: ${entry.employeeId}`);
            continue;
        }

        const employee = employeeSnapshot.docs[0].data();
        const calculation = calculateDailyCost(employee, entry, costCentre);
        calculations.push(calculation);
    }

    return calculations;
}

function calculateDailyCost(employee, entry, costCentre) {
    const totalHours = entry.hours;
    const nightShiftHours = entry.isNightShift ? entry.hours : 0;

    let regularHours = 0;
    let overtimeHours = 0;

    if (totalHours <= BUSINESS_RULES.PAID_HOURS_PER_SHIFT) {
        regularHours = totalHours;
    } else {
        regularHours = BUSINESS_RULES.PAID_HOURS_PER_SHIFT;
        overtimeHours = totalHours - BUSINESS_RULES.PAID_HOURS_PER_SHIFT;
    }

    const regularCost = regularHours * employee.hourlyRate;
    const overtimeCost = overtimeHours * employee.hourlyRate * BUSINESS_RULES.OVERTIME_RATE;
    const nightAllowance = nightShiftHours * employee.hourlyRate * BUSINESS_RULES.NIGHTSHIFT_ALLOWANCE_RATE;
    const totalCost = regularCost + overtimeCost + nightAllowance;

    return {
        employeeId: employee.employeeNumber,
        employeeName: employee.name,
        department: employee.department,
        costCentre: costCentre,
        agency: employee.agency,
        calculationDate: entry.date,
        regularHours,
        overtimeHours,
        nightShiftHours,
        regularCost,
        overtimeCost,
        nightAllowance,
        totalCost,
        hourlyRate: employee.hourlyRate
    };
}

async function generateWeeklyReport(params) {
    const { startDate, endDate } = params;

    const calculationsSnapshot = await admin.firestore()
        .collection('calculations')
        .where('calculationDate', '>=', startDate)
        .where('calculationDate', '<=', endDate)
        .get();

    const calculations = calculationsSnapshot.docs.map(doc => doc.data());

    const summary = {
        totalRegularHours: calculations.reduce((sum, calc) => sum + calc.regularHours, 0),
        totalOvertimeHours: calculations.reduce((sum, calc) => sum + calc.overtimeHours, 0),
        totalNightShiftHours: calculations.reduce((sum, calc) => sum + calc.nightShiftHours, 0),
        totalRegularCost: calculations.reduce((sum, calc) => sum + calc.regularCost, 0),
        totalOvertimeCost: calculations.reduce((sum, calc) => sum + calc.overtimeCost, 0),
        totalNightAllowance: calculations.reduce((sum, calc) => sum + calc.nightAllowance, 0),
        totalCost: calculations.reduce((sum, calc) => sum + calc.totalCost, 0)
    };

    return {
        period: { startDate, endDate },
        summary,
        calculations: calculations.length,
        generatedAt: new Date().toISOString()
    };
}

// Add more report generation functions as needed...
