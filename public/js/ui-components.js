// Add these methods to the UIComponents class

// Employee Import Section
renderEmployeeImportSection() {
    return `
        <div class="card">
            <div class="card-body">
                <h5 class="card-title">Import Employee Data</h5>
                <div class="mb-3">
                    <label for="employeeFile" class="form-label">Select employee data file (Excel/CSV)</label>
                    <input class="form-control" type="file" id="employeeFile" accept=".csv,.xlsx,.xls">
                </div>
                <div class="mb-3">
                    <label for="employeeCostCenter" class="form-label">Cost Center</label>
                    <select class="form-select" id="employeeCostCenter">
                        <option value="3040034">3040034 - General Operations</option>
                        <option value="3040038">3040038 - Beauty</option>
                        <option value="3040040">3040040 - Ecom/Bash</option>
                    </select>
                </div>
                <button class="btn btn-primary" id="importEmployeesBtn">
                    <i class="bi bi-upload"></i> Import Employee Data
                </button>
                <div id="employeeImportProgress" class="mt-3 d-none">
                    <div class="progress">
                        <div class="progress-bar progress-bar-striped progress-bar-animated" 
                             role="progressbar" style="width: 0%"></div>
                    </div>
                    <small class="text-muted" id="employeeImportStatus">Processing...</small>
                </div>
            </div>
        </div>
    `;
}

// Recent employee imports
renderRecentEmployeeImports(imports) {
    return imports.map(importItem => `
        <div class="activity-item">
            <div class="d-flex justify-content-between align-items-start">
                <div>
                    <strong>${importItem.fileName}</strong>
                    <div class="text-muted small">
                        Status: <span class="badge ${this.getImportStatusBadge(importItem.status)}">
                            ${importItem.statusText}
                        </span>
                    </div>
                    ${importItem.processedEmployees ? 
                        `<div class="text-muted small">Processed: ${importItem.processedEmployees} employees</div>` : ''}
                </div>
                <div class="text-end">
                    <div class="text-muted small">${this.formatTimestamp(importItem.uploadedAt)}</div>
                </div>
            </div>
        </div>
    `).join('');
}

getImportStatusBadge(status) {
    const statusMap = {
        'processing': 'bg-warning',
        'completed': 'bg-success',
        'failed': 'bg-danger',
        'validating': 'bg-info'
    };
    return statusMap[status] || 'bg-secondary';
}
