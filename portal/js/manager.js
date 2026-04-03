/**
 * ATM/ITM Operations Portal — Manager Dashboard Logic
 */

let dashboardData = null;
let statusChart = null;
let trendChart = null;
let activeFilters = {};

document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.requireAuth(['manager'])) return;
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
  let isLive = false;
  let d = null;

  try {
    const res = await API.getManagerDashboard(activeFilters);
    const raw = res || {};
    const candidate = raw.data || raw;

    // Accept if it has any real content
    if (candidate && (candidate.machines || candidate.kpis || candidate.summary)) {
      d = candidate;
      isLive = true;
    }
  } catch(e) {
    console.warn('Dashboard API failed:', e);
  }

  // ── Fall back to demo data if API unavailable ─────────────────────────────
  if (!d) {
    d = _buildDemoData();
    _showDataModeBanner('demo');
  } else {
    _showDataModeBanner('live');
  }

  dashboardData = d;
  document.getElementById('last-refresh-label').textContent =
    'Last refreshed: ' + new Date().toLocaleTimeString('en-GB') + (isLive ? '' : ' (Demo)');

  _renderKPIs(d.kpis || d.summary || {});
  _renderStatusChart(d.status_summary || d.summary || {});
  _renderTrendChart(d.trend_7d || d.trend_7days || []);
  _renderOverdue(d.overdue_incidents || []);
  _renderNotTested(d.not_tested_today || []);
  _renderMachineGrid(d.machines || []);
  _renderIncidentTable(d.open_incidents || d.active_incidents || []);
  _renderRepeatedIssues(d.repeated_issues || d.repeated_machines || []);
  _renderVendorPerformance(d.vendor_performance || []);
  _populateFilterDropdowns(d.branches || [], d.vendors || []);
}

function _showDataModeBanner(mode) {
  let banner = document.getElementById('data-mode-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'data-mode-banner';
    const pageBody = document.querySelector('.page-body');
    if (pageBody) pageBody.insertBefore(banner, pageBody.firstChild);
  }
  if (mode === 'live') {
    banner.style.cssText = '';
    banner.innerHTML = '';
  } else {
    banner.style.cssText = 'background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:10px 16px;margin-bottom:16px;font-size:12px;color:#92400e;display:flex;align-items:center;gap:8px';
    banner.innerHTML = '⚠️ <strong>Demo Mode</strong> — n8n workflow not connected. Showing sample data. Import <strong>WF_Manager_Dashboard_v2.json</strong> into n8n and publish it to see live data.';
  }
}

function _buildDemoData() {
  // Realistic demo data matching KIB branch structure
  const branches = [
    {id:'BR-HO',name:'Head Office',area:'Area 1'},
    {id:'BR-SA',name:'Salmiya',area:'Area 1'},
    {id:'BR-SD',name:'Siddeeq',area:'Area 1'},
    {id:'BR-FA',name:'Farwaniya',area:'Area 1'},
    {id:'BR-AD',name:'Adailiya',area:'Area 1'},
    {id:'BR-DA',name:'Daia',area:'Area 1'},
    {id:'BR-EM',name:'Enmall',area:'Area 1'},
    {id:'BR-WJ',name:'West Jahra',area:'Area 2'},
    {id:'BR-JA',name:'Jaber Alahmad',area:'Area 2'},
    {id:'BR-MI',name:'Ministry Complex',area:'Area 2'},
    {id:'BR-MK',name:'Mubarak Al Kabeer',area:'Area 2'},
    {id:'BR-SS',name:'Sabah Al Salem',area:'Area 2'},
    {id:'BR-RM',name:'Remal Mall',area:'Area 2'},
    {id:'BR-FI',name:'Fintas',area:'Area 2'},
    {id:'BR-AH',name:'Ahmadi',area:'Area 2'},
    {id:'BR-ZA',name:'Zahraa',area:'Area 2'},
  ];

  const statuses = ['GREEN','GREEN','GREEN','GREEN','GREEN','AMBER','AMBER','RED','GREY'];
  const types    = ['ATM','ATM','ITM','Drive Through ATM'];
  const vendors  = ['NCR Gulf','Diebold Nixdorf','ATM Team'];

  const machines = [];
  let mIdx = 1;
  const testedToday = new Date().toISOString();
  branches.forEach(b => {
    const count = Math.floor(Math.random() * 3) + 1;
    for (let i=0; i<count; i++) {
      const st = statuses[Math.floor(Math.random()*statuses.length)];
      const tested = st !== 'GREY';
      machines.push({
        machine_id: `M-${String(mIdx).padStart(3,'0')}`,
        terminal_id: `TRM-${String(mIdx).padStart(4,'0')}`,
        branch_id: b.id,
        branch_name: b.name,
        machine_type: types[Math.floor(Math.random()*types.length)],
        current_status: st,
        tested_today: tested ? 'TRUE' : 'FALSE',
        last_tested_at: tested ? testedToday : '',
        active_incident_id: st === 'RED' ? `INC-00${mIdx}` : '',
        assigned_vendor_id: '',
        location_description: `${b.name} Branch`,
        manufacturer: 'NCR',
        model: 'SelfServ 80',
      });
      mIdx++;
    }
  });

  const total  = machines.length;
  const green  = machines.filter(m=>m.current_status==='GREEN').length;
  const amber  = machines.filter(m=>m.current_status==='AMBER').length;
  const red    = machines.filter(m=>m.current_status==='RED').length;
  const grey   = machines.filter(m=>m.current_status==='GREY').length;
  const tested = machines.filter(m=>m.tested_today==='TRUE').length;

  // Build open incidents for RED machines
  const openIncidents = machines
    .filter(m=>m.current_status==='RED')
    .map((m,i) => ({
      incident_id:          `INC-00${i+1}`,
      machine_id:           m.machine_id,
      terminal_id:          m.terminal_id,
      branch_id:            m.branch_id,
      branch_name:          m.branch_name,
      status:               'Open',
      severity:             'RED',
      issue_category:       'Withdrawal',
      assigned_vendor_name: 'ATM Team',
      assigned_vendor_id:   'VND-ATM',
      sla_hours:            4,
      aging_minutes:        Math.floor(Math.random()*300)+30,
      created_at:           new Date(Date.now()-Math.random()*86400000).toISOString(),
      is_overdue:           Math.random() > 0.5,
    }));

  // 7-day trend
  const trend_7d = [];
  for (let i=6; i>=0; i--) {
    const dt = new Date();
    dt.setDate(dt.getDate()-i);
    trend_7d.push({
      date:     dt.toISOString().slice(0,10),
      new_inc:  Math.floor(Math.random()*5),
      resolved: Math.floor(Math.random()*4),
    });
  }

  return {
    success: true,
    kpis: {
      total_machines: total, green_count: green, amber_count: amber,
      red_count: red, grey_count: grey, tested_today: tested,
      not_tested: grey, open_incidents: openIncidents.length,
      overdue_count: openIncidents.filter(i=>i.is_overdue).length,
      resolved_today: 2, avg_aging_min: 87,
    },
    summary: { total_machines: total, green, amber, red, not_tested: grey },
    status_summary: { green, amber, red, grey },
    machines,
    open_incidents:    openIncidents,
    active_incidents:  openIncidents,
    overdue_incidents: openIncidents.filter(i=>i.is_overdue),
    not_tested_today:  machines.filter(m=>m.tested_today==='FALSE'),
    trend_7d,
    trend_7days: trend_7d,
    branches:    branches.map(b=>({branch_id:b.id,branch_name:b.name,area:b.area})),
    vendors:     [{vendor_id:'VND-NCR',vendor_name:'NCR Gulf'},{vendor_id:'VND-DIE',vendor_name:'Diebold Nixdorf'}],
    vendor_performance: [],
    repeated_machines:  [],
    repeated_issues:    [],
  };
}

function _renderKPIs(kpis) {
  if (!kpis) return;
  // Support both field name formats
  const summary = dashboardData.summary || {};
  const grid = document.getElementById('kpi-grid');
  grid.innerHTML = [
    Common.kpiCard('Total Machines',    summary.total_machines || kpis.total_machines || 0,  null, 'kpi-blue',  '🏧'),
    Common.kpiCard('Critical Issues',   summary.red  || kpis.red_count  || 0, 'Immediate action needed', 'kpi-red',   '🔴'),
    Common.kpiCard('Open Issues',       summary.amber || kpis.amber_count || 0, 'Require attention', 'kpi-amber', '🟡'),
    Common.kpiCard('Healthy',           summary.green || kpis.green_count || 0, 'Fully operational', 'kpi-green', '🟢'),
    Common.kpiCard('Not Tested Today',  summary.not_tested || summary.grey || kpis.grey_count || 0, 'Awaiting check', 'kpi-grey', '⚫'),
    Common.kpiCard('Open Incidents',    kpis.open_incidents || 0, null, 'kpi-red', '⚠️'),
    Common.kpiCard('Resolved Today',    kpis.resolved_today || 0, null, 'kpi-green', '✓'),
    Common.kpiCard('Overdue',           kpis.overdue_incidents || kpis.overdue_count || 0, 'SLA breached', 'kpi-red', '⏱'),
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
          ${item.terminal_id} <span class="text-muted text-sm">(${item.branch_name})</span>
        </div>
        <div class="overdue-item-meta">
          ${Common.incidentBadge(item.status)} &nbsp;
          Vendor: <strong>${item.assigned_vendor_name || 'Unassigned'}</strong> &nbsp;|&nbsp;
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
      <span>${m.terminal_id}</span>
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
        <div class="tile-name">${m.location_description || m.machine_type || ""}</div>
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
    { key: 'terminal_id',    label: 'Machine' },
    { key: 'branch_name',    label: 'Branch' },
    { key: 'severity',       label: 'Severity',       render: (v) => Common.severityBadge(v) },
    { key: 'status',         label: 'Status',         render: (v) => Common.incidentBadge(v) },
    { key: 'assigned_vendor_name', label: 'Assigned Vendor' },
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
    { key: 'terminal_id',        label: 'Machine' },
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
    _renderIncidentTable((dashboardData.open_incidents || dashboardData.active_incidents || []).filter(i => {
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
    _renderIncidentTable(dashboardData.open_incidents || dashboardData.active_incidents);
  }
}

// ─── Incident Modal ───────────────────────────────────────

let currentIncidentId = null;

async function openIncidentModal(incidentId) {
  currentIncidentId = incidentId;
  document.getElementById('modal-incident-id').textContent = `Incident: ${incidentId}`;
  document.getElementById('modal-incident-body').innerHTML = '<div class="section-loader"><div class="spinner"></div></div>';
  Common.openModal('incident-modal');

  // Get basic incident data from dashboard cache
  const allIncidents = [
    ...(dashboardData?.open_incidents || dashboardData?.active_incidents || []),
    ...(dashboardData?.overdue_incidents || [])
  ];
  const cached = allIncidents.find(i => i.incident_id === incidentId);

  // Render basic info immediately from cache
  if (cached) {
    _renderIncidentModal(cached);
  }

  // Then fetch full details (checklist + timeline + images) from API
  try {
    const res = await API.getIncidentDetails(incidentId);
    if (res && res.success) {
      const full = res.incident || res.data || res;
      // Merge cache + full data
      const merged = { ...(cached || {}), ...full };
      _renderIncidentModal(merged);
    }
  } catch(e) {
    // Keep showing cached data if API fails
    if (!cached) {
      document.getElementById('modal-incident-body').innerHTML = '<div class="alert alert-error">Error loading incident details.</div>';
    }
  }
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

  const timelineHtml = (inc.timeline || inc.action_log || []).map(log => `
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
        <div style="font-weight:600">${inc.terminal_id} <span class="text-mono text-sm text-muted">(${inc.branch_name})</span></div>
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
        <div style="font-weight:600">${inc.assigned_vendor_name || inc.vendor_name || 'Unassigned'}</div>
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
  const vendors = dashboardData?.vendors || [];
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
    incident_id:   currentIncidentId,
    reopen_reason: 'Manager reopened via dashboard',
    manager_notes: 'Manager reopened via dashboard',
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
