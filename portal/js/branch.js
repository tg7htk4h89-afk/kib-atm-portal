/**
 * ATM/ITM Operations Portal — Branch Checklist Logic
 */

let selectedImages = [];
let selectedMachine = null;

document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.requireAuth(['branch_user', 'atm_manager', 'manager'])) return;
  Common.bindLogout();
  Common.injectNavUser();
  _updateClock();
  setInterval(_updateClock, 1000);

  const session = Auth.getSession();

  // ── Check view mode FIRST ──────────────────────────────────
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('view') === 'history') {
    await loadSubmissionHistory();
    return;
  }

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

    const alertEl = document.getElementById('success-alert');
    const detailEl = document.getElementById('success-detail');

    let detail = `Machine status: <strong>${status}</strong>.`;
    if (incidentId) {
      detail += ` Incident <strong>${incidentId}</strong> has been created and assigned.`;
    }
    detailEl.innerHTML = detail;
    alertEl.classList.remove('hidden');

    document.getElementById('checklist-form-wrap').classList.add('hidden');
    document.getElementById('machine-info-strip').classList.add('hidden');
    document.getElementById('machine-select').value = '';

    Common.toast(
      status === 'RED' || status === 'AMBER'
        ? 'Checklist submitted — Incident created.'
        : 'Checklist submitted — Machine is healthy.',
      status === 'GREEN' ? 'success' : 'warning'
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
