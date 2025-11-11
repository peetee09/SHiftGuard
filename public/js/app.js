import authService from './auth-service.js';
import dataService from './data-service.js';
import uiComponents from './ui-components.js';

class ShiftGuardApp {
    constructor() {
        this.currentView = 'dashboard';
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setDefaultDates();
    }

    setupEventListeners() {
        // Login form
        document.getElementById('loginForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogin();
        });

        // Logout button
        document.getElementById('logoutBtn')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.handleLogout();
        });

        // Navigation
        document.querySelectorAll('a[data-view]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const view = e.target.getAttribute('data-view');
                this.showView(view);
            });
        });

        // Timesheet upload
        document.getElementById('uploadTimesheetBtn')?.addEventListener('click', () => {
            this.handleTimesheetUpload();
        });

        // Report generation
        document.getElementById('generateReportBtn')?.addEventListener('click', () => {
            this.handleReportGeneration();
        });

        // Add employee
        document.getElementById('addEmployeeBtn')?.addEventListener('click', () => {
            this.showAddEmployeeModal();
        });
    }

    async handleLogin() {
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const errorDiv = document.getElementById('loginError');

        uiComponents.showLoading(true);

        try {
            const result = await authService.login(email, password);
            if (result.success) {
                errorDiv.classList.add('d-none');
                await this.loadInitialData();
            } else {
                errorDiv.textContent = result.error;
                errorDiv.classList.remove('d-none');
            }
        } catch (error) {
            errorDiv.textContent = 'Login failed: ' + error.message;
            errorDiv.classList.remove('d-none');
        } finally {
            uiComponents.showLoading(false);
        }
    }

    async handleLogout() {
        uiComponents.showLoading(true);
        await authService.logout();
        uiComponents.showLoading(false);
    }

    async loadInitialData() {
        try {
            uiComponents.showLoading(true);

            // Load employees
            const employees = await dataService.getEmployees();
            uiComponents.renderEmployeeTable(employees);

            // Load recent activity
            const recentActivity = await this.getRecentActivity();
            uiComponents.renderRecentActivity(recentActivity);

            // Load KPI data
            const kpiData = await this.calculateKPIData();
            uiComponents.renderKPICards(kpiData);

            // Load chart data
            const chartData = await this.getChartData();
            uiComponents.renderCostChart(chartData.costData);
            uiComponents.renderDepartmentChart(chartData.departmentData);

            // Set up real-time listeners
            this.setupRealtimeListeners();

        } catch (error) {
            console.error('Error loading initial data:', error);
            uiComponents.showMessage('Error loading data: ' + error.message, 'danger');
        } finally {
            uiComponents.showLoading(false);
        }
    }

    async calculateKPIData() {
        try {
            const calculations = await dataService.getCalculations({
                startDate: this.getStartOfWeek(),
                endDate: new Date().toISOString()
            });

            const kpiData = {
                totalEmployees: calculations.reduce((acc, calc) => acc + 1, 0),
                totalHours: calculations.reduce((acc, calc) => acc + calc.regularHours + calc.overtimeHours, 0),
                overtimeHours: calculations.reduce((acc, calc) => acc + calc.overtimeHours, 0),
                totalCost: calculations.reduce((acc, calc) => acc + calc.totalCost, 0)
            };

            return kpiData;
        } catch (error) {
            console.error('Error calculating KPI data:', error);
            return { totalEmployees: 0, totalHours: 0, overtimeHours: 0, totalCost: 0 };
        }
    }

    async getChartData() {
        // Mock data - replace with actual data from Firestore
        return {
            costData: {
                labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                regularCosts: [12000, 11500, 13000, 12500, 14000, 8000, 5000],
                overtimeCosts: [2000, 1800, 2500, 2200, 3000, 1500, 800],
                nightAllowances: [1200, 1100, 1300, 1250, 1400, 800, 500]
            },
            departmentData: {
                labels: ['Picking', 'Despatch', 'Inventory', 'Inbound', 'Beauty'],
                values: [35, 25, 20, 15, 5]
            }
        };
    }

    async getRecentActivity(limit = 10) {
        try {
            // This would query the auditLog collection
            // For now, return mock data
            return [
                {
                    action: 'timesheet_uploaded',
                    details: { fileName: 'timesheet_october.csv' },
                    timestamp: new Date(Date.now() - 1000 * 60 * 30) // 30 minutes ago
                },
                {
                    action: 'login_success',
                    details: { email: 'manager@company.com' },
                    timestamp: new Date(Date.now() - 1000 * 60 * 60) // 1 hour ago
                }
            ];
        } catch (error) {
            console.error('Error loading recent activity:', error);
            return [];
        }
    }

    setupRealtimeListeners() {
        // Real-time employee updates
        dataService.subscribeToEmployees((employees) => {
            uiComponents.renderEmployeeTable(employees);
        });

        // Real-time timesheet updates
        dataService.subscribeToTimesheets((timesheets) => {
            this.updateRecentUploads(timesheets);
        });
    }

    async handleTimesheetUpload() {
        const fileInput = document.getElementById('timesheetFile');
        const costCenterSelect = document.getElementById('costCenterSelect');
        
        if (!fileInput.files.length) {
            uiComponents.showMessage('Please select a file to upload', 'warning');
            return;
        }

        const file = fileInput.files[0];
        const costCentre = costCenterSelect.value;

        uiComponents.showLoading(true);

        try {
            const progressDiv = document.getElementById('uploadProgress');
            const progressBar = progressDiv.querySelector('.progress-bar');
            const statusText = document.getElementById('uploadStatus');

            progressDiv.classList.remove('d-none');
            progressBar.style.width = '25%';
            statusText.textContent = 'Uploading file...';

            const metadata = {
                costCentre: costCentre,
                uploadType: 'timesheet',
                originalFileName: file.name
            };

            const timesheetId = await dataService.uploadTimesheet(file, metadata);
            
            progressBar.style.width = '50%';
            statusText.textContent = 'Processing timesheet...';

            // Monitor processing status
            this.monitorTimesheetProcessing(timesheetId, progressBar, statusText);

        } catch (error) {
            uiComponents.showMessage('Upload failed: ' + error.message, 'danger');
            uiComponents.showLoading(false);
        }
    }

    monitorTimesheetProcessing(timesheetId, progressBar, statusText) {
        // This would set up a real-time listener for the timesheet document
        // For now, simulate processing
        setTimeout(() => {
            progressBar.style.width = '100%';
            statusText.textContent = 'Processing complete!';
            
            setTimeout(() => {
                document.getElementById('uploadProgress').classList.add('d-none');
                uiComponents.showLoading(false);
                uiComponents.showMessage('Timesheet processed successfully!', 'success');
            }, 1000);
        }, 3000);
    }

    async handleReportGeneration() {
        const reportType = document.getElementById('reportType').value;
        const startDate = document.getElementById('startDate').value;
        const endDate = document.getElementById('endDate').value;

        if (!startDate || !endDate) {
            uiComponents.showMessage('Please select both start and end dates', 'warning');
            return;
        }

        uiComponents.showLoading(true);

        try {
            const report = await dataService.generateReport(reportType, {
                startDate,
                endDate
            });

            this.displayReportResults(report);
            uiComponents.showMessage('Report generated successfully!', 'success');

        } catch (error) {
            uiComponents.showMessage('Report generation failed: ' + error.message, 'danger');
        } finally {
            uiComponents.showLoading(false);
        }
    }

    displayReportResults(report) {
        const container = document.getElementById('reportResults');
        if (!container) return;

        container.innerHTML = `
            <div class="alert alert-info">
                <h6>Report Generated</h6>
                <p>Type: ${report.reportType}</p>
                <p>Period: ${report.period?.startDate} to ${report.period?.endDate}</p>
                <p>Generated at: ${new Date().toLocaleString()}</p>
            </div>
            <div class="mt-3">
                <button class="btn btn-success" onclick="app.exportReport()">
                    <i class="bi bi-download"></i> Export Report
                </button>
            </div>
        `;
    }

    showView(viewName) {
        // Hide all views
        document.querySelectorAll('.view-section').forEach(view => {
            view.classList.add('d-none');
        });

        // Show selected view
        const targetView = document.getElementById(viewName + 'View');
        if (targetView) {
            targetView.classList.remove('d-none');
        }

        // Update active navigation
        document.querySelectorAll('a[data-view]').forEach(link => {
            link.classList.remove('active');
        });
        
        const activeLink = document.querySelector(`a[data-view="${viewName}"]`);
        if (activeLink) {
            activeLink.classList.add('active');
        }

        this.currentView = viewName;

        // Load view-specific data
        this.loadViewData(viewName);
    }

    loadViewData(viewName) {
        switch (viewName) {
            case 'dashboard':
                this.loadDashboardData();
                break;
            case 'employees':
                this.loadEmployeesData();
                break;
            case 'timesheets':
                this.loadTimesheetsData();
                break;
            case 'reports':
                this.loadReportsData();
                break;
            case 'admin':
                if (authService.hasPermission('admin')) {
                    this.loadAdminData();
                } else {
                    this.showView('dashboard');
                    uiComponents.showMessage('Access denied', 'warning');
                }
                break;
        }
    }

    async loadDashboardData() {
        // Dashboard data is loaded in initial load
    }

    async loadEmployeesData() {
        try {
            const employees = await dataService.getEmployees();
            uiComponents.renderEmployeeTable(employees);
        } catch (error) {
            uiComponents.showMessage('Error loading employees: ' + error.message, 'danger');
        }
    }

    async loadTimesheetsData() {
        // Implementation for loading timesheets data
    }

    async loadReportsData() {
        // Implementation for loading reports data
    }

    async loadAdminData() {
        // Implementation for loading admin data
    }

    // Utility Methods
    setDefaultDates() {
        const today = new Date();
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay());
        
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);

        document.getElementById('startDate').value = startOfWeek.toISOString().split('T')[0];
        document.getElementById('endDate').value = endOfWeek.toISOString().split('T')[0];
    }

    getStartOfWeek() {
        const now = new Date();
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        return startOfWeek.toISOString();
    }

    exportReport() {
        // Implementation for exporting reports
        uiComponents.showMessage('Export functionality coming soon!', 'info');
    }

    showAddEmployeeModal() {
        // Implementation for showing add employee modal
        uiComponents.showMessage('Add employee functionality coming soon!', 'info');
    }
}

// Initialize the application
const app = new ShiftGuardApp();

// Make app available globally for HTML onclick handlers
window.app = app;
window.uiComponents = uiComponents;

export default app;
