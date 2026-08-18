/* ============================================================
   Pages.dashboard — overview via admin_get_overview.
   Admin-only scope: users, requests, blocked accounts, audit.
   (Professor-side content lives in the app, not here.)
   ============================================================ */
window.Pages = window.Pages || {};
Pages.dashboard = {
  async render(view) {
    view.innerHTML = UI.loading("Loading overview\u2026");
    const res = await API.callRpc("admin_get_overview", { p_filters: {} });
    if (!res.ok) {
      view.innerHTML = `<div class="card card-body">${UI.empty("Could not load the dashboard.", "alert", "Load failed")}</div>`;
      return;
    }
    const o = res.data || {};

    const STAT_ICONS = {
      students: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
      professors: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
      pending: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
      blocked: '<circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 14.14 14.14"/>',
      admins: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
      audit: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
    };
    const icon = (name) => `<svg class="icn" viewBox="0 0 24 24" aria-hidden="true">${STAT_ICONS[name] || ""}</svg>`;

    const card = (label, value, sub, hash, iconName) => `
      <div class="stat-card" onclick="location.hash='${hash}'" role="link" tabindex="0"
           onkeydown="if(event.key==='Enter')location.hash='${hash}'">
        <div class="stat-top">
          <div>
            <div class="stat-label">${label}</div>
            <div class="stat-value">${UI.escapeHtml(value)}</div>
            <div class="stat-sub">${sub}</div>
          </div>
          <span class="stat-icon">${icon(iconName)}</span>
        </div>
      </div>`;

    view.innerHTML = `
      <div class="section-title">
        <h1>Dashboard</h1>
        <div class="actions">
          <button class="btn secondary sm" id="refreshOverview">Refresh</button>
        </div>
      </div>

      <div class="grid cols-3" id="statGrid">
        ${card("Students", o.students ?? "—", "active accounts", "#/users", "students")}
        ${card("Professors", o.professors ?? "—", "active accounts", "#/faculties", "professors")}
        ${card("Pending join requests", o.pending_join_requests ?? "—", "awaiting review", "#/join-requests", "pending")}
        ${card("Blocked users", o.blocked_users ?? "—", "suspended accounts", "#/users", "blocked")}
        ${card("Admin accounts", o.admin_users ?? "—", "panel access", "#/settings", "admins")}
        ${card("Audit entries", o.audit_entries ?? "—", "admin actions tracked", "#/audit-logs", "audit")}
      </div>

      <div class="grid cols-2" style="margin-top:18px">
        <div class="card">
          <div class="card-head"><h3>Pending join requests</h3><a href="#/join-requests" class="btn ghost sm" style="margin-left:auto">Review all</a></div>
          <div class="card-body flush" id="recentRequests"></div>
        </div>
        <div class="card">
          <div class="card-head"><h3>Latest admin activity</h3><a href="#/audit-logs" class="btn ghost sm" style="margin-left:auto">View all</a></div>
          <div class="card-body flush" id="recentAudit"></div>
        </div>
      </div>`;

    view.querySelectorAll("#statGrid .stat-value").forEach(v => UI.countUp(v));

    const recentRequests = view.querySelector("#recentRequests");
    const recentAudit = view.querySelector("#recentAudit");

    if (o.recent_join_requests && o.recent_join_requests.length) {
      recentRequests.innerHTML = o.recent_join_requests.map(r => `
        <div style="padding:11px 18px;border-bottom:1px solid var(--border);display:flex;gap:11px;align-items:center">
          ${UI.avatar(r.student_name || r.id_number || "?")}
          <span style="flex:1;min-width:0">
            <span style="display:block;font-weight:600;font-size:.86rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${UI.escapeHtml(r.student_name || "Student")}</span>
            <span class="small muted" style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${UI.escapeHtml(r.class_name || "")} ${r.class_code ? UI.escapeHtml("· " + r.class_code) : ""}</span>
          </span>
          <span class="badge warning">${UI.icon("alert")} Pending</span>
          <span class="small muted" style="white-space:nowrap">${UI.timeAgo(r.requested_at)}</span>
        </div>`).join("");
    } else {
      recentRequests.innerHTML = UI.empty("No pending join requests.", "users");
    }

    if (o.recent_audit && o.recent_audit.length) {
      recentAudit.innerHTML = o.recent_audit.map(e => `
        <div style="padding:10px 18px;border-bottom:1px solid var(--border);display:flex;gap:10px;align-items:center">
          ${UI.badge(e.action)}
          <span class="small muted" style="flex:1">${UI.escapeHtml(e.admin_name || e.admin_id || "")} ${UI.escapeHtml(e.target_table ? "→ " + e.target_table : "")}</span>
          <span class="small muted">${UI.timeAgo(e.created_at)}</span>
        </div>`).join("");
    } else {
      recentAudit.innerHTML = UI.empty("No admin activity recorded yet.", "scroll");
    }

    view.querySelector("#refreshOverview").addEventListener("click", () => Pages.dashboard.render(view));
  },
};