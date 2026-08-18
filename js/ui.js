/* ============================================================
   ui.js — shared UI primitives: toasts, modals, datatables,
   badges, formatters, skeletons. No framework.
   ============================================================ */
const UI = (() => {

  /* ---------- safety / formatting ---------- */
  function escapeHtml(value) {
    if (value === null || value === undefined) return "";
    return String(value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d)) return String(iso);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  function fmtDateTime(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d)) return String(iso);
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function fmtTime(t) {
    if (!t) return "—";
    // accept "14:30" or "14:30:00"
    const parts = String(t).split(":").map(Number);
    if (parts.length < 2 || parts.some(isNaN)) return String(t);
    const d = new Date(); d.setHours(parts[0], parts[1] || 0, parts[2] || 0, 0);
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }

  function timeAgo(iso) {
    if (!iso) return "—";
    const d = new Date(iso); if (isNaN(d)) return "";
    const s = Math.floor((Date.now() - d.getTime()) / 1000);
    if (s < 60) return "just now";
    const m = Math.floor(s / 60); if (m < 60) return m + "m ago";
    const h = Math.floor(m / 60); if (h < 24) return h + "h ago";
    const days = Math.floor(h / 24); if (days < 7) return days + "d ago";
    return fmtDate(iso);
  }

  function cap(s) { return s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : "—"; }

  function initials(name) {
    if (!name) return "?";
    return name.split(/\s+/).slice(0, 2).map(w => w[0] || "").join("").toUpperCase();
  }

  function debounce(fn, ms = 300) {
    let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  /* ---------- shared icon set (lucide-style, 2px stroke) ---------- */
  const ICONS = {
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/>',
    eye: '<path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0"/><circle cx="12" cy="12" r="3"/>',
    arrowUpRight: '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
    arrowLeft: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    arrowRight: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
    key: '<path d="m21 2-2 2"/><path d="m15.5 7.5 3 3L22 7l-3-3"/><path d="m12.39 12.61-4.77 4.77a5.5 5.5 0 1 1-7.78-7.78l4.78-4.77A5.5 5.5 0 0 1 12.39 12.6z"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
    shieldOff: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m2 2 20 20"/>',
    shieldCheck: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
    archive: '<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
    archiveRestore: '<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M12 17v-4"/><path d="m9 16 3-3 3 3"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>',
    alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
    eyeOff: '<path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><path d="m2 2 20 20"/><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/>',
    wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
    power: '<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.77.04"/>',
  };
  function icon(name, cls = "icn") {
    return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ""}</svg>`;
  }

  /* ---------- count-up for stat numbers (respects reduced motion) ---------- */
  function countUp(el, { duration = 700 } = {}) {
    if (!el) return;
    const raw = (el.textContent || "").trim();
    const n = Number(raw.replace(/[^\d.-]/g, ""));
    if (raw === "" || isNaN(n)) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const start = performance.now();
    const dot = raw.includes(".") || raw.includes(",");
    const dec = dot ? Math.min(2, (raw.split(/[.,]/)[1] || "").length) : 0;
    const fmt = (v) => v.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });
    function tick(now) {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(n * eased);
      if (p < 1) requestAnimationFrame(tick);
      else el.textContent = raw;
    }
    requestAnimationFrame(tick);
  }

  /* ---------- toast ---------- */
  const TOAST_SVG = {
    success: '<svg class="icn" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
    error: '<svg class="icn" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
    warning: '<svg class="icn" viewBox="0 0 24 24" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
    info: '<svg class="icn" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
  };
  function toast(message, type = "info") {
    const root = document.getElementById("toast-root");
    if (!root) return;
    const el = document.createElement("div");
    el.className = "toast " + type;
    el.setAttribute("role", "status");
    el.innerHTML = `<span class="toast-ic">${TOAST_SVG[type] || TOAST_SVG.info}</span><span class="toast-msg">${escapeHtml(message)}</span>`;
    root.appendChild(el);
    setTimeout(() => { el.classList.add("leaving"); }, 3200);
    setTimeout(() => el.remove(), 3380);
  }

  /* ---------- avatar ---------- */
  function avatar(name, url, size) {
    const cls = size === "lg" ? "avatar lg" : "avatar";
    if (url) return `<span class="${cls}" style="background:none;border:1px solid var(--border)"><img src="${escapeHtml(url)}" alt="" loading="lazy" onerror="this.style.display='none'"/></span>`;
    return `<span class="${cls}">${escapeHtml(initials(name))}</span>`;
  }

  /* ---------- badge ---------- */
  const BADGE_KINDS = {
    success: ["present", "approved", "active", "graded", "passed", "open"],
    danger: ["absent", "rejected", "blocked", "archived", "overdue", "failed"],
    warning: ["pending", "ungraded", "missing", "inactive", "closed", "flagged"],
    info: ["material", "submitted", "quiz", "task", "exam", "laboratory", "lecture"],
    dark: ["super_admin", "admin"],
    primary: [],
  };
  function badgeKind(value) {
    const v = String(value || "").toLowerCase();
    for (const [kind, list] of Object.entries(BADGE_KINDS)) {
      if (list.includes(v)) return kind;
    }
    return "neutral";
  }
  function badge(text, type) {
    const kind = type || badgeKind(text);
    return `<span class="badge ${kind}">${escapeHtml(text)}</span>`;
  }

  /* ---------- modal ---------- */
  function modal({ title, subtitle, body, footer, size = "", onClose }) {
    const root = document.getElementById("modal-root");
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      const modalEl = overlay.querySelector(".modal");
      modalEl.classList.add("leaving");
      setTimeout(() => { overlay.remove(); if (onClose) onClose(); }, 140);
    };

    const inner = `<div class="modal ${size}" role="dialog" aria-modal="true">
      <div class="modal-head">
        <div><h2>${escapeHtml(title || "")}</h2>${subtitle ? `<div class="sub">${subtitle}</div>` : ""}</div>
        <button class="icon-btn close" aria-label="Close">&times;</button>
      </div>
      <div class="modal-body"></div>
      ${footer ? `<div class="modal-foot"></div>` : ""}
    </div>`;
    overlay.innerHTML = inner;
    root.appendChild(overlay);

    const modalEl = overlay.querySelector(".modal");
    const bodyEl = overlay.querySelector(".modal-body");
    const footEl = overlay.querySelector(".modal-foot");
    if (body) bodyEl.innerHTML = body;
    if (footer) footEl.innerHTML = footer;

    overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) close(); });
    overlay.querySelector(".close").addEventListener("click", close);
    overlay.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
    return { el: modalEl, body: bodyEl, foot: footEl, close };
  }

  function closeModals() {
    const root = document.getElementById("modal-root");
    if (root) root.innerHTML = "";
  }

  /* ---------- confirm dialog ---------- */
  function confirm({ title = "Are you sure?", message = "", danger = true, okText = "Confirm", cancelText = "Cancel", body = "" }) {
    return new Promise((resolve) => {
      const footer = `
        <button class="btn secondary cancel">${escapeHtml(cancelText)}</button>
        <button class="btn ${danger ? "danger" : ""} ok">${escapeHtml(okText)}</button>`;
      const m = modal({
        title, size: "sm",
        body: `<div class="confirm-body">${message ? `<div class="warn-box">${message}</div>` : ""}${body || ""}</div>`,
        footer,
      });
      m.foot.querySelector(".cancel").addEventListener("click", () => { m.close(); resolve(false); });
      m.foot.querySelector(".ok").addEventListener("click", () => { m.close(); resolve(true); });
    });
  }

  /* ---------- loading / skeleton / empty ---------- */
  function loading(message = "Loading\u2026") {
    return `<div class="loading-bar"><span class="spin"></span><span>${escapeHtml(message)}</span></div>`;
  }

  function skeleton({ rows = 6, cols = 5, height = 14 } = {}) {
    let html = "";
    for (let i = 0; i < rows; i++) {
      html += `<div class="skeleton-row">`;
      for (let c = 0; c < cols; c++) html += `<div class="skeleton" style="height:${height}px"></div>`;
      html += `</div>`;
    }
    return html;
  }

  const EMPTY_ICONS = {
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    classes: '<path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/>',
    award: '<circle cx="12" cy="8" r="6"/><path d="M15.48 12.89 17 22l-5-3-5 3 1.52-9.11"/>',
    list: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/><path d="m9 16 2 2 4-4"/>',
    megaphone: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
    message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
    scroll: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
    alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
  };
  function empty(message = "Nothing here yet.", icon = "inbox", title = "") {
    const body = title ? `<h3>${escapeHtml(title)}</h3>` : "";
    return `<div class="empty-state"><span class="empty-ic"><svg class="icn lg" viewBox="0 0 24 24" aria-hidden="true">${EMPTY_ICONS[icon] || EMPTY_ICONS.inbox}</svg></span>${body}<p>${escapeHtml(message)}</p></div>`;
  }

  /* ---------- select ---------- */
  function select(options, { value = "", placeholder = "All", onChange = null, labelKey = null } = {}) {
    const el = document.createElement("select");
    const ph = placeholder !== null ? `<option value="">${escapeHtml(placeholder)}</option>` : "";
    el.innerHTML = ph + options.map(o => {
      const val = typeof o === "object" ? o.value : o;
      const label = typeof o === "object" ? (labelKey ? o[labelKey] : o.label) : o;
      return `<option value="${escapeHtml(val)}" ${String(val) === String(value) ? "selected" : ""}>${escapeHtml(label)}</option>`;
    }).join("");
    if (onChange) el.addEventListener("change", () => onChange(el.value));
    return el;
  }

  /* ---------- datatable ----------
     columns: [{ label, sortable, sortBy }]
     loader(state) => Promise<{ rows, total }>
     renderRow(row) => HTML string (escaped by caller)
     opts.toolbarFilters(el) => render filter selects into el
     returns { reload, setFilter, element } */
  function datatable({ columns, loader, renderRow, pageSize = CONFIG.PAGE_SIZE,
    emptyText = "No records found.", emptyIcon = "inbox", emptyTitle = "", toolbarFilters = null, defaultSortBy = "", defaultSortDir = "desc" }) {

    const wrap = document.createElement("div");
    wrap.className = "card table-card";

    let state = { page: 1, pageSize, search: "", filters: {}, sortBy: defaultSortBy, sortDir: defaultSortDir, total: 0 };
    const searchInputEl = document.createElement("input");
    searchInputEl.type = "search";
    searchInputEl.placeholder = "Search\u2026";

    /* toolbar */
    const toolbar = document.createElement("div");
    toolbar.className = "toolbar";
    const searchBox = document.createElement("div");
    searchBox.className = "search-box";
    searchBox.appendChild(searchInputEl);
    toolbar.appendChild(searchBox);
    const filterSlot = document.createElement("div");
    filterSlot.style.display = "contents";
    toolbar.appendChild(filterSlot);
    const refreshBtn = document.createElement("button");
    refreshBtn.className = "icon-btn"; refreshBtn.title = "Refresh"; refreshBtn.setAttribute("aria-label", "Refresh");
    refreshBtn.innerHTML = '<svg class="icn" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>';
    toolbar.appendChild(refreshBtn);
    wrap.appendChild(toolbar);

    if (toolbarFilters) toolbarFilters(filterSlot, (key, value) => setFilter(key, value), state.filters);

    /* table */
    const tableWrap = document.createElement("div");
    tableWrap.className = "table-wrap";
    const head = columns.map(c => {
      const sortable = !!c.sortable && !!c.sortBy;
      const arrow = state.sortBy === c.sortBy ? (state.sortDir === "asc" ? "\u2191" : "\u2193") : "";
      return `<th class="${sortable ? "sortable" : ""}" data-sort="${escapeHtml(c.sortBy || "")}">${escapeHtml(c.label)}${sortable ? `<span class="sort-arrow">${arrow}</span>` : ""}</th>`;
    }).join("");
    tableWrap.innerHTML = `<table class="table"><thead><tr>${head}</tr></thead><tbody></tbody></table>`;
    const tbody = tableWrap.querySelector("tbody");
    wrap.appendChild(tableWrap);

    /* pagination */
    const paginEl = document.createElement("div");
    paginEl.className = "pagination";
    wrap.appendChild(paginEl);

    /* events */
    searchInputEl.addEventListener("input", debounce(() => {
      state.search = searchInputEl.value.trim();
      state.page = 1;
      load();
    }, 300));

    refreshBtn.addEventListener("click", load);

    tableWrap.querySelector("thead").addEventListener("click", (e) => {
      const th = e.target.closest("th[data-sort]");
      if (!th) return;
      const key = th.getAttribute("data-sort");
      if (state.sortBy === key) {
        state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
      } else {
        state.sortBy = key; state.sortDir = "asc";
      }
      load();
    });

    function setFilter(key, value) { state.filters[key] = value || null; state.page = 1; load(); }

    function pagination() {
      const total = state.total, size = state.pageSize;
      const pages = Math.max(1, Math.ceil(total / size));
      if (state.page > pages) state.page = pages;
      let pageBtns = "";
      const page = state.page;
      const window = [];
      for (let p = Math.max(1, page - 2); p <= Math.min(pages, page + 2); p++) window.push(p);
      const from = total === 0 ? 0 : (page - 1) * size + 1;
      const to = Math.min(total, page * size);
      pageBtns += `<span>${from}\u2013${to} of ${total}</span>`;
      pageBtns += `<div class="pages">
        <button class="page-num" data-p="${Math.max(1, page - 1)}" ${page <= 1 ? "disabled" : ""}>&#8249;</button>
        ${window.map(p => `<button class="page-num ${p === page ? "current" : ""}" data-p="${p}">${p}</button>`).join("")}
        <button class="page-num" data-p="${Math.min(pages, page + 1)}" ${page >= pages ? "disabled" : ""}>&#8250;</button>
      </div>`;
      paginEl.innerHTML = pageBtns;
      paginEl.querySelectorAll("button.page-num").forEach(b => {
        if (b.disabled) return;
        b.addEventListener("click", () => { state.page = Number(b.dataset.p); load(); });
      });
    }

    async function load() {
      const hadData = !!tbody.innerHTML;
      if (!hadData) {
        tbody.innerHTML = `<tr><td colspan="${columns.length}">${skeleton({ rows: 6, cols: columns.length, height: 12 })}</td></tr>`;
      } else {
        tbody.innerHTML = `<tr><td colspan="${columns.length}"><div class="loading-bar"><span class="spin"></span></div></td></tr>`;
      }
      const res = await loader({ ...state });
      if (!res.ok) {
        tbody.innerHTML = `<tr><td colspan="${columns.length}"><div class="empty-state"><span class="empty-ic"><svg class="icn lg" viewBox="0 0 24 24" aria-hidden="true">${EMPTY_ICONS.alert}</svg></span><h3>Load failed</h3><p>${escapeHtml(res.error)}</p></div></td></tr>`;
        paginEl.innerHTML = "";
        return;
      }
      const { rows, total } = res.data;
      state.total = total;
      if (!rows || rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${columns.length}">${empty(emptyText, emptyIcon, emptyTitle)}</td></tr>`;
      } else {
        tbody.innerHTML = rows.map(r => renderRow(r)).join("");
        if (state.total > 0 && state.page === 0) state.page = 1;
      }
      pagination();
    }

    function reload() { state.page = 1; load(); }
    function getState() { return { ...state }; }

    load();
    return { element: wrap, reload, setFilter, getState };
  }

  /* ---------- small helpers ---------- */
  function el(html) { const d = document.createElement("div"); d.innerHTML = html; return d.firstElementChild; }

  function fmtBytes(bytes) {
    if (!bytes && bytes !== 0) return "—";
    const n = Number(bytes);
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / (1024 * 1024)).toFixed(1) + " MB";
  }

  return {
    escapeHtml, fmtDate, fmtDateTime, fmtTime, timeAgo, cap, initials, debounce,
    toast, avatar, badge, modal, closeModals, confirm, loading, skeleton, empty,
    select, datatable, el, fmtBytes, icon, countUp,
  };
})();