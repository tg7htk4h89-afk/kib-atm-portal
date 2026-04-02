/**
 * KIB RBD Operations Portal — Auth Module
 */

const Auth = (() => {

  function setSession(userData) {
    const session = {
      user_id:     userData.user_id,
      username:    userData.username,
      full_name:   userData.full_name,
      role:        _canonicalRole(userData.role),
      raw_role:    userData.role,
      branch_id:   userData.branch_id   || null,
      branch_name: userData.branch_name || null,
      area:        userData.area        || null,
      vendor_id:   userData.vendor_id   || null,
      login_at:    new Date().toISOString(),
      expires_at:  new Date(Date.now() + CONFIG.SESSION_TIMEOUT_MINUTES * 60000).toISOString(),
    };
    sessionStorage.setItem(CONFIG.SESSION_KEY, JSON.stringify(session));
    return session;
  }

  function getSession() {
    try {
      const raw = sessionStorage.getItem(CONFIG.SESSION_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw);
      if (new Date(session.expires_at) < new Date()) {
        clearSession();
        return null;
      }
      return session;
    } catch { return null; }
  }

  function clearSession() {
    sessionStorage.removeItem(CONFIG.SESSION_KEY);
  }

  function isLoggedIn() {
    return getSession() !== null;
  }

  // ─── Role Normalisation ───────────────────────────────────────────────────
  // Maps any role variant to canonical role name
  function _canonicalRole(role) {
    const map = {
      'manager':      'manager',
      'atm_manager':  'manager',       // ATM manager = manager
      'branch_user':  'branch_user',
      'area_manager': 'area_manager',
      'head_branches':'head_branches',
      'vendor':       'vendor',
      'vendor_user':  'vendor',
    };
    return map[role] || role;
  }

  // Role display labels
  function _roleLabel(role) {
    const labels = {
      manager:       'ATM Manager',
      branch_user:   'Branch Staff',
      area_manager:  'Area Manager',
      head_branches: 'Head of Branches',
      vendor:        'Vendor',
    };
    return labels[role] || role;
  }

  // ─── Page Protection ──────────────────────────────────────────────────────
  function requireAuth(allowedRoles) {
    const session = getSession();
    if (!session) {
      window.location.href = 'login.html?reason=session_expired';
      return false;
    }

    const canonical = _canonicalRole(session.role);
    const normalizedAllowed = (allowedRoles || []).map(_canonicalRole);

    if (normalizedAllowed.length > 0 && !normalizedAllowed.includes(canonical)) {
      const dest = CONFIG.ROLE_HOME[canonical] || 'login.html';
      const current = window.location.pathname.split('/').pop();
      if (current !== dest) window.location.href = dest;
      return false;
    }

    // Inject user display
    const el = document.getElementById('current-user-display');
    if (el) el.textContent = session.full_name + ' (' + _roleLabel(canonical) + ')';

    return true;
  }

  // ─── Login ────────────────────────────────────────────────────────────────
  async function login(username, password) {
    const res = await API.post(CONFIG.ENDPOINTS.LOGIN, { username, password });
    if (res.success) {
      const userData = res.user || res.data || {};
      setSession(userData);
      const canonical = _canonicalRole(userData.role);
      return { success: true, role: canonical };
    }
    return { success: false, message: res.error || res.message || 'Invalid credentials.' };
  }

  function logout() {
    clearSession();
    window.location.href = 'login.html?reason=logout';
  }

  return { setSession, getSession, clearSession, isLoggedIn, requireAuth, login, logout };
})();
