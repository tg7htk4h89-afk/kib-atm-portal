/**
 * ATM/ITM Operations Portal — Login Page Logic
 */

// Show session notices on page load
document.addEventListener('DOMContentLoaded', () => {
  // Already logged in? Redirect.
  if (Auth.isLoggedIn()) {
    const session = Auth.getSession();
    window.location.href = CONFIG.ROLE_HOME[session.role] || 'manager.html';
    return;
  }

  // Check for URL reason param
  const params = new URLSearchParams(window.location.search);
  const reason = params.get('reason');
  const notice = document.getElementById('session-notice');

  if (reason === 'session_expired') {
    notice.textContent = 'Your session has expired. Please sign in again.';
    notice.classList.add('visible');
  } else if (reason === 'logout') {
    notice.textContent = 'You have been signed out successfully.';
    notice.classList.add('visible');
  } else if (reason === 'unauthorized') {
    notice.textContent = 'Access denied. Please sign in with appropriate credentials.';
    notice.classList.add('visible');
  }

  // Allow Enter key to submit
  document.getElementById('password').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleLogin();
  });
});

function fillCredentials(user, pass) {
  document.getElementById('username').value = user;
  document.getElementById('password').value = pass;
  document.getElementById('username').focus();
}

async function handleLogin() {
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const btn = document.getElementById('login-btn');
  const errorDiv = document.getElementById('error-msg');
  const errorText = document.getElementById('error-text');

  // Basic validation
  if (!username || !password) {
    showError('Please enter both username and password.');
    return;
  }

  // Loading state
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner-sm"></div> Signing in...';
  errorDiv.classList.remove('visible');

  try {
    const result = await Auth.login(username, password);

    if (result.success) {
      btn.innerHTML = '✓ Success';
      // Redirect to role-specific home
      setTimeout(() => {
        window.location.href = CONFIG.ROLE_HOME[result.role] || 'manager.html';
      }, 400);
    } else {
      showError(result.message || 'Invalid credentials. Please try again.');
      btn.disabled = false;
      btn.innerHTML = 'Sign in';
    }
  } catch (err) {
    showError('Connection error. Please check your network and try again.');
    btn.disabled = false;
    btn.innerHTML = 'Sign in';
  }
}

function showError(msg) {
  const errorDiv = document.getElementById('error-msg');
  const errorText = document.getElementById('error-text');
  errorText.textContent = msg;
  errorDiv.classList.add('visible');
  document.getElementById('username').classList.toggle('error', !document.getElementById('username').value.trim());
}
