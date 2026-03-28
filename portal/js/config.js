/**
 * ATM/ITM Operations Portal — Configuration
 * All webhook endpoints and system constants live here.
 * In production, replace N8N_BASE_URL with your actual n8n instance URL.
 */

const CONFIG = {
  // ─── n8n Webhook Base URL ─────────────────────────────────────────────────
  N8N_BASE_URL: 'https://atmproject.app.n8n.cloud/webhook',

  // ─── API Endpoints (map to n8n webhook paths) ────────────────────────────
  ENDPOINTS: {
    LOGIN:              '/login',
    GET_MACHINES:       '/machines',
    GET_CHECKLIST:      '/checklist',
    SUBMIT_CHECKLIST:   '/submit-checklist',
    MANAGER_DASHBOARD:  '/manager-dashboard',
    INCIDENT_DETAILS:   '/incident-details',
    VENDOR_UPDATE:      '/vendor-update',
    MANAGER_REASSIGN:   '/manager-reassign',
    REOPEN_INCIDENT:    '/reopen-incident',
    REPORTS:            '/reports',
    UPLOAD_IMAGE:       '/upload-image',
    MACHINE_DETAIL:     '/machine-detail',
    ACTION_LOG:         '/action-log',
  },

  // ─── Session Config ───────────────────────────────────────────────────────
  SESSION_KEY: 'atm_portal_session',
  SESSION_TIMEOUT_MINUTES: 480, // 8 hours

  // ─── UI Constants ─────────────────────────────────────────────────────────
  TOAST_DURATION_MS: 4000,
  TABLE_PAGE_SIZE: 25,

  // ─── Status Colors ────────────────────────────────────────────────────────
  STATUS_CONFIG: {
    GREEN: { label: 'Healthy',     color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
    AMBER: { label: 'Issue',       color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
    RED:   { label: 'Critical',    color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
    GREY:  { label: 'Not Tested',  color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb' },
  },

  // ─── Incident Statuses ────────────────────────────────────────────────────
  INCIDENT_STATUSES: [
    'Draft', 'Open', 'Assigned', 'In Progress', 'Pending', 'Resolved', 'Closed', 'Reopened'
  ],

  // ─── Checklist Sections (matches Google Sheets Checklist_Master) ──────────
  CHECKLIST_SECTIONS: {
    OPERATIONAL: {
      label: 'Operational',
      icon: '⚙️',
      items: [
        { id: 'CK01', name: 'ATM Screens / Promotion updated', critical: false },
        { id: 'CK02', name: 'ATM Withdrawal Work',             critical: true  },
        { id: 'CK03', name: 'ATM Deposit Work',                critical: false },
        { id: 'CK04', name: 'Card Reader Work',                critical: true  },
        { id: 'CK05', name: 'Exit Shutter Work',               critical: true  },
        { id: 'CK06', name: 'Number pad',                      critical: true  },
        { id: 'CK07', name: 'Network Router',                  critical: true  },
      ]
    },
    PHYSICAL: {
      label: 'Physical',
      icon: '🔧',
      items: [
        { id: 'CK08', name: 'ATM Overall look and feel',       critical: false },
        { id: 'CK09', name: 'ATM Cables exposed',              critical: false },
        { id: 'CK10', name: 'ATM Surround (Casing)',           critical: false },
      ]
    },
    SECURITY: {
      label: 'Security',
      icon: '🔒',
      items: [
        { id: 'CK11', name: 'Skimmer Device',                  critical: true  },
        { id: 'CK12', name: 'PIN Capture (Camera)',             critical: true  },
        { id: 'CK13', name: 'No USB Device inside the ATM',    critical: true  },
      ]
    }
  },

  // ─── Role Route Map ───────────────────────────────────────────────────────
  ROLE_HOME: {
    branch_user: 'branch.html',
    manager:     'manager.html',
    vendor:      'vendor.html',
    atm_manager: 'manager.html',
    vendor_user:  'vendor.html',
  },

  // ─── Allowed Roles Per Page ───────────────────────────────────────────────
  PAGE_ROLES: {
    'branch.html':       ['branch_user', 'atm_manager'],
    'manager.html':      ['atm_manager'],
    'vendor.html':       ['vendor_user', 'atm_manager'],
    'reports.html':      ['atm_manager'],
    'machine-detail.html': ['atm_manager'],
  },
};

// Freeze to prevent accidental mutation
Object.freeze(CONFIG);
Object.freeze(CONFIG.ENDPOINTS);
Object.freeze(CONFIG.STATUS_CONFIG);
