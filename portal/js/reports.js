/**
 * ATM/ITM Operations Portal — Reports Logic
 */

let reportData = null;

document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.requireAuth(['atm_manager'])) return;
  Common.bindLogout();
  Common.injectNavUser();
  await loadReport();
});

async function loadReport() {
  const range = document.getElementById('report-range').value;
  const res = await API.getReports(range);
  if (!res.success) { Common.toast('Failed to load report.', 'error'); return; }
  reportData = res.data;
  _renderReportKPIs(reportData.kpis);
  _renderCoverageChart(reportData.coverage_by_day);
  _renderCategoryChart(reportData.incident_by_category);
  _renderBranchSummary(reportData.branch_summary);
  _renderNotTestedTable(reportData.not_tested);
  _renderVendorCharts(reportData.vendor_performance);
  _renderVendorDetailTable(reportData.vendor_performance);
  _renderSecurityTable(reportData.security_incidents);
  _renderAgingTable(reportData.aging_incidents);
  _renderResolvedTable(reportData.resolved_incidents);
}

function _renderReportKPIs(kpis) {
  if (!kpis) return;
  document.getElementById('report-kpis').innerHTML = [
    Common.kpiCard('Total Incidents',     kpis.total_incidents,    null,                 'kpi-blue',  '📊'),
    Common.kpiCard('Resolved',            kpis.resolved,           `${kpis.resolution_rate}% rate`, 'kpi-green', '✓'),
    Common.kpiCard('Avg Resolution',      Common.fmtDuration(kpis.avg_resolution_min), null, 'kpi-amber', '⏱'),
    Common.kpiCard('Critical Issues',     kpis.critical_count,     null,                 'kpi-red',   '🔴'),
    Common.kpiCard('Security Issues',     kpis.security_count,     'Requires attention', 'kpi-red',   '🔒'),
    Common.kpiCard('Machines Tested',     kpis.machines_tested,    `of ${kpis.total_machines}`, 'kpi-green', '🏧'),
    Common.kpiCard('Repeated Issues',     kpis.repeated_machines,  'Machines 3+ incidents', 'kpi-amber', '🔄'),
    Common.kpiCard('Overdue Incidents',   kpis.overdue,            'SLA breached',       'kpi-red',   '⚠️'),
  ].join('');
}

function _renderCoverageChart(data) {
  if (!data) return;
  const ctx = document.getElementById('coverage-chart');
  if (!ctx) return;
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(d => d.date),
      datasets: [
        { label: 'Tested', data: data.map(d => d.tested), borderColor: '#16a34a', backgroundColor: '#f0fdf4', fill: true, tension: 0.3 },
        { label: 'Not Tested', data: data.map(d => d.not_tested), borderColor: '#9ca3af', backgroundColor: '#f9fafb', fill: true, tension: 0.3 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } },
      scales: { x: { grid: { display: false } }, y: { beginAtZero: true } }
    }
  });
}

function _renderCategoryChart(data) {
  if (!data) return;
  const ctx = document.getElementById('category-chart');
  if (!ctx) return;
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(d => d.category),
      datasets: [{ data: data.map(d => d.count), backgroundColor: ['#dc2626','#d97706','#2563eb','#16a34a','#7c3aed'] }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true } }
    }
  });
}

function _renderBranchSummary(data) {
  const cols = [
    { key: 'branch_name',       label: 'Branch' },
    { key: 'total_tests',       label: 'Total Tests' },
    { key: 'passed',            label: 'Passed', render: (v) => `<span style="color:var(--status-green); font-weight:600">${v}</span>` },
    { key: 'failed',            label: 'Failed', render: (v) => `<span style="color:var(--status-red); font-weight:600">${v}</span>` },
    { key: 'critical_incidents',label: 'Critical Incidents' },
    { key: 'open_incidents',    label: 'Open Incidents' },
    { key: 'avg_resolution_min',label: 'Avg Resolution', render: (v) => Common.fmtDuration(v) },
  ];
  document.getElementById('branch-summary-table').innerHTML = Common.buildTable(cols, data || []);
}

function _renderNotTestedTable(data) {
  const cols = [
    { key: 'date',         label: 'Date' },
    { key: 'machine_name', label: 'Machine' },
    { key: 'terminal_id',  label: 'Terminal ID', className: 'mono' },
    { key: 'branch_name',  label: 'Branch' },
    { key: 'machine_type', label: 'Type' },
  ];
  document.getElementById('not-tested-table').innerHTML = Common.buildTable(cols, data || []);
}

function _renderVendorCharts(vendors) {
  if (!vendors) return;
  // Resolution Rate Bar Chart
  const ctx1 = document.getElementById('vendor-chart');
  if (ctx1) {
    new Chart(ctx1, {
      type: 'bar',
      data: {
        labels: vendors.map(v => v.vendor_name),
        datasets: [{
          label: 'Resolution Rate %',
          data: vendors.map(v => Math.round((v.resolution_rate || 0) * 100)),
          backgroundColor: vendors.map(v => {
            const r = Math.round((v.resolution_rate || 0) * 100);
            return r >= 80 ? '#16a34a' : r >= 50 ? '#d97706' : '#dc2626';
          }),
          borderRadius: 4,
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, max: 100 } } }
    });
  }

  const ctx2 = document.getElementById('resolution-time-chart');
  if (ctx2) {
    new Chart(ctx2, {
      type: 'bar',
      data: {
        labels: vendors.map(v => v.vendor_name),
        datasets: [{
          label: 'Avg Resolution (hrs)',
          data: vendors.map(v => ((v.avg_resolution_min || 0) / 60).toFixed(1)),
          backgroundColor: '#1D6FBB',
          borderRadius: 4,
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
  }
}

function _renderVendorDetailTable(vendors) {
  const cols = [
    { key: 'vendor_name',        label: 'Vendor' },
    { key: 'total_assigned',     label: 'Total Assigned' },
    { key: 'resolved',           label: 'Resolved' },
    { key: 'open',               label: 'Open' },
    { key: 'overdue',            label: 'Overdue', render: (v) => v > 0 ? `<span style="color:var(--status-red); font-weight:700">${v}</span>` : '0' },
    { key: 'avg_resolution_min', label: 'Avg Resolution', render: (v) => Common.fmtDuration(v) },
    { key: 'avg_response_min',   label: 'Avg Response',   render: (v) => Common.fmtDuration(v) },
    { key: 'resolution_rate',    label: 'Rate',
      render: (v) => {
        const pct = Math.round((v||0)*100);
        return `<span style="font-weight:700; color:${pct>=80?'var(--status-green)':pct>=50?'var(--status-amber)':'var(--status-red)'}">${pct}%</span>`;
      }
    },
  ];
  document.getElementById('vendor-detail-table').innerHTML = Common.buildTable(cols, vendors || []);
}

function _renderSecurityTable(data) {
  const cols = [
    { key: 'incident_id',   label: 'Incident ID', className: 'mono' },
    { key: 'machine_name',  label: 'Machine' },
    { key: 'branch_name',   label: 'Branch' },
    { key: 'issue_type',    label: 'Security Item' },
    { key: 'status',        label: 'Status', render: (v) => Common.incidentBadge(v) },
    { key: 'vendor_name',   label: 'Vendor' },
    { key: 'created_at',    label: 'Reported', render: (v) => Common.fmtDateTime(v) },
    { key: 'resolved_at',   label: 'Resolved', render: (v) => Common.fmtDateTime(v) },
  ];
  document.getElementById('security-table').innerHTML = Common.buildTable(cols, data || []);
}

function _renderAgingTable(data) {
  const cols = [
    { key: 'incident_id',   label: 'Incident ID', className: 'mono' },
    { key: 'machine_name',  label: 'Machine' },
    { key: 'branch_name',   label: 'Branch' },
    { key: 'severity',      label: 'Severity', render: (v) => Common.severityBadge(v) },
    { key: 'status',        label: 'Status', render: (v) => Common.incidentBadge(v) },
    { key: 'vendor_name',   label: 'Vendor' },
    { key: 'aging_minutes', label: 'Age',
      render: (v) => `<span style="font-weight:700; font-family:var(--font-mono); color:${v>480?'var(--status-red)':v>120?'var(--status-amber)':'inherit'}">${Common.fmtDuration(v)}</span>` },
    { key: 'created_at',    label: 'Created', render: (v) => Common.fmtDateTime(v) },
  ];
  const sorted = (data || []).sort((a,b) => (b.aging_minutes||0) - (a.aging_minutes||0));
  document.getElementById('aging-table').innerHTML = Common.buildTable(cols, sorted, {
    rowClass: (row) => row.aging_minutes > 480 ? 'aging-critical' : row.aging_minutes > 120 ? 'aging-warning' : ''
  });
}

function _renderResolvedTable(data) {
  const cols = [
    { key: 'incident_id',         label: 'Incident ID', className: 'mono' },
    { key: 'machine_name',        label: 'Machine' },
    { key: 'branch_name',         label: 'Branch' },
    { key: 'vendor_name',         label: 'Vendor' },
    { key: 'severity',            label: 'Severity', render: (v) => Common.severityBadge(v) },
    { key: 'created_at',          label: 'Created', render: (v) => Common.fmtDateTime(v) },
    { key: 'resolved_at',         label: 'Resolved', render: (v) => Common.fmtDateTime(v) },
    { key: 'resolution_time_min', label: 'Resolution Time',
      render: (v) => Common.fmtDuration(v) },
    { key: 'reopen_count',        label: 'Reopens',
      render: (v) => v > 0 ? `<span class="repeat-badge">${v}</span>` : '0' },
  ];
  document.getElementById('resolved-table').innerHTML = Common.buildTable(cols, data || []);
}

function switchReportTab(btn, targetId) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  const panel = document.getElementById(targetId);
  if (panel) panel.classList.add('active');
}

function exportReport() {
  if (!reportData) return;
  const range = document.getElementById('report-range').value;
  const summary = reportData.branch_summary || [];
  const rows = summary.map(r => [r.branch_name, r.total_tests, r.passed, r.failed, r.critical_incidents, r.open_incidents]);
  const header = ['Branch','Total Tests','Passed','Failed','Critical','Open Incidents'];
  const csv = [header, ...rows].map(r => r.map(v => `"${v??''}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `atm-report-${range}-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}
