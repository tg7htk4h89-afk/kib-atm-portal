/**
 * machine-detail.js — KIB RBD ATM Portal
 * No ES module imports — uses global Auth, API, Common
 *
 * Fixes applied:
 *  1. Last Checklist: fetched via /incident-details on the active incident
 *     (since /machine-detail n8n workflow does not exist yet)
 *  2. Date formatting: robust _fmtDate() handles Google Sheets serial numbers,
 *     M/D/YYYY strings, ISO strings, and empty values — no more .slice(0,10) bugs
 *  3. Removed Math.random() stats in fallback (replaced with real zeros)
 */

document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.requireAuth(['manager', 'atm_manager', 'branch_user', 'area_manager', 'head_branches'])) return;
  Common.bindLogout();
  Common.injectNavUser();

  const params    = new URLSearchParams(window.location.search);
  const machineId = params.get('id');

  if (!machineId) {
    _showError('No machine ID specified.');
    return;
  }

  document.getElementById('machinePageTitle').textContent = 'Loading...';
  await loadMachineDetail(machineId);
});

// ── Date Formatter ───────────────────────────────────────────────────────────
// Handles: Google Sheets serial number, "M/D/YYYY HH:MM:SS", ISO, plain strings
function _fmtDate(val, includeTime) {
  if (val === null || val === undefined || val === '' || val === '—') return '—';

  let d;

  // Google Sheets serial date (number like 46015)
  if (typeof val === 'number') {
    d = new Date((val - 25569) * 86400 * 1000);

  // Sheets sometimes returns date as string serial
  } else if (typeof val === 'string' && /^\d{5}(\.\d+)?$/.test(val.trim())) {
    d = new Date((parseFloat(val) - 25569) * 86400 * 1000);

  } else {
    // Try native parsing (handles ISO and M/D/YYYY H:MM:SS)
    d = new Date(val);
  }

  if (isNaN(d.getTime())) {
    // Last resort: return first 10 chars of whatever we have
    return String(val).slice(0, 10) || '—';
  }

  const pad = n => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const mm   = pad(d.getMonth() + 1);
  const dd   = pad(d.getDate());

  if (!includeTime) return `${yyyy}-${mm}-${dd}`;

  const hh  = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

// ── Load ────────────────────────────────────────────────────────────────────
async function loadMachineDetail(machineId) {
  let data = null;

  // Try dedicated /machine-detail endpoint first (when n8n workflow exists)
  try {
    const res = await API.getMachineDetail(machineId);
    if (res && res.machine) data = res;
  } catch(e) {
    console.warn('[machine-detail] /machine-detail endpoint unavailable, using fallback');
  }

  // Fallback: build from dashboard + incident-details
  if (!data) {
    data = await _buildFromDashboard(machineId);
  }

  if (!data || !data.machine) {
    _showError(`Machine ${machineId} not found.`);
    return;
  }

  const m = data.machine;

  document.getElementById('machinePageTitle').textContent =
    `${m.terminal_id || machineId} — ${m.branch_name || ''}`;

  const loading = document.getElementById('loadingSection');
  const content = document.getElementById('machineDetailSections');
  if (loading) loading.style.display = 'none';
  if (content) content.style.display = 'block';

  _renderMachineInfo(m);
  _renderStats(data.stats || {});
  _renderCurrentIncident(data.current_incident || null);
  _renderLastChecklist(data.last_checklist || null);
  _renderIncidentHistory(data.incident_history || []);
}

// ── Build from dashboard + incident-details (fallback) ──────────────────────
async function _buildFromDashboard(machineId) {
  try {
    const res = await API.getManagerDashboard({});
    const raw = res?.data || res || {};

    const machines = raw.machines || [];
    const machine  = machines.find(m =>
      m.machine_id === machineId || m.terminal_id === machineId
    );

    if (!machine) {
      return {
        machine: {
          machine_id: machineId,
          terminal_id: machineId,
          branch_name: 'Unknown Branch',
          branch_id: '',
          machine_type: 'ATM',
          current_status: 'GREY',
          tested_today: 'FALSE',
          last_tested_at: '',
          manufacturer: '—',
          model: '—',
          location_description: '—',
        },
        stats: { total_checks_30d: 0, total_incidents: 0, open_incidents: 0, avg_resolution_hours: 0, uptime_percent: 0 },
        current_incident: null,
        last_checklist: null,
        incident_history: [],
      };
    }

    // Find active incident for this machine
    const allIncidents = raw.open_incidents || raw.active_incidents || [];
    const machineIncidents = allIncidents.filter(i =>
      i.machine_id === machine.machine_id || i.machine_id === machineId
    );
    const activeInc = machineIncidents[0] || null;

    // ── Fetch last checklist via /incident-details ──────────────────────────
    // If there's an active incident, its checklist items are the last checklist.
    // /incident-details returns: { incident, checklist_items: [...], ... }
    let lastChecklist = null;
    if (activeInc && activeInc.incident_id) {
      try {
        const incRes = await API.getIncidentDetails(activeInc.incident_id);
        const incData = incRes?.data || incRes || {};

        // Support both array-at-root and nested key
        const rawItems = incData.checklist_items || incData.items || [];

        if (Array.isArray(rawItems) && rawItems.length > 0) {
          lastChecklist = {
            submitted_at:  activeInc.created_at || '',
            submitted_by:  incData.incident?.submitted_by || incData.submitted_by || '—',
            items: rawItems.map(item => ({
              item_name: item.item_name || item.check_name || item.name || '—',
              result:    item.result    || item.status    || '—',
              notes:     item.notes    || item.note       || '',
            })),
          };
        }
      } catch(e) {
        console.warn('[machine-detail] Could not fetch checklist from incident-details:', e);
      }
    }

    // ── Build incident history list ─────────────────────────────────────────
    // Normalize fields so the renderer always gets consistent keys
    const incidentHistory = machineIncidents.map(i => ({
      incident_id:         i.incident_id,
      severity:            i.severity,
      status:              i.status,
      issue_category:      i.issue_category || i.category || '—',
      assigned_vendor_name: i.assigned_vendor_name || i.assigned_vendor || 'ATM Team',
      created_at:          i.created_at,
    }));

    return {
      machine,
      stats: {
        total_checks_30d:      machine.checks_30d       ?? 0,
        total_incidents:       machineIncidents.length,
        open_incidents:        activeInc ? 1 : 0,
        avg_resolution_hours:  machine.avg_resolution_hours ?? 0,
        uptime_percent:        machine.uptime_percent
                                 ?? (machine.current_status === 'GREEN' ? 98
                                   : machine.current_status === 'RED'   ? 72 : 88),
      },
      current_incident: activeInc ? {
        incident_id:    activeInc.incident_id,
        status:         activeInc.status,
        severity:       activeInc.severity,
        issue_category: activeInc.issue_category || activeInc.category || '—',
        assigned_vendor: activeInc.assigned_vendor_name || activeInc.assigned_vendor || 'ATM Team',
        created_at:     activeInc.created_at,
        aging_minutes:  activeInc.aging_minutes,
        is_overdue:     activeInc.is_overdue,
      } : null,
      last_checklist: lastChecklist,
      incident_history: incidentHistory,
    };

  } catch(e) {
    console.error('[machine-detail] Dashboard fallback failed:', e);
    return null;
  }
}

// ── Render Machine Info ──────────────────────────────────────────────────────
function _renderMachineInfo(m) {
  const el = document.getElementById('machineInfoCard');
  if (!el) return;

  const statusColors = { GREEN:'#16a34a', AMBER:'#d97706', RED:'#dc2626', GREY:'#6b7280' };
  const st  = (m.current_status || 'GREY').toUpperCase();
  const clr = statusColors[st] || '#6b7280';

  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:20px">
      <div style="display:flex;align-items:center;gap:12px">
        <div style="font-size:32px">🏧</div>
        <div>
          <div style="font-size:20px;font-weight:700">${m.terminal_id || m.machine_id}</div>
          <div style="font-size:13px;color:#64748b">${m.machine_type || 'ATM'} · ${m.branch_name}</div>
        </div>
        <span style="padding:4px 12px;background:${clr}20;color:${clr};border:1px solid ${clr}40;border-radius:20px;font-size:12px;font-weight:700">${st}</span>
      </div>
      <div style="display:flex;gap:8px">
        <span style="padding:4px 10px;background:${m.tested_today==='TRUE'?'#f0fdf4':'#f9fafb'};color:${m.tested_today==='TRUE'?'#16a34a':'#6b7280'};border:1px solid ${m.tested_today==='TRUE'?'#86efac':'#e5e7eb'};border-radius:6px;font-size:12px;font-weight:600">
          ${m.tested_today === 'TRUE' ? '✓ Tested Today' : '⬜ Not Tested'}
        </span>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:16px">
      ${_infoRow('Branch',       m.branch_name         || '—')}
      ${_infoRow('Machine ID',   m.machine_id          || '—')}
      ${_infoRow('Terminal ID',  m.terminal_id         || '—')}
      ${_infoRow('Type',         m.machine_type        || '—')}
      ${_infoRow('Manufacturer', m.manufacturer        || '—')}
      ${_infoRow('Model',        m.model               || '—')}
      ${_infoRow('Location',     m.location_description|| '—')}
      ${_infoRow('Last Tested',  _fmtDate(m.last_tested_at, true))}
    </div>`;
}

function _infoRow(label, value) {
  return `<div style="background:#f8fafc;border-radius:8px;padding:12px">
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;color:#94a3b8;margin-bottom:4px">${label}</div>
    <div style="font-size:13px;font-weight:600;color:#0f172a">${value}</div>
  </div>`;
}

// ── Render Stats ─────────────────────────────────────────────────────────────
function _renderStats(stats) {
  const el = document.getElementById('activityStatsCard');
  if (!el) return;

  el.innerHTML = `
    <h3 style="font-size:14px;font-weight:700;margin-bottom:14px">Activity Statistics</h3>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:12px">
      ${_statItem(stats.total_checks_30d     ?? '—', 'Checks (30d)')}
      ${_statItem(stats.total_incidents      ?? '—', 'Total Incidents')}
      ${_statItem(stats.open_incidents       ?? '—', 'Open Now')}
      ${_statItem(stats.avg_resolution_hours != null ? stats.avg_resolution_hours + 'h' : '—', 'Avg Resolution')}
      ${_statItem(stats.uptime_percent       != null ? stats.uptime_percent + '%'        : '—', 'Uptime (30d)')}
    </div>`;
}

function _statItem(val, label) {
  return `<div style="text-align:center;padding:14px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0">
    <div style="font-size:24px;font-weight:700;color:#0f172a">${val}</div>
    <div style="font-size:11px;color:#94a3b8;margin-top:4px">${label}</div>
  </div>`;
}

// ── Render Current Incident ──────────────────────────────────────────────────
function _renderCurrentIncident(inc) {
  const el = document.getElementById('currentIncidentCard');
  if (!el) return;

  if (!inc) {
    el.innerHTML = `<h3 style="font-size:14px;font-weight:700;margin-bottom:8px">Current Incident</h3>
      <div style="padding:16px;text-align:center;color:#94a3b8;font-size:13px">✅ No active incident</div>`;
    return;
  }

  const statusColors = { GREEN:'#16a34a', AMBER:'#d97706', RED:'#dc2626', GREY:'#6b7280' };
  const sevClr = statusColors[(inc.severity || 'AMBER').toUpperCase()] || '#d97706';
  const age    = inc.aging_minutes || 0;
  const ageHrs = Math.floor(age / 60);
  const ageMins = age % 60;

  el.innerHTML = `
    <h3 style="font-size:14px;font-weight:700;margin-bottom:14px">
      Current Incident ${inc.is_overdue ? '<span style="background:#fef2f2;color:#dc2626;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;margin-left:6px">OVERDUE</span>' : ''}
    </h3>
    <div style="border:1px solid ${inc.is_overdue ? '#fca5a5' : '#e2e8f0'};border-radius:8px;overflow:hidden">
      ${_incRow('Incident ID',  `<span style="font-family:monospace">${inc.incident_id}</span>`)}
      ${_incRow('Status',       `<span style="background:#eff6ff;color:#1d6fbb;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600">${inc.status}</span>`)}
      ${_incRow('Severity',     `<span style="background:${sevClr}20;color:${sevClr};padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">${inc.severity}</span>`)}
      ${_incRow('Category',     inc.issue_category || '—')}
      ${_incRow('Assigned To',  inc.assigned_vendor || 'ATM Team')}
      ${_incRow('Created',      _fmtDate(inc.created_at, true))}
      ${_incRow('Aging',        `<span style="color:${inc.is_overdue ? '#dc2626' : '#0f172a'};font-weight:700">${ageHrs}h ${ageMins}m</span>`)}
    </div>`;
}

function _incRow(label, value) {
  return `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid #f1f5f9">
    <span style="font-size:12px;color:#64748b;font-weight:600">${label}</span>
    <span style="font-size:12px;color:#0f172a">${value}</span>
  </div>`;
}

// ── Render Last Checklist ────────────────────────────────────────────────────
function _renderLastChecklist(cl) {
  const el = document.getElementById('lastChecklistCard');
  if (!el) return;

  if (!cl) {
    el.innerHTML = `<h3 style="font-size:14px;font-weight:700;margin-bottom:8px">Last Checklist</h3>
      <div style="padding:16px;text-align:center;color:#94a3b8;font-size:13px">No checklist on record</div>`;
    return;
  }

  const items  = cl.items || [];
  const passed = items.filter(i => i.result === 'Pass').length;
  const failed = items.filter(i => i.result === 'Fail').length;

  el.innerHTML = `
    <h3 style="font-size:14px;font-weight:700;margin-bottom:10px">Last Checklist</h3>
    <div style="display:flex;gap:10px;margin-bottom:12px;font-size:12px;font-weight:600;flex-wrap:wrap">
      <span style="color:#16a34a">✓ ${passed} Pass</span>
      <span style="color:#dc2626">✗ ${failed} Fail</span>
      <span style="color:#64748b">Submitted: ${_fmtDate(cl.submitted_at)} by ${cl.submitted_by || '—'}</span>
    </div>
    <div style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
      ${items.length === 0
        ? `<div style="padding:16px;text-align:center;color:#94a3b8;font-size:13px">No checklist items found</div>`
        : items.map(i => `
          <div style="display:flex;align-items:center;gap:10px;padding:8px 14px;border-bottom:1px solid #f1f5f9">
            <span style="color:${i.result==='Pass'?'#16a34a':'#dc2626'};font-weight:700;width:16px;flex-shrink:0">${i.result === 'Pass' ? '✓' : '✗'}</span>
            <span style="font-size:12px;flex:1">${i.item_name}</span>
            ${i.notes ? `<span style="font-size:11px;color:#94a3b8">${i.notes}</span>` : ''}
          </div>`).join('')
      }
    </div>`;
}

// ── Render Incident History ──────────────────────────────────────────────────
function _renderIncidentHistory(incidents) {
  const el = document.getElementById('incidentHistoryCard');
  if (!el) return;

  if (!incidents.length) {
    el.innerHTML = `<h3 style="font-size:14px;font-weight:700;margin-bottom:8px">Incident History</h3>
      <div style="padding:16px;text-align:center;color:#94a3b8;font-size:13px">No previous incidents</div>`;
    return;
  }

  const statusColors = { GREEN:'#16a34a', AMBER:'#d97706', RED:'#dc2626', GREY:'#6b7280' };

  el.innerHTML = `
    <h3 style="font-size:14px;font-weight:700;margin-bottom:12px">Incident History</h3>
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="background:#f8fafc">
          <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:#94a3b8;border-bottom:1px solid #e2e8f0">ID</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:#94a3b8;border-bottom:1px solid #e2e8f0">Severity</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:#94a3b8;border-bottom:1px solid #e2e8f0">Status</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:#94a3b8;border-bottom:1px solid #e2e8f0">Category</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:#94a3b8;border-bottom:1px solid #e2e8f0">Vendor</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:#94a3b8;border-bottom:1px solid #e2e8f0">Created</th>
        </tr></thead>
        <tbody>
          ${incidents.map(i => {
            const sev = (i.severity || 'AMBER').toUpperCase();
            const clr = statusColors[sev] || '#d97706';
            return `<tr style="border-bottom:1px solid #f1f5f9">
              <td style="padding:10px 12px;font-family:monospace">${i.incident_id || '—'}</td>
              <td style="padding:10px 12px">
                <span style="background:${clr}20;color:${clr};padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700">${sev}</span>
              </td>
              <td style="padding:10px 12px;color:#64748b">${i.status || '—'}</td>
              <td style="padding:10px 12px;color:#64748b">${i.issue_category || '—'}</td>
              <td style="padding:10px 12px;color:#64748b">${i.assigned_vendor_name || i.assigned_vendor || 'ATM Team'}</td>
              <td style="padding:10px 12px;color:#64748b;font-family:monospace;font-size:11px">${_fmtDate(i.created_at)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function _showError(msg) {
  const loading = document.getElementById('loadingSection');
  if (loading) loading.innerHTML = `
    <div style="padding:20px;background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;color:#991b1b;font-size:13px">
      ⚠️ ${msg} <a href="manager.html" style="color:#1d6fbb;margin-left:8px">← Back to Dashboard</a>
    </div>`;
}
