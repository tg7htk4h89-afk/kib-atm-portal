/**
 * ATM/ITM Operations Portal — Common Utilities
 * Shared helpers used across all pages.
 */

const Common = (() => {

  // ─── Toast Notifications ──────────────────────────────────────────────────

  function toast(message, type = 'info') {
    // type: 'success' | 'error' | 'warning' | 'info'
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.innerHTML = `<span class="toast-icon">${_toastIcon(type)}</span><span>${message}</span>`;
    container.appendChild(t);
    setTimeout(() => t.classList.add('toast-visible'), 10);
    setTimeout(() => {
      t.classList.remove('toast-visible');
      setTimeout(() => t.remove(), 300);
    }, CONFIG.TOAST_DURATION_MS);
  }

  function _toastIcon(type) {
    return { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' }[type] || 'ℹ';
  }

  // ─── Status Badge ─────────────────────────────────────────────────────────

  function statusBadge(status) {
    const cfg = CONFIG.STATUS_CONFIG[status] || CONFIG.STATUS_CONFIG.GREY;
    return `<span class="status-badge" style="color:${cfg.color};background:${cfg.bg};border-color:${cfg.border}">${cfg.label}</span>`;
  }

  function incidentBadge(status) {
    const map = {
      'Draft':      { color:'#6b7280', bg:'#f9fafb' },
      'Open':       { color:'#dc2626', bg:'#fef2f2' },
      'Assigned':   { color:'#2563eb', bg:'#eff6ff' },
      'In Progress':{ color:'#d97706', bg:'#fffbeb' },
      'Pending':    { color:'#7c3aed', bg:'#f5f3ff' },
      'Resolved':   { color:'#16a34a', bg:'#f0fdf4' },
      'Closed':     { color:'#6b7280', bg:'#f3f4f6' },
      'Reopened':   { color:'#c2410c', bg:'#fff7ed' },
    };
    const cfg = map[status] || { color:'#6b7280', bg:'#f9fafb' };
    return `<span class="incident-badge" style="color:${cfg.color};background:${cfg.bg}">${status}</span>`;
  }

  function severityBadge(severity) {
    const map = {
      'Critical': { color:'#dc2626', bg:'#fef2f2' },
      'High':     { color:'#ea580c', bg:'#fff7ed' },
      'Medium':   { color:'#d97706', bg:'#fffbeb' },
      'Low':      { color:'#6b7280', bg:'#f9fafb' },
    };
    const cfg = map[severity] || map['Low'];
    return `<span class="severity-badge" style="color:${cfg.color};background:${cfg.bg}">${severity}</span>`;
  }

  // ─── Date/Time Formatting ─────────────────────────────────────────────────

  function fmtDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })
      + ' ' + d.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
  }

  function fmtDuration(minutes) {
    if (!minutes && minutes !== 0) return '—';
    if (minutes < 60) return `${minutes}m`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  function agingClass(minutes) {
    if (!minutes) return '';
    if (minutes > 480) return 'aging-critical';
    if (minutes > 120) return 'aging-warning';
    return 'aging-ok';
  }

  // ─── Loading State ────────────────────────────────────────────────────────

  function setLoading(elementId, isLoading, originalText) {
    const el = document.getElementById(elementId);
    if (!el) return;
    if (isLoading) {
      el.disabled = true;
      el.dataset.originalText = el.textContent;
      el.innerHTML = '<span class="spinner-sm"></span> Loading...';
    } else {
      el.disabled = false;
      el.textContent = originalText || el.dataset.originalText || 'Submit';
    }
  }

  function showSectionLoader(containerId) {
    const el = document.getElementById(containerId);
    if (el) el.innerHTML = '<div class="section-loader"><div class="spinner"></div><p>Loading data...</p></div>';
  }

  // ─── Modal ────────────────────────────────────────────────────────────────

  function openModal(id) {
    const m = document.getElementById(id);
    if (m) { m.classList.add('modal-open'); document.body.classList.add('modal-backdrop-active'); }
  }

  function closeModal(id) {
    const m = document.getElementById(id);
    if (m) { m.classList.remove('modal-open'); document.body.classList.remove('modal-backdrop-active'); }
  }

  // ─── Table Builder ────────────────────────────────────────────────────────

  function buildTable(columns, rows, options = {}) {
    if (!rows || rows.length === 0) {
      return '<div class="empty-state"><p>No records found.</p></div>';
    }
    const rowsHtml = rows.map(row => {
      const cells = columns.map(col => {
        let val = col.render ? col.render(row[col.key], row) : (row[col.key] ?? '—');
        return `<td class="${col.className || ''}">${val}</td>`;
      }).join('');
      const rowClass = options.rowClass ? options.rowClass(row) : '';
      return `<tr class="${rowClass}" ${options.onRowClick ? `data-id="${row[options.idKey || 'id']}" style="cursor:pointer"` : ''}>${cells}</tr>`;
    }).join('');

    const headersHtml = columns.map(col =>
      `<th class="${col.className || ''}">${col.label}</th>`
    ).join('');

    return `
      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr>${headersHtml}</tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>`;
  }

  // ─── KPI Card ─────────────────────────────────────────────────────────────

  function kpiCard(label, value, sub, colorClass, icon) {
    return `
      <div class="kpi-card ${colorClass || ''}">
        <div class="kpi-icon">${icon || ''}</div>
        <div class="kpi-body">
          <div class="kpi-value">${value}</div>
          <div class="kpi-label">${label}</div>
          ${sub ? `<div class="kpi-sub">${sub}</div>` : ''}
        </div>
      </div>`;
  }

  // ─── ID / Time ────────────────────────────────────────────────────────────

  function generateId(prefix) {
    return prefix + '-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 5).toUpperCase();
  }

  function nowISO() {
    return new Date().toISOString();
  }

  // ─── Form Helpers ─────────────────────────────────────────────────────────

  function getFormValues(formId) {
    const form = document.getElementById(formId);
    if (!form) return {};
    const data = {};
    new FormData(form).forEach((v, k) => { data[k] = v; });
    return data;
  }

  function setSelectOptions(selectId, options, placeholder) {
    const el = document.getElementById(selectId);
    if (!el) return;
    el.innerHTML = placeholder ? `<option value="">${placeholder}</option>` : '';
    options.forEach(opt => {
      const o = document.createElement('option');
      o.value = opt.value;
      o.textContent = opt.label;
      el.appendChild(o);
    });
  }

  // ─── Logout Binding ──────────────────────────────────────────────────────

  function bindLogout() {
    const btn = document.getElementById('logout-btn');
    if (btn) btn.addEventListener('click', () => Auth.logout());
  }

  function injectNavUser() {
    const session = Auth.getSession();
    if (!session) return;
    const el = document.getElementById('nav-user');
    if (el) {
      el.innerHTML = `<span class="nav-user-name">${session.full_name}</span>
        <span class="nav-user-role">${session.role.replace('_',' ').toUpperCase()}</span>`;
    }
  }

  return {
    toast, statusBadge, incidentBadge, severityBadge,
    fmtDateTime, fmtDate, fmtDuration, agingClass,
    setLoading, showSectionLoader,
    openModal, closeModal,
    buildTable, kpiCard,
    generateId, nowISO,
    getFormValues, setSelectOptions,
    bindLogout, injectNavUser
  };
})();
