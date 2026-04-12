/**
 * ATM/ITM Operations Portal — Branch Checklist Logic
 */

let selectedImages = [];
let selectedMachine = null;

document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.requireAuth(['branch_user', 'manager', 'atm_manager', 'area_manager', 'head_branches'])) return;
  Common.bindLogout();
  Common.injectNavUser();
  _updateClock();
  setInterval(_updateClock, 1000);

  const session = Auth.getSession();

  // ── Check view mode FIRST ──────────────────────────────────
  const urlParams = new URLSearchParams(window.location.search);
  const view = urlParams.get('view');

  // Update nav active state
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (view === 'history') {
    document.getElementById('nav-history')?.classList.add('active');
    document.getElementById('nav-checklist')?.classList.remove('active');
    await loadSubmissionHistory();
    return;
  }
  if (view === 'leave') {
    document.getElementById('nav-leave')?.classList.add('active');
    document.getElementById('nav-checklist')?.classList.remove('active');
    await loadLeaveSubmitPage();
    return;
  }
  document.getElementById('nav-checklist')?.classList.add('active');

  // ── Normal checklist view ──────────────────────────────────
  if (session.role === 'branch_user' && session.branch_id) {
    await loadBranches(session.branch_id);
  } else {
    await loadBranches(null);
  }

  // Set default inspection time
  const now = new Date();
  const timeEl = document.getElementById('inspection-time');
  if (timeEl) timeEl.value = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
  const nameEl = document.getElementById('inspector-name');
  if (nameEl) nameEl.value = session.full_name || '';

  // Drag-and-drop on upload zone
  const zone = document.getElementById('upload-zone');
  if (zone) {
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      handleImageSelect({ target: { files: e.dataTransfer.files } });
    });
  }
});

function _updateClock() {
  const el = document.getElementById('current-date-time');
  if (el) el.textContent = new Date().toLocaleString('en-GB', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}

async function loadBranches(preselect) {
  const res = await API.getMachines();
  const session = Auth.getSession();
  const branchSelect = document.getElementById('branch-select');

  if (!res.success) return;

  const branches = res.branches || res.data?.branches || [];
  const isBranchUser = session.role === 'branch_user';
  const assignedBranch = preselect || session.branch_id;

  if (isBranchUser && assignedBranch) {
    // Branch user — lock to their branch, no dropdown needed
    const userBranch = branches.find(b => b.branch_id === assignedBranch);
    const branchName = userBranch ? userBranch.branch_name : assignedBranch;

    // Replace dropdown with a locked label
    const branchGroup = branchSelect.closest('.form-group');
    if (branchGroup) {
      branchGroup.innerHTML = `
        <label class="form-label required">Branch</label>
        <div class="form-control" style="background:#f8fafc;color:var(--text-primary);font-weight:600;cursor:default">
          ${branchName}
        </div>
        <input type="hidden" id="branch-select" value="${assignedBranch}">
      `;
    } else {
      // Fallback: just set value
      Common.setSelectOptions('branch-select', [{value: assignedBranch, label: branchName}]);
      branchSelect.value = assignedBranch;
      branchSelect.disabled = true;
    }

    // Auto-load machines for their branch
    await onBranchChange(assignedBranch);

  } else {
    // Manager — show all branches dropdown
    Common.setSelectOptions('branch-select', branches.map(b => ({ value: b.branch_id, label: b.branch_name })), '— Select Branch —');
    if (assignedBranch) {
      branchSelect.value = assignedBranch;
      await onBranchChange(assignedBranch);
    }
  }
}

async function onBranchChange(forceBranchId) {
  const branchId = forceBranchId || document.getElementById('branch-select').value;
  const machineSelect = document.getElementById('machine-select');

  if (!branchId) {
    machineSelect.disabled = true;
    machineSelect.innerHTML = '<option value="">— Select Machine —</option>';
    return;
  }

  machineSelect.disabled = false;
  machineSelect.innerHTML = '<option value="">Loading...</option>';

  const res = await API.getMachines(branchId);
  if (res.success) {
    const machines = res.machines || res.data?.machines || [];
    Common.setSelectOptions('machine-select',
      machines.map(m => ({ value: m.machine_id, label: `${m.location_description || m.machine_type} (${m.terminal_id})` })),
      '— Select Machine —'
    );
    machineSelect.disabled = false;
  } else {
    machineSelect.innerHTML = '<option value="">— No machines found —</option>';
    machineSelect.disabled = true;
  }
}

async function onMachineChange() {
  const machineId = document.getElementById('machine-select').value;
  if (!machineId) {
    document.getElementById('machine-info-strip').classList.add('hidden');
    document.getElementById('checklist-form-wrap').classList.add('hidden');
    return;
  }

  // Get machine data from already-loaded machines (no extra API call needed)
  const branchId = document.getElementById('branch-select').value;
  const res = await API.getMachines(branchId);
  const machines = res.machines || res.data?.machines || [];
  const machine = machines.find(m => m.machine_id === machineId) || { machine_id: machineId };

  selectedMachine = machine;
  _populateMachineInfo(machine);
  _renderChecklist();
  document.getElementById('machine-info-strip').classList.remove('hidden');
  document.getElementById('checklist-form-wrap').classList.remove('hidden');
  document.getElementById('success-alert').classList.add('hidden');
}

function _populateMachineInfo(machine) {
  document.getElementById('info-terminal-id').textContent = machine.terminal_id || '—';
  document.getElementById('info-machine-type').textContent = machine.machine_type || '—';
  document.getElementById('info-location').textContent = machine.location_description || machine.branch_name || '—';
  document.getElementById('info-last-tested').textContent = machine.last_tested_at
    ? Common.fmtDateTime(machine.last_tested_at)
    : 'Never tested';
  document.getElementById('info-status').innerHTML = Common.statusBadge(machine.current_status || 'GREY');
}

function _renderChecklist() {
  const container = document.getElementById('checklist-sections');
  container.innerHTML = '';

  Object.entries(CONFIG.CHECKLIST_SECTIONS).forEach(([key, section]) => {
    const sectionEl = document.createElement('div');
    sectionEl.className = 'checklist-section mb-4';

    const headerClass = key.toLowerCase();
    sectionEl.innerHTML = `
      <div class="checklist-section-header ${headerClass}">
        ${section.icon} &nbsp; ${section.label} Checks
        <span style="margin-left:auto; font-size:10px; opacity:0.6">${section.items.length} items</span>
      </div>
      <div class="checklist-col-headers">
        <div>Check Item</div>
        <div>Result</div>
        <div>Notes</div>
      </div>
    `;

    section.items.forEach(item => {
      const itemEl = document.createElement('div');
      itemEl.className = 'checklist-item';
      itemEl.dataset.itemId = item.id;

      itemEl.innerHTML = `
        <div class="checklist-item-label">
          ${item.name}
          ${item.critical ? '<span class="critical-tag">Critical</span>' : ''}
        </div>
        <div class="radio-group">
          <label class="radio-option">
            <input type="radio" name="ck_${item.id}" value="PASS" onchange="onResultChange('${item.id}', 'PASS')">
            <span class="radio-label pass-label">✓ Pass</span>
          </label>
          <label class="radio-option">
            <input type="radio" name="ck_${item.id}" value="FAIL" onchange="onResultChange('${item.id}', 'FAIL')">
            <span class="radio-label fail-label">✕ Fail</span>
          </label>
          <label class="radio-option">
            <input type="radio" name="ck_${item.id}" value="NA" onchange="onResultChange('${item.id}', 'NA')">
            <span class="radio-label na-label">— N/A</span>
          </label>
        </div>
        <div>
          <input type="text" class="form-control" id="note_${item.id}"
            placeholder="Add note..."
            style="font-size:12px; padding:5px 10px;"
          />
        </div>
      `;

      sectionEl.appendChild(itemEl);
    });

    container.appendChild(sectionEl);
  });

  _updateSubmitSummary();
}

function onResultChange(itemId, result) {
  // If fail, highlight the row
  const row = document.querySelector(`.checklist-item[data-item-id="${itemId}"]`);
  if (result === 'FAIL') {
    row.style.background = '#fff8f8';
    const noteInput = document.getElementById(`note_${itemId}`);
    noteInput.placeholder = 'Note required for failed items...';
    noteInput.style.borderColor = 'var(--status-amber)';
  } else {
    row.style.background = '';
    const noteInput = document.getElementById(`note_${itemId}`);
    noteInput.placeholder = 'Add note...';
    noteInput.style.borderColor = '';
  }
  _updateSubmitSummary();
}

function _updateSubmitSummary() {
  const allItems = _getAllItems();
  const failCount = allItems.filter(i => i.result === 'FAIL').length;
  const criticalFails = allItems.filter(i => i.result === 'FAIL' && i.critical).length;

  const failDisplay = document.getElementById('fail-count-display');
  const critDisplay = document.getElementById('critical-fail-display');

  if (failCount > 0) {
    failDisplay.textContent = `${failCount} item(s) failing`;
    if (criticalFails > 0) {
      critDisplay.textContent = ` — ${criticalFails} CRITICAL`;
    } else {
      critDisplay.textContent = '';
    }
  } else {
    failDisplay.textContent = 'All items pending selection';
    critDisplay.textContent = '';
  }
}

function _getAllItems() {
  const results = [];
  Object.values(CONFIG.CHECKLIST_SECTIONS).forEach(section => {
    section.items.forEach(item => {
      const radios = document.querySelectorAll(`input[name="ck_${item.id}"]`);
      let result = null;
      radios.forEach(r => { if (r.checked) result = r.value; });
      results.push({
        item_id: item.id,
        item_name: item.name,
        result,
        critical: item.critical,
        note: (document.getElementById(`note_${item.id}`) || {}).value || ''
      });
    });
  });
  return results;
}

function handleImageSelect(event) {
  const files = Array.from(event.target.files);
  const valid = files.filter(f => {
    if (!f.type.startsWith('image/')) { Common.toast(`${f.name} is not an image.`, 'error'); return false; }
    if (f.size > 5 * 1024 * 1024) { Common.toast(`${f.name} exceeds 5MB limit.`, 'error'); return false; }
    return true;
  });

  selectedImages = [...selectedImages, ...valid].slice(0, 5);
  _renderImagePreviews();
}

function _renderImagePreviews() {
  const container = document.getElementById('image-previews');
  container.innerHTML = '';
  selectedImages.forEach((file, idx) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const item = document.createElement('div');
      item.className = 'image-preview-item';
      item.innerHTML = `
        <img src="${e.target.result}" alt="${file.name}">
        <button class="image-preview-remove" onclick="removeImage(${idx})">✕</button>
      `;
      container.appendChild(item);
    };
    reader.readAsDataURL(file);
  });
}

function removeImage(idx) {
  selectedImages.splice(idx, 1);
  _renderImagePreviews();
}

function validateChecklist() {
  const items = _getAllItems();

  // 1. All items must have a result
  const unselected = items.filter(i => !i.result);
  if (unselected.length > 0) {
    Common.toast(`Please select Pass / Fail / N/A for all ${unselected.length} item(s).`, 'error');
    return false;
  }

  // 2. Failed items must have a note
  const failWithoutNote = items.filter(i => i.result === 'FAIL' && !i.note.trim());
  if (failWithoutNote.length > 0) {
    Common.toast(`Please add notes for all ${failWithoutNote.length} failed item(s).`, 'error');
    failWithoutNote.forEach(i => {
      const el = document.getElementById(`note_${i.item_id}`);
      if (el) el.style.borderColor = 'var(--status-red)';
    });
    return false;
  }

  // 3. Inspection time required
  if (!document.getElementById('inspection-time').value) {
    Common.toast('Please set the inspection time.', 'error');
    return false;
  }

  return true;
}

async function submitChecklist() {
  if (!selectedMachine) return;
  if (!validateChecklist()) return;

  Common.setLoading('submit-btn', true);

  const session = Auth.getSession();
  const items = _getAllItems();

  // Normalize result values: PASS->Pass, FAIL->Fail, NA->N/A
  const resultMap = { 'PASS': 'Pass', 'FAIL': 'Fail', 'NA': 'N/A' };
  const normalizedItems = items.map(i => ({
    item_id:    i.item_id,
    item_name:  i.item_name,
    category:   i.category || '',
    result:     resultMap[i.result] || i.result || 'N/A',
    notes:      i.note || '',
    is_critical: i.critical ? 'TRUE' : 'FALSE'
  }));

  const payload = {
    machine_id:       selectedMachine.machine_id,
    terminal_id:      selectedMachine.terminal_id || '',
    branch_id:        document.getElementById('branch-select').value,
    branch_name:      selectedMachine.branch_name || '',
    machine_type:     selectedMachine.machine_type || 'ATM',
    submitted_by:     session.user_id,
    submitted_name:   document.getElementById('inspector-name').value,
    submitted_role:   session.role,
    inspection_time:  document.getElementById('inspection-time').value,
    general_comments: document.getElementById('general-comments').value,
    items:            normalizedItems,
    images:           [],
    submitted_at:     new Date().toISOString(),
  };

  const res = await API.submitChecklist(payload);
  Common.setLoading('submit-btn', false);

  if (res.success) {
    const status = res.machine_status || res.data?.machine_status || 'GREEN';
    const incidentId = res.incident_id || res.data?.incident_id || null;
    const retestMachine = selectedMachine; // save before clearing

    const alertEl = document.getElementById('success-alert');
    const detailEl = document.getElementById('success-detail');

    const isHealthy = status === 'GREEN';
    const hadPrevIncident = retestMachine?.active_incident_id;

    let detail = `Machine status: <strong style="color:${isHealthy ? 'var(--status-green)' : 'var(--status-red)'}">${status}</strong>.`;

    if (incidentId) {
      detail += ` Incident <strong>${incidentId}</strong> created and assigned to vendor.`;
    } else if (isHealthy && hadPrevIncident) {
      detail += ` ✅ Previous incident <strong>${hadPrevIncident}</strong> — machine confirmed healthy.`;
    }

    // Show Retest button if machine had active incident and now passes
    const retestBtn = isHealthy && hadPrevIncident
      ? `<button class="btn btn-secondary btn-sm" style="margin-left:12px"
           onclick="startRetest('${retestMachine.machine_id}', '${hadPrevIncident}')">
           🔄 Retest Again
         </button>`
      : '';

    detailEl.innerHTML = `
      <div>${detail}</div>
      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
        <a href="#" onclick="resetForm(); return false;"
           class="btn btn-primary btn-sm">📋 New Checklist</a>
        ${retestBtn}
        <a href="branch.html?view=history" class="btn btn-secondary btn-sm">🕐 View History</a>
      </div>
    `;

    alertEl.classList.remove('hidden');
    alertEl.style.background = isHealthy ? '#f0fdf4' : '#fef2f2';
    alertEl.style.borderColor = isHealthy ? '#86efac' : '#fca5a5';

    document.getElementById('checklist-form-wrap').classList.add('hidden');
    document.getElementById('machine-info-strip').classList.add('hidden');
    document.getElementById('machine-select').value = '';

    Common.toast(
      isHealthy ? '✅ Machine confirmed healthy!' : '⚠️ Checklist submitted — Incident created.',
      isHealthy ? 'success' : 'warning'
    );

    selectedImages = [];
    selectedMachine = null;
  } else {
    Common.toast(res.error || res.message || 'Submission failed. Please try again.', 'error');
  }
}

function resetForm() {
  document.getElementById('machine-select').value = '';
  document.getElementById('checklist-sections').innerHTML = '';
  document.getElementById('checklist-form-wrap').classList.add('hidden');
  document.getElementById('machine-info-strip').classList.add('hidden');
  document.getElementById('success-alert').classList.add('hidden');
  document.getElementById('general-comments').value = '';
  document.getElementById('image-previews').innerHTML = '';
  selectedImages = [];
  selectedMachine = null;
}


// ─── My Submissions History ───────────────────────────────────────────────────
async function loadSubmissionHistory() {
  const session = Auth.getSession();

  // Update page title and nav
  const pageHeader = document.querySelector('.page-header h1');
  if (pageHeader) pageHeader.textContent = 'My Submissions';

  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const histNav = document.querySelector('a[href="branch.html?view=history"]');
  if (histNav) histNav.classList.add('active');
  const checkNav = document.querySelector('a[href="branch.html"]');
  if (checkNav) checkNav.classList.remove('active');

  // Replace page body
  const body = document.querySelector('.page-body');
  if (!body) return;

  body.innerHTML = `
    <div class="card">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
        <div class="card-title">🕐 Today's Machine Status — ${session.full_name || ''}</div>
        <a href="branch.html" class="btn btn-secondary btn-sm">← Back to Checklist</a>
      </div>
      <div class="card-body" id="history-content">
        <div style="text-align:center;padding:40px;color:var(--text-muted)">
          <div class="spinner" style="margin:0 auto 12px"></div>
          <p>Loading machines...</p>
        </div>
      </div>
    </div>
  `;

  const container = document.getElementById('history-content');

  try {
    const branchId = session.branch_id;
    const res = await API.getMachines(branchId);

    if (!res.success) {
      container.innerHTML = '<div class="alert alert-error">Failed to load machine data.</div>';
      return;
    }

    const machines = res.machines || [];
    const testedCount = machines.filter(m => m.tested_today === 'TRUE' || m.tested_today === true).length;
    const redCount    = machines.filter(m => m.current_status === 'RED').length;
    const greenCount  = machines.filter(m => m.current_status === 'GREEN').length;

    const statusColor = { GREEN:'var(--status-green)', RED:'var(--status-red)', AMBER:'var(--status-amber)', GREY:'var(--status-grey)' };

    const rows = machines.map(m => {
      const sc = statusColor[m.current_status] || statusColor.GREY;
      const tested = m.tested_today === 'TRUE' || m.tested_today === true;
      const machineDataStr = encodeURIComponent(JSON.stringify({
        machine_id: m.machine_id, terminal_id: m.terminal_id,
        machine_type: m.machine_type, location_description: m.location_description,
        branch_name: m.branch_name, branch_id: m.branch_id,
        current_status: m.current_status, last_tested_at: m.last_tested_at,
        active_incident_id: m.active_incident_id || ''
      }));
      return `<tr>
        <td class="mono" style="font-weight:600">${m.terminal_id}</td>
        <td>${m.location_description || '—'}</td>
        <td><span style="font-weight:600">${m.machine_type}</span></td>
        <td><span style="font-weight:700;color:${sc}">${m.current_status || 'GREY'}</span></td>
        <td style="text-align:center">${tested
          ? '<span style="color:var(--status-green);font-weight:700">✓ Yes</span>'
          : '<span style="color:var(--status-grey)">— No</span>'}</td>
        <td>${m.last_tested_at ? Common.fmtDateTime(m.last_tested_at) : '—'}</td>
        <td>${m.active_incident_id
          ? `<span style="color:var(--status-red);font-weight:600">${m.active_incident_id}</span>`
          : '<span style="color:var(--status-grey)">—</span>'}</td>
        <td>
          <div style="display:flex;gap:6px;align-items:center">
            <button onclick="viewLastTest('${machineDataStr}')"
              style="padding:5px 8px;font-size:13px;border:1px solid var(--border-mid);
                     color:var(--text-secondary);background:#fff;border-radius:6px;cursor:pointer"
              title="View last checklist">
              👁
            </button>
            <button onclick="retestFromHistory('${machineDataStr}')"
              style="padding:5px 10px;font-size:11px;font-weight:600;border:1px solid var(--brand-accent);
                     color:var(--brand-accent);background:#fff;border-radius:6px;cursor:pointer;
                     white-space:nowrap"
              title="Retest this machine">
              🔄 Retest
            </button>
          </div>
        </td>
      </tr>`;
    }).join('');

    container.innerHTML = `
      <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap">
        <div style="flex:1;min-width:100px;background:var(--surface-2);border-radius:8px;padding:16px;text-align:center;border:1px solid var(--border)">
          <div style="font-size:28px;font-weight:700;color:var(--brand-accent)">${machines.length}</div>
          <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px">Total</div>
        </div>
        <div style="flex:1;min-width:100px;background:#f0fdf4;border-radius:8px;padding:16px;text-align:center;border:1px solid #86efac">
          <div style="font-size:28px;font-weight:700;color:var(--status-green)">${testedCount}</div>
          <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px">Tested Today</div>
        </div>
        <div style="flex:1;min-width:100px;background:#f9fafb;border-radius:8px;padding:16px;text-align:center;border:1px solid var(--border)">
          <div style="font-size:28px;font-weight:700;color:var(--status-grey)">${machines.length - testedCount}</div>
          <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px">Pending</div>
        </div>
        ${redCount > 0 ? `
        <div style="flex:1;min-width:100px;background:#fef2f2;border-radius:8px;padding:16px;text-align:center;border:1px solid #fca5a5">
          <div style="font-size:28px;font-weight:700;color:var(--status-red)">${redCount}</div>
          <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px">Critical</div>
        </div>` : ''}
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Terminal ID</th><th>Location</th><th>Type</th>
              <th>Status</th><th style="text-align:center">Tested Today</th>
              <th>Last Tested</th><th>Active Incident</th>
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--text-muted)">No machines found</td></tr>'}</tbody>
        </table>
      </div>
    `;
  } catch(e) {
    container.innerHTML = `<div class="alert alert-error">Error loading data: ${e.message}</div>`;
  }
}

// ─── Retest Machine ───────────────────────────────────────────────────────────
async function startRetest(machineId, incidentId) {
  // Reset form and pre-select the machine for retest
  resetForm();

  Common.toast('🔄 Loading machine for retest...', 'info');

  const session = Auth.getSession();
  const branchId = session.branch_id || document.getElementById('branch-select').value;

  // Load machines for branch
  const res = await API.getMachines(branchId);
  if (!res.success) {
    Common.toast('Failed to load machines.', 'error');
    return;
  }

  const machines = res.machines || [];
  const machine = machines.find(m => m.machine_id === machineId);

  if (!machine) {
    Common.toast('Machine not found.', 'error');
    return;
  }

  // Set machine select
  Common.setSelectOptions('machine-select',
    machines.map(m => ({ value: m.machine_id, label: `${m.location_description || m.machine_type} (${m.terminal_id})` })),
    '— Select Machine —'
  );

  const machineSelect = document.getElementById('machine-select');
  machineSelect.value = machineId;
  machineSelect.disabled = false;

  // Load checklist for this machine
  selectedMachine = machine;
  _populateMachineInfo(machine);
  _renderChecklist();

  // Add retest banner
  const retestBanner = document.createElement('div');
  retestBanner.id = 'retest-banner';
  retestBanner.style.cssText = 'background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:12px 16px;margin-bottom:16px;font-size:13px;display:flex;align-items:center;gap:8px';
  retestBanner.innerHTML = `
    <span style="font-size:18px">🔄</span>
    <div>
      <strong>Retest Mode</strong> — Confirming fix for incident <strong>${incidentId}</strong>
      on machine <strong>${machine.terminal_id}</strong>.
      Submit all Pass to confirm the machine is healthy.
    </div>
  `;
  const formWrap = document.getElementById('checklist-form-wrap');
  formWrap.insertBefore(retestBanner, formWrap.firstChild);

  document.getElementById('machine-info-strip').classList.remove('hidden');
  formWrap.classList.remove('hidden');

  // Set inspection time
  const now = new Date();
  const timeEl = document.getElementById('inspection-time');
  if (timeEl) timeEl.value = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');

  // Scroll to checklist
  formWrap.scrollIntoView({ behavior: 'smooth' });
  Common.toast('🔄 Retest mode — check all items and submit.', 'warning');
}

// ─── Retest from History Page ─────────────────────────────────────────────────
async function retestFromHistory(machineDataStr) {
  let machine;
  try {
    machine = JSON.parse(decodeURIComponent(machineDataStr));
  } catch(e) {
    Common.toast('Error loading machine data.', 'error');
    return;
  }

  // Navigate to checklist view
  window.history.pushState({}, '', 'branch.html');
  
  // Rebuild the checklist page structure
  const pageHeader = document.querySelector('.page-header h1');
  if (pageHeader) pageHeader.textContent = 'Daily Machine Checklist';

  const body = document.querySelector('.page-body');
  if (!body) return;

  // Restore original page structure
  body.innerHTML = `
    <div class="machine-selector-card" id="machine-selector">
      <h2>Select Machine to Inspect</h2>
      <div class="grid-2">
        <div class="form-group">
          <label class="form-label required">Branch</label>
          <div class="form-control" style="background:#f8fafc;color:var(--text-primary);font-weight:600;cursor:default">
            ${machine.branch_name || machine.branch_id}
          </div>
          <input type="hidden" id="branch-select" value="${machine.branch_id}">
        </div>
        <div class="form-group">
          <label class="form-label required">ATM / ITM Machine</label>
          <div class="form-control" style="background:#f8fafc;color:var(--text-primary);font-weight:600;cursor:default">
            ${machine.location_description || machine.machine_type} (${machine.terminal_id})
          </div>
          <input type="hidden" id="machine-select" value="${machine.machine_id}">
        </div>
      </div>
      <div id="machine-info-strip" class="machine-info-strip">
        <div class="machine-info-item">
          <span class="machine-info-label">Terminal ID</span>
          <span class="machine-info-value" id="info-terminal-id">${machine.terminal_id}</span>
        </div>
        <div class="machine-info-item">
          <span class="machine-info-label">Type</span>
          <span class="machine-info-value" id="info-machine-type">${machine.machine_type}</span>
        </div>
        <div class="machine-info-item">
          <span class="machine-info-label">Location</span>
          <span class="machine-info-value" id="info-location">${machine.location_description || '—'}</span>
        </div>
        <div class="machine-info-item">
          <span class="machine-info-label">Last Tested</span>
          <span class="machine-info-value" id="info-last-tested">${machine.last_tested_at ? Common.fmtDateTime(machine.last_tested_at) : 'Never'}</span>
        </div>
        <div class="machine-info-item">
          <span class="machine-info-label">Current Status</span>
          <span id="info-status">${Common.statusBadge ? Common.statusBadge(machine.current_status) : machine.current_status}</span>
        </div>
      </div>
    </div>

    <div class="alert alert-success hidden" id="success-alert">
      <strong>✓ Checklist submitted successfully.</strong>&nbsp;
      <span id="success-detail"></span>
    </div>

    <div id="checklist-form-wrap">
      ${machine.active_incident_id ? `
      <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:12px 16px;margin-bottom:16px;font-size:13px;display:flex;align-items:center;gap:8px">
        <span style="font-size:18px">🔄</span>
        <div>
          <strong>Retest Mode</strong> — Confirming fix for incident 
          <strong>${machine.active_incident_id}</strong> on 
          <strong>${machine.terminal_id}</strong>.
          Submit all Pass to confirm the machine is healthy.
        </div>
      </div>` : ''}

      <div class="card mb-5">
        <div class="card-body">
          <div class="grid-2">
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label required">Time of Inspection</label>
              <input type="time" class="form-control" id="inspection-time" />
            </div>
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">Inspector Name</label>
              <input type="text" class="form-control" id="inspector-name" placeholder="Your full name" />
            </div>
          </div>
        </div>
      </div>

      <div id="checklist-sections"></div>

      <div class="card mb-5">
        <div class="card-header"><div class="card-title">📎 Additional Information</div></div>
        <div class="card-body">
          <div class="form-group">
            <label class="form-label">General Comments</label>
            <textarea class="form-control" id="general-comments" rows="3" placeholder="Any additional observations or comments..."></textarea>
          </div>
        </div>
      </div>

      <div class="submit-panel">
        <div class="submit-summary">
          <span id="fail-count-display"></span>
          <span id="critical-fail-display" style="color:var(--status-red);font-weight:700;"></span>
        </div>
        <div class="flex gap-3">
          <button class="btn btn-secondary" onclick="window.location.href='branch.html?view=history'">← Back</button>
          <button class="btn btn-primary btn-lg" id="submit-btn" onclick="submitChecklist()">Submit Checklist</button>
        </div>
      </div>
    </div>
  `;

  // Set machine and render checklist
  selectedMachine = machine;
  _renderChecklist();

  // Set time and name
  const session = Auth.getSession();
  const now = new Date();
  const timeEl = document.getElementById('inspection-time');
  if (timeEl) timeEl.value = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
  const nameEl = document.getElementById('inspector-name');
  if (nameEl) nameEl.value = session.full_name || '';

  // Update nav
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const checkNav = document.querySelector('a[href="branch.html"]');
  if (checkNav) checkNav.classList.add('active');

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
  Common.toast(`🔄 Retest: ${machine.terminal_id}`, 'warning');
}

// ─── View Last Checklist ──────────────────────────────────────────────────────
function _ensureViewModal() {
  if (document.getElementById('view-test-modal')) return;
  const modal = document.createElement('div');
  modal.id = 'view-test-modal';
  modal.style.cssText = `
    display:none;position:fixed;inset:0;z-index:1000;
    background:rgba(0,0,0,0.5);align-items:center;justify-content:center;padding:16px
  `;
  modal.innerHTML = `
    <div style="background:#fff;border-radius:12px;width:100%;max-width:600px;
                max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3)">
      <div style="display:flex;justify-content:space-between;align-items:center;
                  padding:16px 20px;border-bottom:1px solid var(--border);position:sticky;top:0;background:#fff">
        <div>
          <div style="font-weight:700;font-size:15px" id="vtm-title">Last Checklist</div>
          <div style="font-size:12px;color:var(--text-muted)" id="vtm-subtitle"></div>
        </div>
        <button onclick="document.getElementById('view-test-modal').style.display='none'"
          style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text-muted)">✕</button>
      </div>
      <div id="vtm-body" style="padding:20px"></div>
    </div>
  `;
  modal.addEventListener('click', e => {
    if (e.target === modal) modal.style.display = 'none';
  });
  document.body.appendChild(modal);
}

async function viewLastTest(machineDataStr) {
  _ensureViewModal();
  let machine;
  try { machine = JSON.parse(decodeURIComponent(machineDataStr)); }
  catch(e) { Common.toast('Error loading machine data.', 'error'); return; }

  const modal = document.getElementById('view-test-modal');
  const body  = document.getElementById('vtm-body');
  const title = document.getElementById('vtm-title');
  const sub   = document.getElementById('vtm-subtitle');

  title.textContent = `Last Test — ${machine.terminal_id}`;
  sub.textContent   = machine.location_description || machine.machine_type;
  body.innerHTML    = '<div style="text-align:center;padding:32px;color:var(--text-muted)"><div class="spinner" style="margin:0 auto 12px"></div><p>Loading...</p></div>';
  modal.style.display = 'flex';

  try {
    // Status color
    const sc = {GREEN:'var(--status-green)',RED:'var(--status-red)',AMBER:'var(--status-amber)',GREY:'var(--status-grey)'}[machine.current_status] || 'var(--status-grey)';

    // Machine info card
    const infoHtml = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px;font-size:12px">
        <div style="background:var(--surface-2);border-radius:6px;padding:10px">
          <div style="color:var(--text-muted);margin-bottom:2px">Status</div>
          <div style="font-weight:700;color:${sc}">${machine.current_status || 'GREY'}</div>
        </div>
        <div style="background:var(--surface-2);border-radius:6px;padding:10px">
          <div style="color:var(--text-muted);margin-bottom:2px">Last Tested</div>
          <div style="font-weight:600">${machine.last_tested_at ? Common.fmtDateTime(machine.last_tested_at) : '—'}</div>
        </div>
        <div style="background:var(--surface-2);border-radius:6px;padding:10px">
          <div style="color:var(--text-muted);margin-bottom:2px">Type</div>
          <div style="font-weight:600">${machine.machine_type}</div>
        </div>
        <div style="background:var(--surface-2);border-radius:6px;padding:10px">
          <div style="color:var(--text-muted);margin-bottom:2px">Active Incident</div>
          <div style="font-weight:600;color:${machine.active_incident_id ? 'var(--status-red)' : 'var(--text-muted)'}">
            ${machine.active_incident_id || '— None'}
          </div>
        </div>
      </div>
    `;

    // Get checklist items - try multiple sources
    let checklistItems = [];
    if (machine.active_incident_id) {
      try {
        const incRes = await API.getIncidentDetails(machine.active_incident_id);
        if (incRes && incRes.success) {
          const inc = incRes.incident || incRes.data || incRes;
          checklistItems = inc.checklist_items || inc.checklist || [];
        }
      } catch(e) { checklistItems = []; }
    }
    let checklistHtml = '';

    if (checklistItems.length > 0) {
      const resultColors = {Pass:'var(--status-green)', Fail:'var(--status-red)', 'N/A':'var(--status-grey)'};
      const resultBg     = {Pass:'#f0fdf4', Fail:'#fef2f2', 'N/A':'#f9fafb'};
      const resultIcons  = {Pass:'✓', Fail:'✗', 'N/A':'—'};

      // Group by category
      const grouped = {};
      checklistItems.forEach(item => {
        const cat = item.category || 'General';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(item);
      });

      checklistHtml = Object.entries(grouped).map(([cat, items]) => `
        <div style="margin-bottom:16px">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;
                      color:var(--text-muted);margin-bottom:8px">${cat}</div>
          ${items.map(item => `
            <div style="display:flex;justify-content:space-between;align-items:flex-start;
                        padding:8px 10px;border-radius:6px;margin-bottom:4px;
                        background:${resultBg[item.result] || '#f9fafb'}">
              <div style="flex:1">
                <span style="font-size:12px;font-weight:500">${item.item_name}</span>
                ${item.is_critical === 'TRUE' || item.is_critical === true
                  ? '<span style="font-size:9px;background:#fef2f2;color:var(--status-red);padding:1px 5px;border-radius:3px;margin-left:6px;font-weight:700">CRITICAL</span>'
                  : ''}
                ${item.notes ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px">📝 ${item.notes}</div>` : ''}
              </div>
              <span style="font-weight:700;font-size:12px;color:${resultColors[item.result] || 'var(--text-muted)'};
                           min-width:32px;text-align:right">
                ${resultIcons[item.result] || item.result}
              </span>
            </div>
          `).join('')}
        </div>
      `).join('');
    } else {
      // No checklist data saved yet — show checklist template ready to fill
      const hasIncident = !!machine.active_incident_id;
      checklistHtml = `
        <div style="text-align:center;padding:16px 24px;background:${hasIncident ? '#fffbeb' : '#f9fafb'};
                    border-radius:8px;margin-bottom:16px;border:1px solid ${hasIncident ? '#fcd34d' : 'var(--border)'}">
          <div style="font-size:24px;margin-bottom:6px">${hasIncident ? '⚠️' : '📋'}</div>
          <div style="font-weight:600;font-size:13px">
            ${hasIncident
              ? 'Checklist data not available for this incident'
              : 'No submission yet today'}
          </div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px">
            ${hasIncident
              ? 'Submit a new retest to record checklist results'
              : 'Click Retest to submit checklist for this machine'}
          </div>
        </div>
        <div>
          ${Object.values(CONFIG.CHECKLIST_SECTIONS).map(section =>
            section.items.map(item => `
              <div style="display:flex;justify-content:space-between;padding:7px 10px;
                          border-radius:6px;background:#f9fafb;margin-bottom:4px;
                          border:1px solid var(--border)">
                <span style="font-size:12px;color:var(--text-secondary)">${item.name}
                  ${item.critical ? '<span style="font-size:9px;color:var(--status-red);font-weight:700;margin-left:4px">CRITICAL</span>' : ''}</span>
                <span style="font-size:11px;color:var(--text-muted);font-style:italic">— awaiting test</span>
              </div>`
            ).join('')
          ).join('')}
        </div>
      `;
    }

    body.innerHTML = infoHtml + `
      <div style="font-size:13px;font-weight:700;margin-bottom:10px;color:var(--text-primary)">
        📋 Checklist Items
      </div>
      ${checklistHtml}
      <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end">
        <button onclick="document.getElementById('view-test-modal').style.display='none'"
          class="btn btn-secondary btn-sm">Close</button>
        <button onclick="document.getElementById('view-test-modal').style.display='none'; retestFromHistory('${machineDataStr}')"
          style="padding:8px 16px;font-size:12px;font-weight:600;border:1px solid var(--brand-accent);
                 color:var(--brand-accent);background:#fff;border-radius:6px;cursor:pointer">
          🔄 Retest This Machine
        </button>
      </div>
    `;
  } catch(e) {
    body.innerHTML = `<div style="text-align:center;padding:32px;color:var(--text-muted)">
      <div style="font-size:32px">⚠️</div>
      <div>Could not load checklist details</div>
      <button onclick="document.getElementById('view-test-modal').style.display='none';retestFromHistory('${machineDataStr}')"
        style="margin-top:12px;padding:8px 16px;font-size:12px;font-weight:600;
               border:1px solid var(--brand-accent);color:var(--brand-accent);
               background:#fff;border-radius:6px;cursor:pointer">
        🔄 Retest Anyway
      </button>
    </div>`;
  }
}

// ─── LEAVE SUBMIT PAGE ────────────────────────────────────────────────────────
async function loadLeaveSubmitPage() {
  const session = Auth.getSession();
  const pageHeader = document.querySelector('.page-header h1');
  if (pageHeader) pageHeader.textContent = 'Submit Leave Request';

  const body = document.querySelector('.page-body');
  if (!body) return;

  const today = new Date().toISOString().slice(0,10);

  body.innerHTML = `
    <div style="max-width:640px">

      <!-- My Leave Balance Card -->
      <div class="card" style="margin-bottom:20px">
        <div class="card-header">
          <div class="card-title">📊 My Leave Status</div>
        </div>
        <div class="card-body" style="display:flex;gap:20px;flex-wrap:wrap">
          <div style="flex:1;min-width:100px;text-align:center;padding:12px;background:var(--status-green-bg);border-radius:8px;border:1px solid var(--status-green-bdr)">
            <div style="font-size:28px;font-weight:700;color:var(--status-green)" id="lv-balance-annual">—</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px">Annual Leave Days</div>
          </div>
          <div style="flex:1;min-width:100px;text-align:center;padding:12px;background:var(--status-amber-bg);border-radius:8px;border:1px solid var(--status-amber-bdr)">
            <div style="font-size:28px;font-weight:700;color:var(--status-amber)" id="lv-pending-count">—</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px">Pending Requests</div>
          </div>
          <div style="flex:1;min-width:100px;text-align:center;padding:12px;background:var(--off-white);border-radius:8px;border:1px solid var(--border)">
            <div style="font-size:28px;font-weight:700;color:var(--text)" id="lv-taken-count">—</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px">Days Taken (YTD)</div>
          </div>
        </div>
      </div>

      <!-- Leave Request Form -->
      <div class="card" style="margin-bottom:20px">
        <div class="card-header">
          <div class="card-title">📝 New Leave Request</div>
        </div>
        <div class="card-body">
          <div class="form-group">
            <label class="form-label required">Leave Type</label>
            <select class="form-control" id="lv-type" style="font-size:16px">
              <option value="Annual">Annual Leave</option>
              <option value="Medical">Medical Leave</option>
              <option value="Emergency">Emergency Leave</option>
              <option value="Unpaid">Unpaid Leave</option>
              <option value="Study">Study Leave</option>
            </select>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
            <div class="form-group">
              <label class="form-label required">From Date</label>
              <input type="date" class="form-control" id="lv-from" value="${today}" min="${today}" oninput="calcLeaveDays()" style="font-size:16px">
            </div>
            <div class="form-group">
              <label class="form-label required">To Date</label>
              <input type="date" class="form-control" id="lv-to" value="${today}" min="${today}" oninput="calcLeaveDays()" style="font-size:16px">
            </div>
          </div>

          <div id="lv-days-display" style="padding:10px 14px;background:var(--off-white);border-radius:6px;border:1px solid var(--border);font-size:13px;margin-bottom:16px;display:none">
            📅 Duration: <strong id="lv-days-num">0</strong> working day(s)
          </div>

          <div class="form-group">
            <label class="form-label">Reason / Notes</label>
            <textarea class="form-control" id="lv-notes" rows="3" placeholder="Optional — add any relevant details..." style="font-size:16px"></textarea>
          </div>

          <!-- HARD BLOCK: same position already on leave -->
          <div id="lv-block-alert" class="hidden" style="padding:14px 16px;background:#fef2f2;border:2px solid #dc2626;border-radius:8px;color:#dc2626;margin-bottom:16px">
          </div>

          <!-- SOFT WARNING: server-side warnings (balance, etc.) -->
          <div id="lv-conflict-alert" class="hidden" style="padding:10px 14px;background:var(--status-amber-bg);border:1px solid var(--status-amber-bdr);border-radius:6px;font-size:12px;color:var(--status-amber);margin-bottom:16px">
            ⚠️ <span id="lv-conflict-text"></span>
          </div>

          <div id="lv-success-alert" class="hidden" style="padding:12px 16px;background:var(--status-green-bg);border:1px solid var(--status-green-bdr);border-radius:6px;font-size:13px;color:var(--status-green);margin-bottom:16px">
            ✅ Leave request submitted successfully! Your manager will review and respond.
          </div>

          <div style="display:flex;gap:10px;justify-content:flex-end">
            <button class="btn btn-secondary" onclick="window.location.href='branch.html'">Cancel</button>
            <button class="btn btn-primary" id="lv-submit-btn" onclick="submitLeaveFromBranch()">Submit Leave Request</button>
          </div>
        </div>
      </div>

      <!-- My Leave History -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">📋 My Leave History</div>
        </div>
        <div class="card-body-tight">
          <div id="my-leave-history" style="padding:20px;text-align:center;color:var(--text-muted)">
            <div class="spinner" style="margin:0 auto 8px"></div>
            Loading leave history...
          </div>
        </div>
      </div>
    </div>
  `;

  // Load employee leave data
  loadMyLeaveData(session);
}

// ── Count working days between two YYYY-MM-DD strings (excl. Fri & Sat) ──────
// KIB weekend = Friday (5) + Saturday (6)
function countWorkingDays(fromStr, toStr) {
  if (!fromStr || !toStr) return 0;
  const start = new Date(fromStr);
  const end   = new Date(toStr);
  if (end < start) return 0;
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const dow = cur.getDay(); // 0=Sun … 5=Fri, 6=Sat
    if (dow !== 5 && dow !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return Math.max(count, 1); // at least 1
}

function calcLeaveDays() {
  const from = document.getElementById('lv-from')?.value;
  const to   = document.getElementById('lv-to')?.value;
  // Re-check position conflict whenever dates change
  if (from && to && new Date(to) >= new Date(from)) {
    checkPositionConflict(from, to);
  }
  if (!from || !to) return;
  const days = countWorkingDays(from, to);
  const disp = document.getElementById('lv-days-display');
  const num  = document.getElementById('lv-days-num');
  if (disp && num) { num.textContent = days; disp.style.display = 'block'; }
}

async function loadMyLeaveData(session) {
  document.getElementById('lv-balance-annual').textContent = '21';
  document.getElementById('lv-pending-count').textContent = '0';
  document.getElementById('lv-taken-count').textContent = '0';

  try {
    const res = await API.get(CONFIG.ENDPOINTS.WFM_DASHBOARD, {});
    if (res && res.success && res.pending_leaves) {
      const allLeaves = res.pending_leaves;

      // Store ALL leaves (full branch) for position conflict check
      _positionLeaves = allLeaves;

      const myLeaves = allLeaves.filter(l =>
        l.emp_id === session.user_id || l.employee_name === session.full_name
      );
      const approved = myLeaves.filter(l => l.status === 'Approved');
      const pending  = myLeaves.filter(l => l.status === 'Pending' || l.status === 'BM Approved');
      const daysTaken= approved.reduce((s,l)=>s+parseInt(l.days||1),0);

      document.getElementById('lv-pending-count').textContent = pending.length;
      document.getElementById('lv-taken-count').textContent   = daysTaken;

      // Re-run conflict check with fresh data
      const from = document.getElementById('lv-from')?.value;
      const to   = document.getElementById('lv-to')?.value;
      if (from && to) checkPositionConflict(from, to);

      renderMyLeaveHistory(myLeaves);
      return;
    }
  } catch(e) { console.error('loadMyLeaveData error:', e); }

  document.getElementById('my-leave-history').innerHTML =
    '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px">No leave records found</div>';
}

function renderMyLeaveHistory(leaves) {
  const el = document.getElementById('my-leave-history');
  if (!leaves || !leaves.length) {
    el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px">No leave records found</div>';
    return;
  }
  el.innerHTML = `<table class="data-table">
    <thead><tr><th>Type</th><th>From</th><th>To</th><th>Days</th><th>Status</th></tr></thead>
    <tbody>${leaves.map(l=>`<tr>
      <td style="font-size:12px">${l.leave_type||l.type}</td>
      <td class="mono" style="font-size:11px">${l.from_date||l.from}</td>
      <td class="mono" style="font-size:11px">${l.to_date||l.to}</td>
      <td style="font-weight:700">${l.days}d</td>
      <td><span style="padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;
        background:${l.status==='Approved'?'var(--status-green-bg)':l.status==='Rejected'?'var(--status-red-bg)':'var(--status-amber-bg)'};
        color:${l.status==='Approved'?'var(--status-green)':l.status==='Rejected'?'var(--status-red)':'var(--status-amber)'}">
        ${l.status}</span></td>
    </tr>`).join('')}</tbody>
  </table>`;
}

// ── Position conflict checker — called whenever dates change ──────────────────
// Rule: only ONE person per position per branch can be on leave at a time.
// If a colleague with the same position at the same branch already has
// an Approved or BM-Approved leave overlapping the requested dates,
// the submit button is disabled and a clear block message is shown.
let _positionLeaves = []; // populated by loadMyLeaveData

async function checkPositionConflict(from, to) {
  const session    = Auth.getSession();
  if (!session) return;

  const myPosition = (session.title || session.position || '').toString().trim();
  const myBranch   = (session.branch_id || '').toString().trim();
  const myEmpId    = (session.user_id || '').toString().trim();

  const blockEl   = document.getElementById('lv-block-alert');
  const submitBtn = document.getElementById('lv-submit-btn');
  if (!blockEl || !submitBtn) return;

  // If no position on session — cannot check, allow submission
  if (!myPosition || !myBranch) {
    blockEl.classList.add('hidden');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Leave Request';
    return;
  }

  // Check _positionLeaves (same position, same branch, not self, approved/BM-approved)
  const conflict = _positionLeaves.find(l => {
    if (l.emp_id === myEmpId) return false;                   // ignore own records
    if ((l.branch_id || l.branch) !== myBranch) return false; // different branch
    // Normalize position comparison
    const lPos = (l.position || '').toString().trim().toLowerCase();
    const mPos = myPosition.toLowerCase();
    if (lPos !== mPos) return false;
    // Only block on Approved or BM Approved leaves
    const s = (l.status || '').toString().trim();
    if (!['Approved', 'BM Approved'].includes(s)) return false;
    // Date overlap check: conflict if NOT (to < l.from_date OR from > l.to_date)
    const lFrom = l.from_date || l.from || '';
    const lTo   = l.to_date   || l.to   || '';
    if (!lFrom || !lTo) return false;
    return !(to < lFrom || from > lTo);
  });

  if (conflict) {
    const conflictName = conflict.employee_name || conflict.employee || 'A colleague';
    const lFrom = conflict.from_date || conflict.from;
    const lTo   = conflict.to_date   || conflict.to;
    blockEl.innerHTML = `
      <div style="font-size:14px;font-weight:700;margin-bottom:6px">🚫 Leave Blocked</div>
      <div style="font-size:13px">
        <strong>${conflictName}</strong> (${conflict.position || myPosition}) is already on
        <span style="font-weight:700">${conflict.status}</span> leave from
        <strong>${lFrom}</strong> to <strong>${lTo}</strong>.
      </div>
      <div style="font-size:12px;margin-top:6px;opacity:.85">
        Only one ${myPosition} per branch can be on leave at the same time.
        Please choose different dates or contact your Branch Manager.
      </div>`;
    blockEl.classList.remove('hidden');
    submitBtn.disabled = true;
    submitBtn.textContent = '🚫 Leave Blocked';
    submitBtn.style.background = 'var(--status-red)';
  } else {
    blockEl.classList.add('hidden');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Leave Request';
    submitBtn.style.background = '';
  }
}

async function submitLeaveFromBranch() {
  // ── Hard guard: prevent any double-submission ─────────────────────────────
  const btn = document.getElementById('lv-submit-btn');
  if (btn && btn.dataset.submitting === '1') return;
  if (btn) { btn.dataset.submitting = '1'; btn.disabled = true; btn.textContent = 'Submitting...'; }

  const session = Auth.getSession();
  const type  = document.getElementById('lv-type').value;
  const from  = document.getElementById('lv-from').value;
  const to    = document.getElementById('lv-to').value;
  const notes = document.getElementById('lv-notes').value.trim();

  if (!from || !to) {
    Common.toast('Select both dates', 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Submit Leave Request'; btn.dataset.submitting = ''; }
    return;
  }
  if (new Date(to) < new Date(from)) {
    Common.toast('To date must be after From date', 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Submit Leave Request'; btn.dataset.submitting = ''; }
    return;
  }

  try {
    const payload = {
      emp_id:        session.user_id   || '',
      employee_name: session.full_name || '',
      branch_id:     session.branch_id || '',
      branch_name:   session.branch_name || '',
      position:      session.title || '',
      leave_type:    type,
      from_date:     from,
      to_date:       to,
      days:          countWorkingDays(from, to),
      notes:         notes,
      submitted_by:  session.username  || '',
    };

    console.log('Submitting leave:', payload);

    const N8N_URL = CONFIG.N8N_BASE_URL + CONFIG.ENDPOINTS.WFM_LEAVE;
    const res = await fetch(N8N_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(async r => {
      const txt = await r.text();
      if (!txt || !txt.trim()) return null;
      const parsed = JSON.parse(txt);
      return Array.isArray(parsed) ? (parsed[0] || null) : parsed;
    }).catch(e => { console.error('Leave API error:', e); return null; });

    console.log('Leave response:', res);

    if (res && res.blocked) {
      // Server confirmed hard block — show block UI
      const blockEl = document.getElementById('lv-block-alert');
      if (blockEl) {
        const c = res.conflict || {};
        blockEl.innerHTML = `
          <div style="font-size:14px;font-weight:700;margin-bottom:6px">🚫 Leave Blocked by Server</div>
          <div style="font-size:13px">${res.error || 'Same position already on leave during this period.'}</div>`;
        blockEl.classList.remove('hidden');
      }
      Common.toast('🚫 Leave blocked — ' + (res.error || 'Same position conflict'), 'error');
      btn.disabled = true;
      btn.textContent = '🚫 Leave Blocked';
      btn.style.background = 'var(--status-red)';
    } else if (res && res.success) {
      document.getElementById('lv-success-alert').classList.remove('hidden');
      document.getElementById('lv-conflict-alert').classList.add('hidden');
      document.getElementById('lv-block-alert').classList.add('hidden');
      if (res.warnings && res.warnings.length) {
        document.getElementById('lv-conflict-text').textContent = res.warnings.join(' | ');
        document.getElementById('lv-conflict-alert').classList.remove('hidden');
      }
      btn.textContent = '✓ Submitted';
      btn.style.background = '';
      btn.dataset.submitting = '';
      Common.toast('Leave request submitted!', 'success');
    } else if (res === null) {
      document.getElementById('lv-success-alert').classList.remove('hidden');
      Common.toast('Leave recorded (offline mode)', 'warning');
      btn.textContent = '✓ Submitted';
    } else {
      Common.toast(res?.message || res?.error || 'Submission failed', 'error');
      btn.disabled = false;
      btn.textContent = 'Submit Leave Request';
      btn.style.background = '';
      btn.dataset.submitting = '';
    }
  } catch(e) {
    console.error('submitLeave error:', e);
    document.getElementById('lv-success-alert').classList.remove('hidden');
    Common.toast('Leave recorded (offline mode)', 'warning');
    btn.textContent = '✓ Submitted';
  }
}
