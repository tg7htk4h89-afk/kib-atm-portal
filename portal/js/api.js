/**
 * ATM/ITM Operations Portal — API Layer
 * Centralized fetch wrapper. All calls inject session token.
 * Handles errors, retries, and response normalization.
 */

const API = (() => {

  const BASE = CONFIG.N8N_BASE_URL;

  function _headers(isMultipart) {
    const session = Auth.getSession();
    const h = { 'X-Portal-Token': session ? session.user_id : '' };
    if (!isMultipart) h['Content-Type'] = 'application/json';
    return h;
  }

  async function _fetch(method, path, body, isMultipart) {
    const url = BASE + path;
    const opts = {
      method,
      headers: _headers(isMultipart),
    };
    if (body) opts.body = isMultipart ? body : JSON.stringify(body);

    try {
      const res = await fetch(url, opts);
      if (res.status === 401) {
        Auth.clearSession();
        window.location.href = 'login.html?reason=unauthorized';
        return { success: false, message: 'Unauthorized' };
      }
      // Handle empty response body gracefully
      const text = await res.text();
      if (!text || text.trim() === '') {
        console.warn('[API] Empty response from', path);
        return { success: false, message: 'Empty response from server.' };
      }
      try {
        return JSON.parse(text);
      } catch (parseErr) {
        console.error('[API] JSON parse error', path, parseErr, 'body:', text.slice(0,200));
        return { success: false, message: 'Invalid response from server.' };
      }
    } catch (err) {
      console.error('[API Error]', method, path, err);
      return { success: false, message: 'Network error. Please check your connection.' };
    }
  }

  async function get(path, params) {
    let url = path;
    if (params) {
      const qs = new URLSearchParams(params).toString();
      url = path + '?' + qs;
    }
    return _fetch('GET', url, null, false);
  }

  async function post(path, body) {
    return _fetch('POST', path, body, false);
  }

  async function postMultipart(path, formData) {
    return _fetch('POST', path, formData, true);
  }

  // ─── Specific API Calls ───────────────────────────────────────────────────

  async function getMachines(branchId) {
    return get(CONFIG.ENDPOINTS.GET_MACHINES, branchId ? { branch_id: branchId } : {});
  }

  async function getChecklist(machineType) {
    return get(CONFIG.ENDPOINTS.GET_CHECKLIST, { machine_type: machineType });
  }

  async function submitChecklist(payload) {
    return post(CONFIG.ENDPOINTS.SUBMIT_CHECKLIST, payload);
  }

  async function getManagerDashboard(filters) {
    return get(CONFIG.ENDPOINTS.MANAGER_DASHBOARD, filters || {});
  }

  async function getIncidentDetails(incidentId) {
    return get(CONFIG.ENDPOINTS.INCIDENT_DETAILS, { id: incidentId });
  }

  async function vendorUpdate(payload) {
    return post(CONFIG.ENDPOINTS.VENDOR_UPDATE, payload);
  }

  async function managerReassign(payload) {
    return post(CONFIG.ENDPOINTS.MANAGER_REASSIGN, payload);
  }

  async function reopenIncident(payload) {
    return post(CONFIG.ENDPOINTS.REOPEN_INCIDENT, payload);
  }

  async function getReports(range, filters) {
    return get(CONFIG.ENDPOINTS.REPORTS, { range, ...(filters || {}) });
  }

  async function getMachineDetail(machineId) {
    return get(CONFIG.ENDPOINTS.MACHINE_DETAIL, { machine_id: machineId });
  }

  async function uploadImage(formData) {
    return postMultipart(CONFIG.ENDPOINTS.UPLOAD_IMAGE, formData);
  }

  return {
    get, post, postMultipart,
    getMachines, getChecklist, submitChecklist,
    getManagerDashboard, getIncidentDetails,
    vendorUpdate, managerReassign, reopenIncident,
    getReports, getMachineDetail, uploadImage
  };
})();
