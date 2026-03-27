/**
 * ATM/ITM Operations Portal — Auth Module
 * Handles session creation, validation, role-based page protection, and logout.
 */

const Auth = (() => {

  // ─── Session Read/Write ───────────────────────────────────────────────────

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
      // Check expiry
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

  // ─── Role Protection ──────────────────────────────────────────────────────

  function requireAuth(allowedRoles) {
    const session = getSession();
    const page = window.location.pathname.split('/').pop();

    if (!session) {
      window.location.href = 'login.html?reason=session_expired';
      return false;
    }

    const roles = allowedRoles || CONFIG.PAGE_ROLES[page] || [];
    if (roles.length > 0 && !roles.includes(session.role)) {
      window.location.href = CONFIG.ROLE_HOME[session.role] || 'login.html';
      return false;
    }

    // Inject user info into any .user-display element
    const displayEl = document.getElementById('current-user-display');
    if (displayEl) {
      displayEl.textContent = session.full_name + ' (' + _roleLabel(session.role) + ')';
    }

    return true;
  }

  function _roleLabel(role) {
    return { branch_user: 'Branch', atm_manager: 'Manager', vendor_user: 'Vendor' }[role] || role;
  }

  // ─── Login / Logout ───────────────────────────────────────────────────────

  async function login(username, password) {
    const res = await API.post(CONFIG.ENDPOINTS.LOGIN, { username, password });
    if (res.success) {
      setSession(res.data);
      return { success: true, role: res.data.role };
    }
    return { success: false, message: res.message || 'Invalid credentials.' };
  }

  function logout() {
    clearSession();
    window.location.href = 'login.html?reason=logout';
  }

  // Public
  return { setSession, getSession, clearSession, isLoggedIn, requireAuth, login, logout };
})();
