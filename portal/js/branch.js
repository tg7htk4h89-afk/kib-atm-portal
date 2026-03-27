/**
 * ATM/ITM Operations Portal — Branch Checklist Logic
 */

let selectedImages = [];
let selectedMachine = null;

document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.requireAuth(['branch_user', 'atm_manager'])) return;
  Common.bindLogout();
  Common.injectNavUser();
  _updateClock();
  setInterval(_updateClock, 1000);

  const session = Auth.getSession();

  // Pre-populate branch for branch users
  if (session.role === 'branch_user' && session.branch_id) {
    await loadBranches(session.branch_id);
  } else {
    await loadBranches(null);
  }

  // Set default inspection time
  const now = new Date();
  document.getElementById('inspection-time').value =
    now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
  document.getElementById('inspector-name').value = session.full_name || '';

  // Drag-and-drop on upload zone
  const zone = document.getElementById('upload-zone');
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    handleImageSelect({ target: { files: e.dataTransfer.files } });
  });
});

function _updateClock() {
  const el = document.getElementById('current-date-time');
  if (el) el.textContent = new Date().toLocaleString('en-GB', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}

async function loadBranches(preselect) {
  const res = await API.getMachines(); // Get all branches list from machines response
  const session = Auth.getSession();
  const branchSelect = document.getElementById('branch-select');

  if (res.success) {
    const branches = res.data.branches || [];
    Common.setSelectOptions('branch-select', branches.map(b => ({ value: b.branch_id, label: b.branch_name })), '— Select Branch —');

    if (preselect || (session.role === 'branch_user' && session.branch_id)) {
      branchSelect.value = preselect || session.branch_id;
      await onBranchChange();
    }
  }
}

async function onBranchChange() {
  const branchId = document.getElementById('branch-select').value;
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
    const machines = res.data.machines || [];
    Common.setSelectOptions('machine-select',
      machines.map(m => ({ value: m.machine_id, label: `${m.machine_name} (${m.terminal_id})` })),
      '— Select Machine —'
    );
  }
}

async function onMachineChange() {
  const machineId = document.getElementById('machine-select').value;
  if (!machineId) {
    document.getElementById('machine-info-strip').classList.add('hidden');
    document.getElementById('checklist-form-wrap').classList.add('hidden');
    return;
  }

  // Fetch machine detail
  const res = await API.getMachineDetail(machineId);
  if (res.success) {
    selectedMachine = res.data;
    _populateMachineInfo(res.data);
    _renderChecklist();
    document.getElementById('machine-info-strip').classList.remove('hidden');
    document.getElementById('checklist-form-wrap').classList.remove('hidden');
    document.getElementById('success-alert').classList.add('hidden');
  }
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

  const payload = {
    machine_id:       selectedMachine.machine_id,
    terminal_id:      selectedMachine.terminal_id,
    branch_id:        document.getElementById('branch-select').value,
    machine_type:     selectedMachine.machine_type,
    submitted_by:     session.user_id,
    submitted_name:   document.getElementById('inspector-name').value,
    submitted_role:   session.role,
    inspection_time:  document.getElementById('inspection-time').value,
    general_comments: document.getElementById('general-comments').value,
    items:            items,
    has_images:       selectedImages.length > 0,
    submitted_at:     new Date().toISOString(),
  };

  // If there are images, upload them via FormData
  let imageUploadIds = [];
  if (selectedImages.length > 0) {
    const fd = new FormData();
    selectedImages.forEach(f => fd.append('images', f));
    fd.append('machine_id', selectedMachine.machine_id);
    fd.append('context', 'checklist');
    const imgRes = await API.uploadImage(fd);
    if (imgRes.success) {
      imageUploadIds = imgRes.data.file_ids || [];
    } else {
      Common.toast('Image upload failed. Submitting without images.', 'warning');
    }
  }

  payload.image_ids = imageUploadIds;

  const res = await API.submitChecklist(payload);
  Common.setLoading('submit-btn', false);

  if (res.success) {
    const status = res.data.machine_status;
    const incidentId = res.data.incident_id;

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
    Common.toast(res.message || 'Submission failed. Please try again.', 'error');
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
