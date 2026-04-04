/**
 * ATM/ITM Operations Portal — Reports Logic
 */

let reportData = null;

document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.requireAuth(['manager', 'atm_manager'])) return;
  Common.bindLogout();
  Common.injectNavUser();
  await loadReport();
});

async function loadReport() {
  const range = document.getElementById('report-range').value;
  let d = null;
  let isLive = false;

  try {
    const res = await API.getReports(range);
    const raw = res?.data || res || {};
    if (raw && raw.kpis) { d = raw; isLive = true; }
  } catch(e) {}

  // Fallback: build from dashboard data
  if (!d) {
    d = await _buildReportFromDashboard(range);
    Common.toast('Using cached dashboard data — connect n8n /reports endpoint for full report.', 'warning');
  }

  if (!d) { Common.toast('No data available.', 'error'); return; }
  reportData = d;

  _renderReportKPIs(d.kpis || {});
  _renderCoverageChart(d.coverage_by_day || []);
  _renderCategoryChart(d.incident_by_category || []);
  _renderBranchSummary(d.branch_summary || []);
  _renderNotTestedTable(d.not_tested || []);
  _renderVendorCharts(d.vendor_performance || []);
  _renderVendorDetailTable(d.vendor_performance || []);
  _renderSecurityTable(d.security_incidents || []);
  _renderAgingTable(d.aging_incidents || []);
  _renderResolvedTable(d.resolved_incidents || []);
}

async function _buildReportFromDashboard(range) {
  try {
    const res = await API.getManagerDashboard({});
    const raw = res?.data || res || {};
    if (!raw.machines) return null;

    const machines  = raw.machines  || [];
    const incidents = raw.open_incidents || [];
    const branches  = raw.branches  || [];
    const now = new Date();

    // Days in range
    const days = range === 'weekly' ? 7 : range === 'monthly' ? 30 : 90;

    // Coverage by day (last 7 days)
    const coverage_by_day = [];
    for (let i = days > 7 ? 6 : days-1; i >= 0; i--) {
      const dt = new Date(now); dt.setDate(dt.getDate()-i);
      coverage_by_day.push({
        date: dt.toISOString().slice(0,10),
        tested: machines.filter(m => m.tested_today === 'TRUE').length,
        not_tested: machines.filter(m => m.tested_today !== 'TRUE').length,
      });
    }

    // Incident by category
    const catCounts = {};
    incidents.forEach(i => {
      const cat = i.issue_category || 'General';
      catCounts[cat] = (catCounts[cat]||0) + 1;
    });
    const incident_by_category = Object.entries(catCounts).map(([category,count]) => ({category,count}));

    // Branch summary
    const branch_summary = (branches.length ? branches : [{branch_id:'all',branch_name:'All Branches'}]).map(b => {
      const bm = machines.filter(m => m.branch_id === b.branch_id);
      const bi = incidents.filter(i => i.branch_id === b.branch_id);
      return {
        branch_name:        b.branch_name,
        total_tests:        bm.filter(m=>m.tested_today==='TRUE').length,
        passed:             bm.filter(m=>m.current_status==='GREEN').length,
        failed:             bm.filter(m=>m.current_status==='RED'||m.current_status==='AMBER').length,
        critical_incidents: bi.filter(i=>i.severity==='RED').length,
        open_incidents:     bi.length,
        avg_resolution_min: 240,
      };
    });

    // KPIs
    const green  = machines.filter(m=>m.current_status==='GREEN').length;
    const red    = machines.filter(m=>m.current_status==='RED').length;
    const amber  = machines.filter(m=>m.current_status==='AMBER').length;
    const tested = machines.filter(m=>m.tested_today==='TRUE').length;

    return {
      kpis: {
        total_incidents:  incidents.length,
        resolved:         0,
        resolution_rate:  0,
        avg_resolution_min: 240,
        critical_count:   red,
        security_count:   incidents.filter(i=>(i.issue_category||'').toLowerCase().includes('security')).length,
        machines_tested:  tested,
        total_machines:   machines.length,
        repeated_machines:0,
        overdue:          incidents.filter(i=>i.is_overdue).length,
      },
      coverage_by_day,
      incident_by_category: incident_by_category.length ? incident_by_category : [{category:'No Incidents',count:0}],
      branch_summary,
      not_tested: machines.filter(m=>m.tested_today!=='TRUE').map(m=>({
        date: now.toISOString().slice(0,10),
        machine_name: m.machine_id,
        terminal_id:  m.terminal_id,
        branch_name:  m.branch_name,
        machine_type: m.machine_type,
      })),
      vendor_performance: [],
      security_incidents: incidents.filter(i=>(i.issue_category||'').toLowerCase().includes('security')),
      aging_incidents:    incidents.map(i=>({...i, machine_name:i.machine_id, vendor_name:i.assigned_vendor_name})),
      resolved_incidents: [],
    };
  } catch(e) {
    console.error('Report fallback failed:', e);
    return null;
  }
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
