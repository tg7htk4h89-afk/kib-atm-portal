/**
 * ATM/ITM Operations Portal — Auth Module
 */

const Auth = (() => {

  function setSession(userData) {
    const session = {
      user_id:     userData.user_id,
      username:    userData.username,
      full_name:   userData.full_name,
      role:        userData.role,
      branch_id:   userData.branch_id   || null,
      branch_name: userData.branch_name || null,
      vendor_id:   userData.vendor_id   || null,
      vendor_name: userData.vendor_name || null,
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
    } catch {
      return null;
    }
  }

  function clearSession() {
    sessionStorage.removeItem(CONFIG.SESSION_KEY);
  }

  function isLoggedIn() {
    return getSession() !== null;
  }

  // Role aliases — map any role variant to canonical group
  function _canonicalRole(role) {
    if (!role) return '';
    const map = {
      'manager':     'manager',
      'atm_manager': 'manager',
      'branch_user': 'branch_user',
      'vendor':      'vendor',
      'vendor_user': 'vendor',
    };
    return map[role] || role;
  }

  function requireAuth(allowedRoles) {
    const session = getSession();

    if (!session) {
      window.location.href = 'login.html?reason=session_expired';
      return false;
    }

    // Normalize the session role
    const canonical = _canonicalRole(session.role);

    // Normalize allowed roles too
    const normalizedAllowed = (allowedRoles || []).map(_canonicalRole);

    if (normalizedAllowed.length > 0 && !normalizedAllowed.includes(canonical)) {
      // Redirect to their correct home — but only if not already there
      const destMap = { manager: 'manager.html', branch_user: 'branch.html', vendor: 'vendor.html' };
      const dest = destMap[canonical] || 'login.html';
      const current = window.location.pathname.split('/').pop();
      if (current !== dest) {
        window.location.href = dest;
      }
      return false;
    }

    const displayEl = document.getElementById('current-user-display');
    if (displayEl) {
      const labels = { manager: 'Manager', branch_user: 'Branch', vendor: 'Vendor' };
      displayEl.textContent = session.full_name + ' (' + (labels[canonical] || canonical) + ')';
    }

    return true;
  }

  async function login(username, password) {
    const res = await API.post(CONFIG.ENDPOINTS.LOGIN, { username, password });
    if (res.success) {
      const userData = res.user || res.data || {};
      setSession(userData);
      return { success: true, role: userData.role };
    }
    return { success: false, message: res.error || res.message || 'Invalid credentials.' };
  }

  function logout() {
    clearSession();
    window.location.href = 'login.html?reason=logout';
  }

  return { setSession, getSession, clearSession, isLoggedIn, requireAuth, login, logout };
})();
