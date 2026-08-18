/* ============================================================
   Pages.dashboard — overview via admin_get_overview.
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
      classes: '<path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/>',
      pending: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
      ungraded: '<circle cx="12" cy="8" r="6"/><path d="M15.48 12.89 17 22l-5-3-5 3 1.52-9.11"/>',
      blocked: '<circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 14.14 14.14"/>',
      announcements: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
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

      <div class="grid cols-4" id="statGrid">
        ${card("Students", o.students ?? "—", "active accounts", "#/users", "students")}
        ${card("Professors", o.professors ?? "—", "active accounts", "#/users?role=professor", "professors")}
        ${card("Classes", o.classes ?? "—", "total classes", "#/classes", "classes")}
        ${card("Pending join requests", o.pending_join_requests ?? "—", "awaiting review", "#/join-requests", "pending")}
        ${card("Ungraded submissions", o.ungraded_submissions ?? "—", "need scores", "#/submissions", "ungraded")}
        ${card("Blocked users", o.blocked_users ?? "—", "suspended accounts", "#/users", "blocked")}
        ${card("Announcements", o.announcements ?? "—", "total posted", "#/announcements", "announcements")}
        ${card("Audit entries", o.audit_entries ?? "—", "admin actions tracked", "#/audit-logs", "audit")}
      </div>
      <div class="grid cols-2" style="margin-top:18px">
        <div class="card">
          <div class="card-head"><h3>Recent announcements</h3><a href="#/announcements" class="btn ghost sm" style="margin-left:auto">View all</a></div>
          <div class="card-body flush" id="recentAnn"></div>
        </div>
        <div class="card">
          <div class="card-head"><h3>Latest admin activity</h3><a href="#/audit-logs" class="btn ghost sm" style="margin-left:auto">View all</a></div>
          <div class="card-body flush" id="recentAudit"></div>
        </div>
      </div>`;

    view.querySelectorAll("#statGrid .stat-value").forEach(v => UI.countUp(v));

    const recentAnn = view.querySelector("#recentAnn");
    const recentAudit = view.querySelector("#recentAudit");

    if (o.recent_announcements && o.recent_announcements.length) {
      recentAnn.innerHTML = o.recent_announcements.map(a => `
        <div style="padding:12px 18px;border-bottom:1px solid var(--border)">
          <div style="font-weight:600;font-size:.88rem">${UI.escapeHtml(a.title)}</div>
          <div class="small muted" style="margin-top:2px">${UI.escapeHtml(a.author_name || "")} &middot; ${UI.timeAgo(a.created_at)}</div>
        </div>`).join("");
    } else {
      recentAnn.innerHTML = UI.empty("No announcements yet.", "megaphone");
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