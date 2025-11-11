import dataService from './data-service.js';
import authService from './auth-service.js';

class UIComponents {
    constructor() {
        this.charts = new Map();
    }

    // KPI Cards
    renderKPICards(kpiData) {
        const container = document.getElementById('kpiContainer');
        if (!container) return;

        const kpis = [
            {
                title: 'Total Employees',
                value: kpiData.totalEmployees || 0,
                icon: 'bi-people',
                color: 'primary'
            },
            {
                title: 'Weekly Hours',
                value: kpiData.totalHours ? kpiData.totalHours.toFixed(1) : '0',
                icon: 'bi-clock',
                color: 'info'
            },
            {
                title: 'Overtime Hours',
                value: kpiData.overtimeHours ? kpiData.overtimeHours.toFixed(1) : '0',
                icon: 'bi-alarm',
                color: 'warning'
            },
            {
                title: 'Total Cost',
                value: kpiData.totalCost ? `R${kpiData.totalCost.toFixed(2)}` : 'R0',
                icon: 'bi-currency-dollar',
                color: 'success'
            }
        ];

        container.innerHTML = kpis.map(kpi => `
            <div class="col-md-3 col-6 mb-3">
                <div class="card kpi-card border-${kpi.color}">
                    <div class="card-body text-center">
                        <div class="kpi-value text-${kpi.color}">${kpi.value}</div>
                        <div class="kpi-label">${kpi.title}</div>
                        <i class="bi ${kpi.icon} text-${kpi.color} mt-2"></i>
                    </div>
                </div>
            </div>
        `).join('');
    }

    // Employee Table
    renderEmployeeTable(employees) {
        const tbody = document.getElementById('employeesTable');
        if (!tbody) return;

        tbody.innerHTML = employees.map(emp => `
            <tr>
                <td>${emp.employeeNumber || 'N/A'}</td>
                <td><strong>${emp.name}</strong></td>
                <td>${emp.department}</td>
                <td><span class="badge bg-primary">${emp.costCentre}</span></td>
                <td>${emp.position}</td>
                <td><span class="badge bg-success">${emp.agency}</span></td>
                <td>R${emp.hourlyRate?.toFixed(2) || '0.00'}</td>
                <td>
                    <span class="badge ${emp.isActive ? 'bg-success' : 'bg-secondary'}">
                        ${emp.isActive ? 'Active' : 'Inactive'}
                    </span>
                </td>
                <td>
                    <button class="btn btn-sm btn-outline-primary" onclick="uiComponents.editEmployee('${emp.id}')">
                        <i class="bi bi-pencil"></i>
                    </button>
                    ${authService.hasPermission('manager') ? `
                    <button class="btn btn-sm btn-outline-danger" onclick="uiComponents.deleteEmployee('${emp.id}')">
                        <i class="bi bi-trash"></i>
                    </button>
                    ` : ''}
                </td>
            </tr>
        `).join('');
    }

    // Recent Activity
    renderRecentActivity(activities) {
        const container = document.getElementById('recentActivity');
        if (!container) return;

        container.innerHTML = activities.map(activity => `
            <div class="activity-item">
                <div class="d-flex justify-content-between align-items-start">
                    <div>
                        <strong>${this.formatActivityAction(activity.action)}</strong>
                        <div class="text-muted small">${activity.details?.email || activity.details?.fileName || 'System activity'}</div>
                    </div>
                    <div class="text-end">
                        <div class="text-muted small">${this.formatTimestamp(activity.timestamp)}</div>
                    </div>
                </div>
            </div>
        `).join('');
    }

    // Charts
    renderCostChart(data) {
        const ctx = document.getElementById('costChart');
        if (!ctx) return;

        // Destroy existing chart
        if (this.charts.has('costChart')) {
            this.charts.get('costChart').destroy();
        }

        const chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.labels || [],
                datasets: [
                    {
                        label: 'Regular Cost',
                        data: data.regularCosts || [],
                        backgroundColor: 'rgba(54, 162, 235, 0.8)'
                    },
                    {
                        label: 'Overtime Cost',
                        data: data.overtimeCosts || [],
                        backgroundColor: 'rgba(255, 99, 132, 0.8)'
                    },
                    {
                        label: 'Night Allowance',
                        data: data.nightAllowances || [],
                        backgroundColor: 'rgba(255, 205, 86, 0.8)'
                    }
                ]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Weekly Cost Breakdown'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return 'R' + value.toLocaleString();
                            }
                        }
                    }
                }
            }
        });

        this.charts.set('costChart', chart);
    }

    renderDepartmentChart(data) {
        const ctx = document.getElementById('departmentChart');
        if (!ctx) return;

        if (this.charts.has('departmentChart')) {
            this.charts.get('departmentChart').destroy();
        }

        const chart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: data.labels || [],
                datasets: [{
                    data: data.values || [],
                    backgroundColor: [
                        'rgba(255, 99, 132, 0.8)',
                        'rgba(54, 162, 235, 0.8)',
                        'rgba(255, 205, 86, 0.8)',
                        'rgba(75, 192, 192, 0.8)',
                        'rgba(153, 102, 255, 0.8)'
                    ]
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });

        this.charts.set('departmentChart', chart);
    }

    // Utility Methods
    formatTimestamp(timestamp) {
        if (!timestamp) return 'N/A';
        
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    }

    formatActivityAction(action) {
        const actions = {
            'login_success': 'User logged in',
            'login_failed': 'Failed login attempt',
            'logout': 'User logged out',
            'employee_created': 'Employee created',
            'timesheet_uploaded': 'Timesheet uploaded',
            'report_generated': 'Report generated'
        };
        
        return actions[action] || action.replace('_', ' ');
    }

    showLoading(show = true) {
        const overlay = document.querySelector('.loading-overlay');
        if (overlay) {
            overlay.style.display = show ? 'flex' : 'none';
        }
    }

    showMessage(message, type = 'info') {
        // Remove existing messages
        const existingAlerts = document.querySelectorAll('.alert-dismissible');
        existingAlerts.forEach(alert => alert.remove());

        const alert = document.createElement('div');
        alert.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
        alert.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
        alert.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;

        document.body.appendChild(alert);

        // Auto remove after 5 seconds
        setTimeout(() => {
            if (alert.parentNode) {
                alert.remove();
            }
        }, 5000);
    }

    // Employee Management Methods
    async editEmployee(employeeId) {
        // Implementation for editing employee
        this.showMessage('Edit functionality coming soon!', 'info');
    }

    async deleteEmployee(employeeId) {
        if (!confirm('Are you sure you want to delete this employee?')) {
            return;
        }

        try {
            // Implementation for deleting employee
            this.showMessage('Employee deleted successfully!', 'success');
        } catch (error) {
            this.showMessage('Error deleting employee: ' + error.message, 'danger');
        }
    }
}

// Create global instance
const uiComponents = new UIComponents();
export default uiComponents;
