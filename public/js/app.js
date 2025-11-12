import authService from './auth-service.js';
import dataService from './data-service.js';
import uiComponents from './ui-components.js';

class ShiftGuardApp {
    constructor() {
        this.currentView = 'dashboard';
        this.init();
    }

    init() {
        console.log('Initializing ShiftGuardApp...');
        this.setupEventListeners();
        this.setDefaultDates();
        
        // Hide loading overlay after initialization
        setTimeout(() => {
            this.hideLoadingOverlay();
        }, 1000);
    }

    setupEventListeners() {
        console.log('Setting up event listeners...');
        
        // Login form
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleLogin();
            });
        }

        // Logout button
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleLogout();
            });
        }

        // Navigation
        document.querySelectorAll('a[data-view]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const view = e.target.getAttribute('data-view');
                this.showView(view);
            });
        });

        // Add other event listeners as needed
        this.setupViewSpecificListeners();
    }

    setupViewSpecificListeners() {
        // Timesheet upload
        const uploadBtn = document.getElementById('uploadTimesheetBtn');
        if (uploadBtn) {
            uploadBtn.addEventListener('click', () => {
                this.handleTimesheetUpload();
            });
        }

        // Report generation
        const reportBtn = document.getElementById('generateReportBtn');
        if (reportBtn) {
            reportBtn.addEventListener('click', () => {
                this.handleReportGeneration();
            });
        }

        // Add employee
        const addEmployeeBtn = document.getElementById('addEmployeeBtn');
        if (addEmployeeBtn) {
            addEmployeeBtn.addEventListener('click', () => {
                this.showAddEmployeeModal();
            });
        }
    }

    hideLoadingOverlay() {
        const loadingOverlay = document.querySelector('.loading-overlay');
        if (loadingOverlay) {
            loadingOverlay.style.display = 'none';
        }
    }

    async handleLogin() {
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const errorDiv = document.getElementById('loginError');

        if (!email || !password) {
            this.showMessage('Please enter both email and password', 'warning');
            return;
        }

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
            console.error('Login error:', error);
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
            console.log('Loading initial data...');
            
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

            console.log('Initial data loaded successfully');

        } catch (error) {
            console.error('Error loading initial data:', error);
            uiComponents.showMessage('Error loading data: ' + error.message, 'danger');
        }
    }

    // ... rest of your existing methods ...

    showView(viewName) {
        console.log('Switching to view:', viewName);
        
        // Hide all views
        document.querySelectorAll('.view-section').forEach(view => {
            if (view.id !== 'loginView' && view.id !== 'appView') {
                view.classList.add('d-none');
            }
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

    // ... other methods ...
}

// Initialize the application
let app;
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing app...');
    app = new ShiftGuardApp();
    window.app = app;
});

export default ShiftGuardApp;
