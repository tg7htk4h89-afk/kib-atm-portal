/**
 * ATM/ITM Operations Portal — Vendor Page Logic
 */

let allIncidents = [];
let selectedIncident = null;
let proofImageFile = null;

document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.requireAuth(['vendor_user', 'atm_manager'])) return;
  Common.bindLogout();
  Common.injectNavUser();

  const session = Auth.getSession();
  if (session.vendor_name) {
    document.getElementById('vendor-name-display').textContent = session.vendor_name;
  }

  await loadIncidents();
});

async function loadIncidents() {
  const session = Auth.getSession();
  const res = await API.getManagerDashboard({
    vendor_id: session.vendor_id,
    view: 'vendor'
  });

  if (!res.success) {
    Common.toast('Failed to load incidents.', 'error');
    return;
  }

  allIncidents = res.data.active_incidents || [];
  renderIncidentList(allIncidents);
}

function renderIncidentList(incidents) {
  const container = document.getElementById('vendor-incident-list');
  const badge = document.getElementById('incident-count-badge');

  badge.textContent = incidents.length;

  if (incidents.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">✓</div>
        <p>No active incidents assigned to you.</p>
      </div>`;
    return;
  }

  container.innerHTML = incidents.map(inc => {
    const status = inc.status;
    const aging = inc.aging_minutes;
    const isOverdue = aging > (inc.severity === 'Critical' ? 120 : 480);

    return `
      <div class="card mb-3" id="inc-card-${inc.incident_id}" style="cursor:pointer; border-left: 3px solid ${_statusColor(status)}"
           onclick="selectIncident('${inc.incident_id}')">
        <div class="card-body-tight" style="padding:12px 16px">
          <div class="flex justify-between items-center">
            <span class="text-mono" style="font-size:11px; color:var(--text-muted)">${inc.incident_id}</span>
            ${Common.incidentBadge(status)}
          </div>
          <div style="font-size:13px; font-weight:600; margin:4px 0">${inc.machine_name}</div>
          <div style="font-size:11px; color:var(--text-muted)">${inc.branch_name}</div>
          <div class="flex justify-between items-center mt-2">
            ${Common.severityBadge(inc.severity)}
            <span class="text-mono text-sm" style="color:${isOverdue ? 'var(--status-red)' : 'var(--text-muted)'}">
              ${Common.fmtDuration(aging)} ${isOverdue ? '⚠' : ''}
            </span>
          </div>
        </div>
      </div>`;
  }).join('');
}

function _statusColor(status) {
  return { 'Open':'#dc2626', 'Assigned':'#2563eb', 'In Progress':'#d97706', 'Pending':'#7c3aed', 'Resolved':'#16a34a', 'Reopened':'#c2410c' }[status] || '#6b7280';
}

function filterIncidents() {
  const statusFilter   = document.getElementById('vendor-filter-status').value;
  const severityFilter = document.getElementById('vendor-filter-severity').value;

  const filtered = allIncidents.filter(i => {
    if (statusFilter   && i.status   !== statusFilter)   return false;
    if (severityFilter && i.severity !== severityFilter) return false;
    return true;
  });

  renderIncidentList(filtered);
}

async function selectIncident(incidentId) {
  // Highlight selected card
  document.querySelectorAll('[id^="inc-card-"]').forEach(c => c.style.outline = '');
  const card = document.getElementById(`inc-card-${incidentId}`);
  if (card) card.style.outline = '2px solid var(--brand-accent)';

  document.getElementById('vendor-select-prompt').style.display = 'none';
  document.getElementById('vendor-detail-panel').style.display = 'block';

  const res = await API.getIncidentDetails(incidentId);
  if (!res.success) {
    Common.toast('Failed to load incident details.', 'error');
    return;
  }

  selectedIncident = res.data;
  _populateDetailPanel(res.data);
}

function _populateDetailPanel(inc) {
  document.getElementById('detail-incident-id').textContent = inc.incident_id;
  document.getElementById('detail-status-badge').innerHTML = Common.incidentBadge(inc.status);
  document.getElementById('detail-machine-name').textContent = inc.machine_name;
  document.getElementById('detail-terminal-id').textContent = inc.terminal_id;
  document.getElementById('detail-branch').textContent = inc.branch_name;
  document.getElementById('detail-severity').innerHTML = Common.severityBadge(inc.severity);
  document.getElementById('detail-branch-comments').textContent = inc.general_comments || 'No comments provided.';

  // Failed items
  const failedItems = (inc.checklist_items || []).filter(i => i.result === 'FAIL');
  document.getElementById('detail-failed-items').innerHTML = failedItems.length > 0
    ? failedItems.map(i => `
      <div style="display:flex; gap:8px; padding:6px 0; border-bottom:1px solid var(--border); font-size:12px">
        <span class="result-fail">✕ FAIL</span>
        <span>${i.item_name}</span>
        ${i.note ? `<span class="text-muted"> — ${i.note}</span>` : ''}
      </div>`).join('')
    : '<p class="text-muted text-sm">No failed items.</p>';

  // Images
  if ((inc.images || []).length > 0) {
    document.getElementById('detail-images').innerHTML = inc.images.map(img =>
      `<a href="${img.drive_url}" target="_blank" class="image-thumb">
        <img src="${img.thumbnail_url || img.drive_url}" alt="image">
      </a>`
    ).join('');
  }

  // Timeline
  document.getElementById('detail-timeline').innerHTML = (inc.action_log || []).map(log => `
    <div class="timeline-item">
      <div class="timeline-time">${Common.fmtDateTime(log.timestamp)}</div>
      <div class="timeline-text">${log.action_type.replace(/_/g,' ')}</div>
      <div class="timeline-meta">${log.user_role} · ${log.notes || ''}</div>
    </div>
  `).join('') || '<p class="text-muted text-sm">No activity yet.</p>';

  // Pre-fill current vendor notes
  document.getElementById('action-notes').value = '';
  document.getElementById('action-reference').value = inc.vendor_reference || '';
  document.getElementById('action-status').value = '';
  document.getElementById('vendor-success-alert').classList.add('hidden');
  proofImageFile = null;
  document.getElementById('proof-preview').innerHTML = '';
}

function handleProofImage(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { Common.toast('File exceeds 5MB.', 'error'); return; }

  proofImageFile = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('proof-preview').innerHTML = `
      <div class="image-preview-item" style="width:100px; height:100px">
        <img src="${e.target.result}" alt="Proof">
        <button class="image-preview-remove" onclick="removeProof()">✕</button>
      </div>`;
  };
  reader.readAsDataURL(file);
}

function removeProof() {
  proofImageFile = null;
  document.getElementById('proof-preview').innerHTML = '';
  document.getElementById('proof-image-file').value = '';
}

async function submitVendorUpdate() {
  if (!selectedIncident) return;

  const status     = document.getElementById('action-status').value;
  const notes      = document.getElementById('action-notes').value.trim();
  const reference  = document.getElementById('action-reference').value.trim();

  if (!status) { Common.toast('Please select a status.', 'error'); return; }
  if (!notes)  { Common.toast('Please add notes describing the action taken.', 'error'); return; }

  Common.setLoading('vendor-submit-btn', true);

  const session = Auth.getSession();
  let proofImageId = null;

  // Upload proof image if provided
  if (proofImageFile) {
    const fd = new FormData();
    fd.append('images', proofImageFile);
    fd.append('machine_id', selectedIncident.machine_id);
    fd.append('incident_id', selectedIncident.incident_id);
    fd.append('context', 'proof');
    const imgRes = await API.uploadImage(fd);
    if (imgRes.success) proofImageId = imgRes.data.file_ids?.[0];
  }

  const payload = {
    incident_id:      selectedIncident.incident_id,
    vendor_id:        session.vendor_id,
    updated_by:       session.user_id,
    new_status:       status,
    vendor_notes:     notes,
    vendor_reference: reference,
    proof_image_id:   proofImageId,
    updated_at:       new Date().toISOString(),
  };

  const res = await API.vendorUpdate(payload);
  Common.setLoading('vendor-submit-btn', false);

  if (res.success) {
    document.getElementById('vendor-success-alert').classList.remove('hidden');
    Common.toast('Update saved successfully.', 'success');
    await loadIncidents();
    // Reload the detail panel
    await selectIncident(selectedIncident.incident_id);
  } else {
    Common.toast(res.message || 'Update failed.', 'error');
  }
}
