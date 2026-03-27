/**
 * ATM/ITM Operations Portal — Manager Dashboard Logic
 */

let dashboardData = null;
let statusChart = null;
let trendChart = null;
let activeFilters = {};

document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.requireAuth(['atm_manager'])) return;
  Common.bindLogout();
  Common.injectNavUser();
  _startLiveClock();
  await loadDashboard();
  // Auto-refresh every 5 minutes
  setInterval(loadDashboard, 5 * 60 * 1000);
});

function _startLiveClock() {
  function tick() {
    const now = new Date();
    const timeEl = document.getElementById('live-time');
    const dateEl = document.getElementById('live-date');
    if (timeEl) timeEl.textContent = now.toLocaleTimeString('en-GB');
    if (dateEl) dateEl.textContent = now.toLocaleDateString('en-GB', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
  }
  tick();
  setInterval(tick, 1000);
}

async function loadDashboard() {
  const res = await API.getManagerDashboard(activeFilters);
  if (!res.success) {
    Common.toast('Failed to load dashboard data.', 'error');
    return;
  }
  dashboardData = res.data;
  document.getElementById('last-refresh-label').textContent = 'Last refreshed: ' + new Date().toLocaleTimeString('en-GB');

  _renderKPIs(dashboardData.kpis);
  _renderStatusChart(dashboardData.status_summary);
  _renderTrendChart(dashboardData.trend_7days);
  _renderOverdue(dashboardData.overdue_incidents);
  _renderNotTested(dashboardData.not_tested_today);
  _renderMachineGrid(dashboardData.machines);
  _renderIncidentTable(dashboardData.active_incidents);
  _renderRepeatedIssues(dashboardData.repeated_machines);
  _renderVendorPerformance(dashboardData.vendor_performance);
  _populateFilterDropdowns(dashboardData.branches, dashboardData.vendors);
}

function _renderKPIs(kpis) {
  if (!kpis) return;
  const grid = document.getElementById('kpi-grid');
  grid.innerHTML = [
    Common.kpiCard('Total Machines',    kpis.total_machines,  null,        'kpi-blue',  '🏧'),
    Common.kpiCard('Critical Issues',   kpis.red_count,       'Immediate action needed', 'kpi-red',   '🔴'),
    Common.kpiCard('Open Issues',       kpis.amber_count,     'Require attention', 'kpi-amber', '🟡'),
    Common.kpiCard('Healthy',           kpis.green_count,     'Fully operational', 'kpi-green', '🟢'),
    Common.kpiCard('Not Tested Today',  kpis.grey_count,      'Awaiting check',   'kpi-grey',  '⚫'),
    Common.kpiCard('Open Incidents',    kpis.open_incidents,  `Avg age: ${Common.fmtDuration(kpis.avg_aging_min)}`, 'kpi-red', '⚠️'),
    Common.kpiCard('Resolved Today',    kpis.resolved_today,  null,        'kpi-green', '✓'),
    Common.kpiCard('Overdue',           kpis.overdue_count,   'SLA breached', 'kpi-red',  '⏱'),
  ].join('');
}

function _renderStatusChart(summary) {
  const ctx = document.getElementById('status-chart');
  if (!ctx || !summary) return;

  if (statusChart) statusChart.destroy();

  statusChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Critical (Red)', 'Issue (Amber)', 'Healthy (Green)', 'Not Tested (Grey)'],
      datasets: [{
        data: [summary.red || 0, summary.amber || 0, summary.green || 0, summary.grey || 0],
        backgroundColor: ['#dc2626', '#d97706', '#16a34a', '#9ca3af'],
        borderWidth: 2,
        borderColor: '#fff',
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => ` ${c.label}: ${c.raw}` } }
      }
    }
  });

  document.getElementById('status-summary').innerHTML = [
    `<div class="status-summary-item"><div class="status-summary-count" style="color:#dc2626">${summary.red||0}</div><div class="status-summary-label">Critical</div></div>`,
    `<div class="status-summary-item"><div class="status-summary-count" style="color:#d97706">${summary.amber||0}</div><div class="status-summary-label">Issue</div></div>`,
    `<div class="status-summary-item"><div class="status-summary-count" style="color:#16a34a">${summary.green||0}</div><div class="status-summary-label">Healthy</div></div>`,
    `<div class="status-summary-item"><div class="status-summary-count" style="color:#9ca3af">${summary.grey||0}</div><div class="status-summary-label">Not Tested</div></div>`,
  ].join('');
}

function _renderTrendChart(trend) {
  const ctx = document.getElementById('trend-chart');
  if (!ctx || !trend) return;

  if (trendChart) trendChart.destroy();

  trendChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: trend.map(d => d.date),
      datasets: [
        {
          label: 'New Incidents',
          data: trend.map(d => d.new_incidents),
          backgroundColor: '#dc2626cc',
          borderRadius: 3,
          borderSkipped: false,
        },
        {
          label: 'Resolved',
          data: trend.map(d => d.resolved),
          backgroundColor: '#16a34acc',
          borderRadius: 3,
          borderSkipped: false,
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 } } },
        y: { beginAtZero: true, ticks: { font: { size: 11 }, stepSize: 1 } }
      }
    }
  });
}

function _renderOverdue(items) {
  const section = document.getElementById('overdue-section');
  const list = document.getElementById('overdue-list');
  const countEl = document.getElementById('overdue-count');

  if (!items || items.length === 0) {
    section.classList.add('hidden');
    return;
  }

  section.classList.remove('hidden');
  countEl.textContent = items.length;

  list.innerHTML = items.map(item => `
    <div class="overdue-item">
      <div class="overdue-item-left">
        <div class="overdue-item-name">
          <span class="text-mono">${item.incident_id}</span> —
          ${item.machine_name} <span class="text-muted text-sm">(${item.branch_name})</span>
        </div>
        <div class="overdue-item-meta">
          ${Common.incidentBadge(item.status)} &nbsp;
          Vendor: <strong>${item.vendor_name || 'Unassigned'}</strong> &nbsp;|&nbsp;
          ${Common.severityBadge(item.severity)}
        </div>
      </div>
      <div>
        <div class="overdue-item-aging">${Common.fmtDuration(item.aging_minutes)}</div>
        <div class="text-sm text-muted" style="text-align:right">open</div>
      </div>
      <button class="btn btn-secondary btn-sm" onclick="openIncidentModal('${item.incident_id}')">View</button>
    </div>
  `).join('');
}

function _renderNotTested(machines) {
  const section = document.getElementById('not-tested-section');
  const list = document.getElementById('not-tested-list');
  const countEl = document.getElementById('not-tested-count');

  if (!machines || machines.length === 0) {
    section.classList.add('hidden');
    return;
  }

  section.classList.remove('hidden');
  countEl.textContent = machines.length;

  list.innerHTML = machines.map(m =>
    `<div class="not-tested-chip" onclick="window.location.href='machine-detail.html?id=${m.machine_id}'" style="cursor:pointer">
      <span>${m.machine_name}</span>
      <span class="text-muted text-sm" style="margin-left:4px">${m.branch_name}</span>
    </div>`
  ).join('');
}

function _renderMachineGrid(machines) {
  const grid = document.getElementById('machine-grid');
  if (!machines || machines.length === 0) {
    grid.innerHTML = '<div class="empty-state"><p>No machines found.</p></div>';
    return;
  }

  const filtered = _applyLocalFilters(machines);
  document.getElementById('machine-count-display').textContent = `${filtered.length} of ${machines.length} machines`;

  grid.innerHTML = filtered.map(m => {
    const status = m.current_status || 'GREY';
    const tileClass = 'tile-' + status.toLowerCase();
    const agingText = m.incident_aging_min ? Common.fmtDuration(m.incident_aging_min) : '';

    return `
      <div class="machine-tile ${tileClass}" onclick="window.location.href='machine-detail.html?id=${m.machine_id}'">
        <div class="tile-id">${m.terminal_id}</div>
        <div class="tile-name">${m.machine_name}</div>
        <div class="tile-branch">${m.branch_name}</div>
        <div class="tile-status">${Common.statusBadge(status)}</div>
        <div class="tile-meta">
          <span>${m.machine_type || 'ATM'}</span>
          ${agingText ? `<span class="text-mono" style="color:var(--status-red)">${agingText}</span>` : ''}
        </div>
      </div>`;
  }).join('');
}

function _applyLocalFilters(machines) {
  return machines.filter(m => {
    if (activeFilters.branch && m.branch_id !== activeFilters.branch) return false;
    if (activeFilters.status && m.current_status !== activeFilters.status) return false;
    if (activeFilters.type && m.machine_type !== activeFilters.type) return false;
    return true;
  });
}

function _renderIncidentTable(incidents) {
  const container = document.getElementById('incidents-table');

  const cols = [
    { key: 'incident_id',    label: 'Incident ID',   className: 'mono col-tight',
      render: (v) => `<a href="#" onclick="openIncidentModal('${v}'); return false" style="color:var(--brand-accent); font-weight:600">${v}</a>` },
    { key: 'machine_name',   label: 'Machine' },
    { key: 'branch_name',    label: 'Branch' },
    { key: 'severity',       label: 'Severity',       render: (v) => Common.severityBadge(v) },
    { key: 'status',         label: 'Status',         render: (v) => Common.incidentBadge(v) },
    { key: 'vendor_name',    label: 'Assigned Vendor' },
    { key: 'aging_minutes',  label: 'Age',            className: 'mono',
      render: (v, row) => `<span class="${v > 480 ? 'text-sm' : ''}" style="color:${v>480?'var(--status-red)':v>120?'var(--status-amber)':'inherit'}">${Common.fmtDuration(v)}</span>` },
    { key: 'created_at',     label: 'Created',        render: (v) => Common.fmtDateTime(v) },
    { key: 'incident_id',    label: '',
      render: (v) => `<button class="btn btn-secondary btn-sm" onclick="openIncidentModal('${v}')">View</button>` },
  ];

  container.innerHTML = Common.buildTable(cols, incidents || [], {
    onRowClick: true,
    idKey: 'incident_id',
    rowClass: (row) => row.aging_minutes > 480 ? 'aging-critical' : row.aging_minutes > 120 ? 'aging-warning' : ''
  });
}

function _renderRepeatedIssues(machines) {
  const container = document.getElementById('repeated-table');
  const cols = [
    { key: 'machine_name',       label: 'Machine' },
    { key: 'branch_name',        label: 'Branch' },
    { key: 'terminal_id',        label: 'Terminal ID', className: 'mono' },
    { key: 'incident_count',     label: 'Incidents (30d)',
      render: (v) => `<span class="repeat-badge">🔄 ${v}</span>` },
    { key: 'last_issue_type',    label: 'Last Issue Type' },
    { key: 'current_status',     label: 'Status', render: (v) => Common.statusBadge(v) },
  ];
  container.innerHTML = Common.buildTable(cols, machines || []);
}

function _renderVendorPerformance(vendors) {
  const container = document.getElementById('vendor-perf-table');
  const cols = [
    { key: 'vendor_name',           label: 'Vendor' },
    { key: 'open_incidents',        label: 'Open' },
    { key: 'resolved_today',        label: 'Resolved Today' },
    { key: 'avg_resolution_min',    label: 'Avg Resolution',
      render: (v) => Common.fmtDuration(v) },
    { key: 'overdue_count',         label: 'Overdue',
      render: (v) => v > 0 ? `<span style="color:var(--status-red); font-weight:600">${v}</span>` : '0' },
    { key: 'resolution_rate',       label: 'Resolution Rate',
      render: (v) => {
        const pct = Math.round((v||0) * 100);
        const color = pct >= 80 ? 'var(--status-green)' : pct >= 50 ? 'var(--status-amber)' : 'var(--status-red)';
        return `<div style="display:flex; align-items:center; gap:8px">
          <div class="perf-bar-wrap" style="flex:1">
            <div class="perf-bar ${pct<50?'red':pct<80?'amber':''}" style="width:${pct}%"></div>
          </div>
          <span class="text-mono" style="color:${color}; font-size:11px">${pct}%</span>
        </div>`;
      }
    },
  ];
  container.innerHTML = Common.buildTable(cols, vendors || []);
}

function _populateFilterDropdowns(branches, vendors) {
  if (branches) {
    Common.setSelectOptions('filter-branch', branches.map(b => ({ value: b.branch_id, label: b.branch_name })), 'All Branches');
  }
  if (vendors) {
    Common.setSelectOptions('filter-vendor', vendors.map(v => ({ value: v.vendor_id, label: v.vendor_name })), 'All Vendors');
  }
}

function applyFilters() {
  activeFilters = {
    branch: document.getElementById('filter-branch').value,
    status: document.getElementById('filter-status').value,
    type:   document.getElementById('filter-type').value,
    vendor: document.getElementById('filter-vendor').value,
  };
  if (dashboardData) {
    _renderMachineGrid(dashboardData.machines);
    _renderIncidentTable(dashboardData.active_incidents.filter(i => {
      if (activeFilters.vendor && i.vendor_id !== activeFilters.vendor) return false;
      if (activeFilters.branch && i.branch_id !== activeFilters.branch) return false;
      return true;
    }));
  }
}

function clearFilters() {
  activeFilters = {};
  ['filter-branch','filter-status','filter-type','filter-vendor'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  if (dashboardData) {
    _renderMachineGrid(dashboardData.machines);
    _renderIncidentTable(dashboardData.active_incidents);
  }
}

// ─── Incident Modal ───────────────────────────────────────

let currentIncidentId = null;

async function openIncidentModal(incidentId) {
  currentIncidentId = incidentId;
  document.getElementById('modal-incident-id').textContent = `Incident: ${incidentId}`;
  document.getElementById('modal-incident-body').innerHTML = '<div class="section-loader"><div class="spinner"></div></div>';
  Common.openModal('incident-modal');

  const res = await API.getIncidentDetails(incidentId);
  if (!res.success) {
    document.getElementById('modal-incident-body').innerHTML = '<div class="alert alert-error">Failed to load incident.</div>';
    return;
  }
  _renderIncidentModal(res.data);
}

function _renderIncidentModal(inc) {
  const isResolved = ['Resolved','Closed'].includes(inc.status);
  document.getElementById('modal-reopen-btn').style.display = isResolved ? 'block' : 'none';

  const imagesHtml = (inc.images || []).length > 0
    ? `<div class="image-grid">${inc.images.map(img =>
        `<a href="${img.drive_url}" target="_blank" class="image-thumb">
          <img src="${img.thumbnail_url || img.drive_url}" alt="Incident image">
        </a>`
      ).join('')}</div>`
    : '<p class="text-muted text-sm">No images attached.</p>';

  const checklistHtml = (inc.checklist_items || []).length > 0
    ? inc.checklist_items.map(item => `
      <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid var(--border)">
        <span class="text-sm">${item.item_name}</span>
        <span class="result-${item.result.toLowerCase()}">${item.result}</span>
      </div>`).join('')
    : '<p class="text-muted text-sm">No checklist data.</p>';

  const timelineHtml = (inc.action_log || []).map(log => `
    <div class="timeline-item ${log.action_type === 'INCIDENT_RESOLVED' ? 'tl-resolved' : log.action_type === 'INCIDENT_CREATED' ? 'tl-critical' : ''}">
      <div class="timeline-time">${Common.fmtDateTime(log.timestamp)}</div>
      <div class="timeline-text">${log.action_type.replace(/_/g,' ')}</div>
      <div class="timeline-meta">${log.user_role} · ${log.notes || ''}</div>
    </div>
  `).join('');

  document.getElementById('modal-incident-body').innerHTML = `
    <div class="grid-2 mb-4">
      <div>
        <div class="text-muted text-sm">Machine</div>
        <div style="font-weight:600">${inc.machine_name} <span class="text-mono text-sm text-muted">(${inc.terminal_id})</span></div>
      </div>
      <div>
        <div class="text-muted text-sm">Branch</div>
        <div style="font-weight:600">${inc.branch_name}</div>
      </div>
      <div>
        <div class="text-muted text-sm">Status</div>
        <div>${Common.incidentBadge(inc.status)}</div>
      </div>
      <div>
        <div class="text-muted text-sm">Severity</div>
        <div>${Common.severityBadge(inc.severity)}</div>
      </div>
      <div>
        <div class="text-muted text-sm">Assigned Vendor</div>
        <div style="font-weight:600">${inc.vendor_name || 'Unassigned'}</div>
      </div>
      <div>
        <div class="text-muted text-sm">Aging</div>
        <div class="text-mono" style="color:${inc.aging_minutes > 480 ? 'var(--status-red)' : 'inherit'}; font-weight:600">
          ${Common.fmtDuration(inc.aging_minutes)}
        </div>
      </div>
      <div>
        <div class="text-muted text-sm">Created</div>
        <div>${Common.fmtDateTime(inc.created_at)}</div>
      </div>
      <div>
        <div class="text-muted text-sm">Vendor Reference</div>
        <div class="text-mono">${inc.vendor_reference || '—'}</div>
      </div>
    </div>

    <div class="tab-strip">
      <button class="tab-btn active" onclick="switchTab(this, 'tab-checklist')">Checklist</button>
      <button class="tab-btn" onclick="switchTab(this, 'tab-timeline')">Timeline</button>
      <button class="tab-btn" onclick="switchTab(this, 'tab-images')">Images (${(inc.images||[]).length})</button>
      <button class="tab-btn" onclick="switchTab(this, 'tab-vendor')">Vendor Notes</button>
    </div>

    <div id="tab-checklist" class="tab-panel active">${checklistHtml}</div>
    <div id="tab-timeline" class="tab-panel">
      <div class="timeline mt-2">${timelineHtml || '<p class="text-muted text-sm">No activity logged yet.</p>'}</div>
    </div>
    <div id="tab-images" class="tab-panel">${imagesHtml}</div>
    <div id="tab-vendor" class="tab-panel">
      <div class="mb-4">
        <div class="text-muted text-sm mb-2">Vendor Notes</div>
        <p>${inc.vendor_notes || '—'}</p>
      </div>
      <div>
        <div class="text-muted text-sm mb-2">Vendor Reference / Job Number</div>
        <p class="text-mono">${inc.vendor_reference || '—'}</p>
      </div>
    </div>
  `;
}

function switchTab(btn, targetId) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  const panel = document.getElementById(targetId);
  if (panel) panel.classList.add('active');
}

async function showReassignPanel() {
  Common.closeModal('incident-modal');

  // Load vendor list
  const res = await API.getManagerDashboard({});
  const vendors = res.data?.vendors || [];
  Common.setSelectOptions('reassign-vendor-select', vendors.map(v => ({ value: v.vendor_id, label: v.vendor_name })), '— Select Vendor —');

  document.getElementById('reassign-incident-id').value = currentIncidentId;
  Common.openModal('reassign-modal');
}

async function confirmReassign() {
  const incidentId = document.getElementById('reassign-incident-id').value;
  const newVendorId = document.getElementById('reassign-vendor-select').value;
  const reason = document.getElementById('reassign-reason').value.trim();

  if (!newVendorId) { Common.toast('Please select a vendor.', 'error'); return; }
  if (!reason) { Common.toast('Please provide a reason.', 'error'); return; }

  Common.setLoading('confirm-reassign-btn', true);

  const session = Auth.getSession();
  const res = await API.managerReassign({
    incident_id:   incidentId,
    new_vendor_id: newVendorId,
    reason:        reason,
    reassigned_by: session.user_id,
  });

  Common.setLoading('confirm-reassign-btn', false);

  if (res.success) {
    Common.closeModal('reassign-modal');
    Common.toast('Vendor reassigned successfully.', 'success');
    await loadDashboard();
  } else {
    Common.toast(res.message || 'Reassignment failed.', 'error');
  }
}

async function reopenIncident() {
  if (!currentIncidentId) return;
  const session = Auth.getSession();
  const res = await API.reopenIncident({
    incident_id:  currentIncidentId,
    reopened_by:  session.user_id,
    reason:       'Manager reopened via dashboard',
  });

  if (res.success) {
    Common.closeModal('incident-modal');
    Common.toast('Incident reopened.', 'warning');
    await loadDashboard();
  } else {
    Common.toast(res.message || 'Reopen failed.', 'error');
  }
}

function exportDashboard() {
  Common.toast('Export feature: pipe GET /reports?range=daily to CSV download.', 'info');
}

function exportIncidents() {
  if (!dashboardData?.active_incidents) return;
  const rows = dashboardData.active_incidents.map(i => [
    i.incident_id, i.machine_name, i.branch_name, i.severity, i.status,
    i.vendor_name, Common.fmtDuration(i.aging_minutes), Common.fmtDateTime(i.created_at)
  ]);
  const header = ['Incident ID','Machine','Branch','Severity','Status','Vendor','Age','Created'];
  const csv = [header, ...rows].map(r => r.map(v => `"${v||''}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `incidents-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}
