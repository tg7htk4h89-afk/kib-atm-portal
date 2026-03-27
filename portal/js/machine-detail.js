/**
 * machine-detail.js
 * Handles rendering of the machine detail page.
 * Reads machine_id from URL query param ?id=
 */

import { requireAuth } from './auth.js';
import { API } from './api.js';
import { showToast, statusBadge, incidentBadge, severityBadge, formatDate, formatDuration } from './common.js';

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  requireAuth(['manager', 'branch_user']);

  const params = new URLSearchParams(window.location.search);
  const machineId = params.get('id');

  if (!machineId) {
    document.body.innerHTML = '<div style="padding:60px;text-align:center;color:#666;">No machine ID specified. <a href="manager.html">← Back to Dashboard</a></div>';
    return;
  }

  await loadMachineDetail(machineId);
});

// ─────────────────────────────────────────────
// LOAD MACHINE DETAIL
// ─────────────────────────────────────────────
async function loadMachineDetail(machineId) {
  const container = document.getElementById('machineDetailContent');
  if (!container) return;

  // Show loading skeleton
  container.innerHTML = _loadingSkeleton();

  try {
    const data = await API.getMachineDetail(machineId);

    if (!data || !data.machine) {
      container.innerHTML = `<div class="empty-state">Machine not found. <a href="manager.html">← Back</a></div>`;
      return;
    }

    // Populate page title
    const titleEl = document.getElementById('machinePageTitle');
    if (titleEl) {
      titleEl.textContent = `${data.machine.terminal_id} — ${data.machine.branch_name}`;
    }

    // Render all sections
    _renderMachineInfo(data.machine);
    _renderActivityStats(data.stats);
    _renderCurrentIncident(data.current_incident);
    _renderLastChecklist(data.last_checklist);
    _renderTimeline(data.timeline);
    _renderImages(data.images);
    _renderIncidentHistory(data.incident_history);
    _renderVendorHistory(data.vendor_history);

    // Remove skeleton
    container.innerHTML = '';
    document.getElementById('machineDetailSections').style.display = 'block';

  } catch (err) {
    console.error('Machine detail load error:', err);
    container.innerHTML = `<div class="empty-state error">Failed to load machine data. <button onclick="location.reload()" class="btn-sm">Retry</button></div>`;
  }
}

// ─────────────────────────────────────────────
// MACHINE INFO CARD
// ─────────────────────────────────────────────
function _renderMachineInfo(machine) {
  const el = document.getElementById('machineInfoCard');
  if (!el) return;

  const statusClass = (machine.current_status || 'grey').toLowerCase();

  el.innerHTML = `
    <div class="info-card-header">
      <div class="machine-id-block">
        <span class="terminal-id">${machine.terminal_id}</span>
        <span class="status-badge status-${statusClass}">${(machine.current_status || 'Grey').toUpperCase()}</span>
      </div>
      <div class="machine-actions">
        <a href="manager.html" class="btn btn-outline btn-sm">← Dashboard</a>
      </div>
    </div>
    <div class="info-grid">
      <div class="info-item">
        <label>Branch</label>
        <value>${machine.branch_name || '—'}</value>
      </div>
      <div class="info-item">
        <label>Branch Code</label>
        <value>${machine.branch_code || '—'}</value>
      </div>
      <div class="info-item">
        <label>Machine Type</label>
        <value>${machine.machine_type || '—'}</value>
      </div>
      <div class="info-item">
        <label>Manufacturer</label>
        <value>${machine.manufacturer || '—'}</value>
      </div>
      <div class="info-item">
        <label>Model</label>
        <value>${machine.model || '—'}</value>
      </div>
      <div class="info-item">
        <label>Serial Number</label>
        <value class="mono">${machine.serial_number || '—'}</value>
      </div>
      <div class="info-item">
        <label>Location</label>
        <value>${machine.location_description || '—'}</value>
      </div>
      <div class="info-item">
        <label>Installation Date</label>
        <value>${machine.installation_date ? formatDate(machine.installation_date) : '—'}</value>
      </div>
      <div class="info-item">
        <label>Tested Today</label>
        <value>${machine.tested_today ? '<span class="pill-green">Yes</span>' : '<span class="pill-grey">No</span>'}</value>
      </div>
      <div class="info-item">
        <label>Last Tested</label>
        <value>${machine.last_tested_at ? formatDate(machine.last_tested_at) : '—'}</value>
      </div>
    </div>
  `;
}

// ─────────────────────────────────────────────
// ACTIVITY STATS
// ─────────────────────────────────────────────
function _renderActivityStats(stats) {
  const el = document.getElementById('activityStatsCard');
  if (!el || !stats) return;

  el.innerHTML = `
    <h3 class="section-title">Activity Statistics</h3>
    <div class="stats-grid">
      <div class="stat-item">
        <div class="stat-value">${stats.total_checks_30d ?? '—'}</div>
        <div class="stat-label">Checks (30 days)</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">${stats.total_incidents ?? '—'}</div>
        <div class="stat-label">Total Incidents</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">${stats.open_incidents ?? '—'}</div>
        <div class="stat-label">Open Now</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">${stats.avg_resolution_hours != null ? stats.avg_resolution_hours + 'h' : '—'}</div>
        <div class="stat-label">Avg Resolution</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">${stats.repeated_issues ?? '—'}</div>
        <div class="stat-label">Repeated Issues</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">${stats.uptime_percent != null ? stats.uptime_percent + '%' : '—'}</div>
        <div class="stat-label">Uptime (30d)</div>
      </div>
    </div>
  `;
}

// ─────────────────────────────────────────────
// CURRENT INCIDENT
// ─────────────────────────────────────────────
function _renderCurrentIncident(incident) {
  const el = document.getElementById('currentIncidentCard');
  if (!el) return;

  if (!incident || !incident.incident_id) {
    el.innerHTML = `<h3 class="section-title">Current Incident</h3><div class="empty-state-sm">No active incident</div>`;
    return;
  }

  const agingHours = incident.aging_minutes ? Math.round(incident.aging_minutes / 60) : 0;
  const overdue = agingHours > 4;

  el.innerHTML = `
    <h3 class="section-title">Current Incident ${overdue ? '<span class="overdue-tag">OVERDUE</span>' : ''}</h3>
    <div class="incident-summary ${overdue ? 'overdue' : ''}">
      <div class="inc-row">
        <span class="inc-label">Incident ID</span>
        <span class="inc-value mono">${incident.incident_id}</span>
      </div>
      <div class="inc-row">
        <span class="inc-label">Status</span>
        <span class="inc-value">${incidentBadge(incident.status)}</span>
      </div>
      <div class="inc-row">
        <span class="inc-label">Severity</span>
        <span class="inc-value">${severityBadge(incident.severity)}</span>
      </div>
      <div class="inc-row">
        <span class="inc-label">Assigned Vendor</span>
        <span class="inc-value">${incident.assigned_vendor || '—'}</span>
      </div>
      <div class="inc-row">
        <span class="inc-label">Category</span>
        <span class="inc-value">${incident.issue_category || '—'}</span>
      </div>
      <div class="inc-row">
        <span class="inc-label">Created</span>
        <span class="inc-value">${formatDate(incident.created_at)}</span>
      </div>
      <div class="inc-row">
        <span class="inc-label">Aging</span>
        <span class="inc-value ${overdue ? 'text-red' : ''}">${agingHours}h ${incident.aging_minutes % 60}m</span>
      </div>
      ${incident.vendor_notes ? `
      <div class="inc-row">
        <span class="inc-label">Last Vendor Note</span>
        <span class="inc-value">${incident.vendor_notes}</span>
      </div>` : ''}
    </div>
  `;
}

// ─────────────────────────────────────────────
// LAST CHECKLIST SUBMISSION
// ─────────────────────────────────────────────
function _renderLastChecklist(checklist) {
  const el = document.getElementById('lastChecklistCard');
  if (!el) return;

  if (!checklist || !checklist.items || checklist.items.length === 0) {
    el.innerHTML = `<h3 class="section-title">Last Checklist Submission</h3><div class="empty-state-sm">No submission on record</div>`;
    return;
  }

  const failedItems = checklist.items.filter(i => i.result === 'Fail');
  const passedItems = checklist.items.filter(i => i.result === 'Pass');
  const naItems    = checklist.items.filter(i => i.result === 'N/A');

  const summaryHtml = `
    <div class="checklist-summary">
      <span class="cs-item cs-pass">✓ ${passedItems.length} Pass</span>
      <span class="cs-item cs-fail">✗ ${failedItems.length} Fail</span>
      <span class="cs-item cs-na">— ${naItems.length} N/A</span>
      <span class="cs-meta">Submitted ${formatDate(checklist.submitted_at)} by ${checklist.submitted_by}</span>
    </div>
  `;

  const itemsHtml = checklist.items.map(item => `
    <div class="cl-item cl-${(item.result || 'na').toLowerCase()}">
      <span class="cl-result">${item.result === 'Pass' ? '✓' : item.result === 'Fail' ? '✗' : '—'}</span>
      <span class="cl-name">${item.item_name}</span>
      <span class="cl-badge badge-${(item.result || 'na').toLowerCase()}">${item.result}</span>
      ${item.notes ? `<span class="cl-notes">${item.notes}</span>` : ''}
    </div>
  `).join('');

  el.innerHTML = `
    <h3 class="section-title">Last Checklist Submission</h3>
    ${summaryHtml}
    <div class="checklist-items-list">${itemsHtml}</div>
    ${checklist.general_comments ? `<div class="general-comments"><strong>Comments:</strong> ${checklist.general_comments}</div>` : ''}
  `;
}

// ─────────────────────────────────────────────
// TIMELINE
// ─────────────────────────────────────────────
function _renderTimeline(timeline) {
  const el = document.getElementById('timelineCard');
  if (!el) return;

  if (!timeline || timeline.length === 0) {
    el.innerHTML = `<h3 class="section-title">Activity Timeline</h3><div class="empty-state-sm">No timeline events</div>`;
    return;
  }

  const eventsHtml = timeline.map(event => `
    <div class="tl-event tl-${_timelineClass(event.action_type)}">
      <div class="tl-dot"></div>
      <div class="tl-body">
        <div class="tl-header">
          <span class="tl-action">${_formatAction(event.action_type)}</span>
          <span class="tl-time">${formatDate(event.timestamp)}</span>
        </div>
        <div class="tl-actor">${event.user_role || ''} ${event.user_id ? '· ' + event.user_id : ''}</div>
        ${event.notes ? `<div class="tl-notes">${event.notes}</div>` : ''}
      </div>
    </div>
  `).join('');

  el.innerHTML = `
    <h3 class="section-title">Activity Timeline</h3>
    <div class="timeline">${eventsHtml}</div>
  `;
}

function _timelineClass(actionType) {
  if (!actionType) return 'default';
  if (actionType.includes('incident_created')) return 'red';
  if (actionType.includes('resolved') || actionType.includes('closed')) return 'green';
  if (actionType.includes('vendor')) return 'blue';
  if (actionType.includes('reopen')) return 'amber';
  return 'default';
}

function _formatAction(actionType) {
  if (!actionType) return 'Event';
  return actionType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ─────────────────────────────────────────────
// IMAGES
// ─────────────────────────────────────────────
function _renderImages(images) {
  const el = document.getElementById('imagesCard');
  if (!el) return;

  if (!images || images.length === 0) {
    el.innerHTML = `<h3 class="section-title">Uploaded Images</h3><div class="empty-state-sm">No images uploaded</div>`;
    return;
  }

  const imagesHtml = images.map(img => `
    <div class="img-thumb">
      <a href="${img.drive_url}" target="_blank" rel="noopener">
        ${img.thumbnail_url
          ? `<img src="${img.thumbnail_url}" alt="${img.image_type || 'Image'}" loading="lazy" />`
          : `<div class="img-placeholder">🖼 View</div>`
        }
      </a>
      <div class="img-meta">
        <span>${img.image_type || 'Image'}</span>
        <span>${formatDate(img.uploaded_at)}</span>
      </div>
    </div>
  `).join('');

  el.innerHTML = `
    <h3 class="section-title">Uploaded Images (${images.length})</h3>
    <div class="image-grid">${imagesHtml}</div>
  `;
}

// ─────────────────────────────────────────────
// INCIDENT HISTORY TABLE
// ─────────────────────────────────────────────
function _renderIncidentHistory(incidents) {
  const el = document.getElementById('incidentHistoryCard');
  if (!el) return;

  if (!incidents || incidents.length === 0) {
    el.innerHTML = `<h3 class="section-title">Incident History</h3><div class="empty-state-sm">No previous incidents</div>`;
    return;
  }

  const rows = incidents.map(inc => `
    <tr>
      <td class="mono">${inc.incident_id}</td>
      <td>${severityBadge(inc.severity)}</td>
      <td>${incidentBadge(inc.status)}</td>
      <td>${inc.issue_category || '—'}</td>
      <td>${inc.assigned_vendor || '—'}</td>
      <td>${formatDate(inc.created_at)}</td>
      <td>${inc.resolved_at ? formatDate(inc.resolved_at) : '—'}</td>
      <td>${inc.resolution_time_minutes != null ? Math.round(inc.resolution_time_minutes / 60) + 'h' : '—'}</td>
      <td>${inc.reopen_count ?? 0}</td>
    </tr>
  `).join('');

  el.innerHTML = `
    <h3 class="section-title">Incident History</h3>
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Incident ID</th>
            <th>Severity</th>
            <th>Status</th>
            <th>Category</th>
            <th>Vendor</th>
            <th>Created</th>
            <th>Resolved</th>
            <th>Resolution</th>
            <th>Reopens</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

// ─────────────────────────────────────────────
// VENDOR HISTORY
// ─────────────────────────────────────────────
function _renderVendorHistory(history) {
  const el = document.getElementById('vendorHistoryCard');
  if (!el) return;

  if (!history || history.length === 0) {
    el.innerHTML = `<h3 class="section-title">Vendor History</h3><div class="empty-state-sm">No vendor records</div>`;
    return;
  }

  const rows = history.map(v => `
    <tr>
      <td>${v.vendor_name}</td>
      <td>${v.incident_count ?? 0}</td>
      <td>${v.resolved_count ?? 0}</td>
      <td>${v.avg_resolution_hours != null ? v.avg_resolution_hours + 'h' : '—'}</td>
      <td>${formatDate(v.last_assigned_at)}</td>
    </tr>
  `).join('');

  el.innerHTML = `
    <h3 class="section-title">Vendor History</h3>
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Vendor</th>
            <th>Assigned</th>
            <th>Resolved</th>
            <th>Avg Resolution</th>
            <th>Last Assignment</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

// ─────────────────────────────────────────────
// LOADING SKELETON
// ─────────────────────────────────────────────
function _loadingSkeleton() {
  return `
    <div class="skeleton-block"></div>
    <div class="skeleton-block" style="height:100px;margin-top:16px;"></div>
    <div class="skeleton-block" style="height:80px;margin-top:16px;"></div>
  `;
}
