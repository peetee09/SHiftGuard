class UIComponents {
    static showLoading(show) {
        const loadingOverlay = document.querySelector('.loading-overlay');
        if (loadingOverlay) {
            loadingOverlay.style.display = show ? 'flex' : 'none';
        }
    }

    static showMessage(message, type = 'info') {
        // Create or update a message toast/alert
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
        alertDiv.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        
        // Add to top of page
        const container = document.querySelector('.container-fluid') || document.body;
        container.insertBefore(alertDiv, container.firstChild);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            if (alertDiv.parentNode) {
                alertDiv.remove();
            }
        }, 5000);
    }

    static renderEmployeeTable(employees) {
        const tableBody = document.getElementById('employeesTable');
        if (!tableBody) return;

        if (!employees || employees.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="9" class="text-center">No employees found</td></tr>';
            return;
        }

        tableBody.innerHTML = employees.map(emp => `
            <tr>
                <td>${emp.employeeNumber || 'N/A'}</td>
                <td>${emp.name || 'Unknown'}</td>
                <td>${emp.department || 'N/A'}</td>
                <td>${emp.costCentre || 'N/A'}</td>
                <td>${emp.position || 'N/A'}</td>
                <td>${emp.agency || 'N/A'}</td>
                <td>R ${(emp.hourlyRate || 0).toFixed(2)}</td>
                <td>
                    <span class="badge bg-success">Active</span>
                </td>
                <td>
                    <button class="btn btn-sm btn-outline-primary">
                        <i class="bi bi-eye"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    }

    static renderKPICards(kpiData) {
        const container = document.getElementById('kpiContainer');
        if (!container) return;

        container.innerHTML = `
            <div class="col-md-3 col-sm-6 mb-3">
                <div class="card kpi-card">
                    <div class="card-body">
                        <div class="kpi-value">${kpiData.totalEmployees}</div>
                        <div class="kpi-label">Total Employees</div>
                    </div>
                </div>
            </div>
            <div class="col-md-3 col-sm-6 mb-3">
                <div class="card kpi-card">
                    <div class="card-body">
                        <div class="kpi-value">${kpiData.totalHours}h</div>
                        <div class="kpi-label">Total Hours</div>
                    </div>
                </div>
            </div>
            <div class="col-md-3 col-sm-6 mb-3">
                <div class="card kpi-card">
                    <div class="card-body">
                        <div class="kpi-value">${kpiData.overtimeHours}h</div>
                        <div class="kpi-label">Overtime</div>
                    </div>
                </div>
            </div>
            <div class="col-md-3 col-sm-6 mb-3">
                <div class="card kpi-card">
                    <div class="card-body">
                        <div class="kpi-value">R ${kpiData.totalCost.toFixed(2)}</div>
                        <div class="kpi-label">Total Cost</div>
                    </div>
                </div>
            </div>
        `;
    }

    static renderRecentActivity(activities) {
        const container = document.getElementById('recentActivity');
        if (!container) return;

        if (!activities || activities.length === 0) {
            container.innerHTML = '<div class="text-center text-muted">No recent activity</div>';
            return;
        }

        container.innerHTML = activities.map(activity => `
            <div class="activity-item">
                <div class="d-flex justify-content-between">
                    <div>
                        <strong>${this.formatActivityAction(activity.action)}</strong>
                        <div class="text-muted small">${activity.details?.fileName || ''}</div>
                    </div>
                    <div class="text-muted small">
                        ${this.formatTimestamp(activity.timestamp)}
                    </div>
                </div>
            </div>
        `).join('');
    }

    static formatActivityAction(action) {
        const actionMap = {
            'login_success': 'User logged in',
            'timesheet_uploaded': 'Timesheet uploaded',
            'employee_imported': 'Employees imported'
        };
        return actionMap[action] || action;
    }

    static formatTimestamp(timestamp) {
        if (!timestamp) return 'Just now';
        
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleTimeString();
    }

    // Chart rendering methods
    static renderCostChart(data) {
        const canvas = document.getElementById('costChart');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.labels,
                datasets: [
                    {
                        label: 'Regular Cost',
                        data: data.regularCosts,
                        backgroundColor: '#3498db'
                    },
                    {
                        label: 'Overtime Cost',
                        data: data.overtimeCosts,
                        backgroundColor: '#e74c3c'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        });
    }

    static renderDepartmentChart(data) {
        const canvas = document.getElementById('departmentChart');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        new Chart(ctx, {
            type: 'pie',
            data: {
                labels: data.labels,
                datasets: [{
                    data: data.values,
                    backgroundColor: ['#3498db', '#2ecc71', '#e74c3c', '#f39c12', '#9b59b6']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        });
    }
}

export default UIComponents;
