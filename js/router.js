/* ============================================================
   router.js — hash-based routing, no libraries.
   Routes: #/ (landing), #/login, #/signup, #/dashboard,
   #/users, #/users/:id, #/classes, #/classes/:id,
   #/join-requests, #/assignments, #/submissions, #/attendance,
   #/announcements, #/storage, #/audit-logs, #/settings
   ============================================================ */
const Router = (() => {

  /* Lucide-style inline icons (stroke 2, currentColor). */
  const ICONS = {
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    classes: '<path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/>',
    joinRequests: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    assignments: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
    submissions: '<circle cx="12" cy="8" r="6"/><path d="M15.48 12.89 17 22l-5-3-5 3 1.52-9.11"/>',
    attendance: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/><path d="m9 16 2 2 4-4"/>',
    announcements: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
    comments: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    storage: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
    auditLogs: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
    hamburger: '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>',
  };
  const icon = (name, cls = "icn") =>
    `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ""}</svg>`;
  const PAW =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="6.2" cy="5.6" rx="2.1" ry="2.6"/><ellipse cx="12" cy="4.2" rx="2.1" ry="2.6"/><ellipse cx="17.8" cy="5.6" rx="2.1" ry="2.6"/><path d="M12 8.6c-4.1 0-6.6 2.5-6.6 5.5 0 2 1.4 3.3 3.1 3.3 1 0 1.9-.4 3.5-.4s2.5.4 3.5.4c1.7 0 3.1-1.3 3.1-3.3 0-3-2.5-5.5-6.6-5.5z"/></svg>';

  const routes = [
    { pattern: "/", page: "landing", public: true, title: "Home" },
    { pattern: "/login", page: "login", public: true, title: "Sign in" },
    { pattern: "/signup", page: "signup", public: true, title: "Request access" },
    { pattern: "/dashboard", page: "dashboard", title: "Dashboard" },
    { pattern: "/users/:id", page: "userDetail", title: "User details" },
    { pattern: "/users", page: "users", title: "Users" },
    { pattern: "/classes/:id", page: "classDetail", title: "Class details" },
    { pattern: "/classes", page: "classes", title: "Classes" },
    { pattern: "/join-requests", page: "joinRequests", title: "Join requests" },
    { pattern: "/assignments", page: "assignments", title: "Assignments" },
    { pattern: "/submissions", page: "submissions", title: "Submissions & grades" },
    { pattern: "/attendance", page: "attendance", title: "Attendance" },
    { pattern: "/announcements", page: "announcements", title: "Announcements" },
    { pattern: "/comments", page: "comments", title: "Comments" },
    { pattern: "/storage", page: "storage", title: "Storage" },
    { pattern: "/audit-logs", page: "auditLogs", title: "Audit logs" },
    { pattern: "/settings", page: "settings", title: "Settings" },
  ];

  let currentRoute = null;
  let currentParams = {};

  function parseHash() {
    let hash = location.hash.replace(/^#/, "") || "/";
    if (!hash.startsWith("/")) hash = "/" + hash;
    return hash;
  }

  function match(hash) {
    const segs = hash.split("/").filter(Boolean);
    for (const r of routes) {
      const rSegs = r.pattern.split("/").filter(Boolean);
      if (rSegs.length !== segs.length) continue;
      const params = {};
      let ok = true;
      for (let i = 0; i < rSegs.length; i++) {
        const seg = segs[i].split("?")[0];
        if (rSegs[i].startsWith(":")) params[rSegs[i].slice(1)] = decodeURIComponent(seg);
        else if (rSegs[i] !== seg) { ok = false; break; }
      }
      if (ok) {
        const q = hash.split("?")[1];
        if (q) {
          params.query = {};
          new URLSearchParams(q).forEach((v, k) => { params.query[k] = v; });
        }
        return { route: r, params };
      }
    }
    return { route: null, params: {} };
  }

  function currentIsPublic() {
    const hash = parseHash();
    const { route } = match(hash);
    return !!(route && route.public);
  }

  const NAV = [
    { section: "Overview" },
    { hash: "#/dashboard", label: "Dashboard", icon: "dashboard" },
    { section: "Management" },
    { hash: "#/users", label: "Users", icon: "users" },
    { hash: "#/classes", label: "Classes", icon: "classes" },
    { hash: "#/join-requests", label: "Join requests", icon: "joinRequests" },
    { hash: "#/assignments", label: "Assignments", icon: "assignments" },
    { hash: "#/submissions", label: "Submissions & grades", icon: "submissions" },
    { hash: "#/attendance", label: "Attendance", icon: "attendance" },
    { hash: "#/announcements", label: "Announcements", icon: "announcements" },
    { hash: "#/comments", label: "Comments", icon: "comments" },
    { section: "System" },
    { hash: "#/storage", label: "Storage", icon: "storage" },
    { hash: "#/audit-logs", label: "Audit logs", icon: "auditLogs" },
    { hash: "#/settings", label: "Settings", icon: "settings" },
  ];

  function renderSidebar() {
    const sidebar = document.getElementById("sidebar");
    const hash = parseHash();
    let html = `
      <div class="brand">
        <span class="logo">${PAW}</span>
        <span>${CONFIG.APP_NAME}<small>Admin</small></span>
      </div>
      <nav class="nav">`;
    for (const item of NAV) {
      if (item.section) html += `<div class="nav-section">${item.section}</div>`;
      else {
        const active = hash === item.hash.replace("#", "") || (hash.startsWith(item.hash.replace("#", "") + "/"));
        html += `<a class="nav-link ${active ? "active" : ""}" href="${item.hash}"><span class="ic">${icon(item.icon)}</span>${item.label}</a>`;
      }
    }
    html += `</nav>
      <div class="sidebar-footer">${CONFIG.APP_NAME} Admin &middot; v1.0</div>`;
    sidebar.innerHTML = html;
    sidebar.classList.remove("open");
    document.getElementById("sidebarBackdrop").classList.remove("show");
  }

  function renderTopbar(title) {
    const topbar = document.getElementById("topbar");
    const a = Auth.admin() || {};
    const roleBadge = a.role === "super_admin" ? `<span class="badge dark">Super admin</span>` : `<span class="badge primary">Admin</span>`;
    const editBadge = Auth.canEdit() ? "" : `<span class="badge warning" title="Viewing only — editing is locked until a super admin grants access">read-only</span>`;
    topbar.innerHTML = `
      <button class="icon-btn" id="sidebarToggle" aria-label="Menu">${icon("hamburger", "icn")}</button>
      <div class="page-title">${UI.escapeHtml(title)}</div>
      <div class="spacer"></div>
      <div class="topbar-user">
        <span class="avatar">${UI.escapeHtml(UI.initials(a.full_name || a.email))}</span>
        <span class="name-wrap">
          <span class="name" style="display:block;font-size:.84rem;font-weight:600">${UI.escapeHtml(a.full_name || a.email)}</span>
          <span class="role">${roleBadge} ${editBadge}</span>
        </span>
        <button class="btn ghost sm" id="logoutBtn" title="Sign out">Log out</button>
      </div>`;
    document.getElementById("sidebarToggle").addEventListener("click", () => {
      document.getElementById("sidebar").classList.add("open");
      document.getElementById("sidebarBackdrop").classList.add("show");
    });
    document.getElementById("sidebarBackdrop").addEventListener("click", () => {
      document.getElementById("sidebar").classList.remove("open");
      document.getElementById("sidebarBackdrop").classList.remove("show");
    });
    document.getElementById("logoutBtn").addEventListener("click", () => {
      UI.confirm({ title: "Sign out?", message: "Your admin session will end. You will need to sign in again to continue.", danger: false, okText: "Sign out" })
        .then(ok => { if (ok) Auth.logout(); });
    });
  }

  async function render() {
    /* Let Auth absorb any recovery tokens in the hash first. */
    await Auth.ready();

    const hash = parseHash();
    const { route, params } = match(hash);
    if (!route) { location.hash = "/"; return; }

    currentRoute = route; currentParams = params;
    const app = document.getElementById("app");
    const loginRoot = document.getElementById("login-root");

    if (!route.public) {
      const res = await Auth.resolveAdmin();
      if (res.status !== "ok") {
        const why = res.status === "disabled" ? "?disabled=1" : res.status === "not_admin" ? "?notadmin=1" : "";
        location.hash = "/login" + why;
        return;
      }
      app.classList.remove("hidden");
      loginRoot.innerHTML = "";
      renderSidebar();
      renderTopbar(route.title);
      document.title = route.title + " — " + CONFIG.APP_NAME + " Admin";
      const view = document.getElementById("view");
      view.innerHTML = `<div class="view-pad">${UI.loading()}</div>`;
      try {
        const page = Pages[route.page];
        if (!page) { view.innerHTML = UI.empty("Unknown page.", "search", "404"); return; }
        await page.render(view, params);
      } catch (e) {
        console.error(e);
        view.innerHTML = `<div class="card card-body">${UI.empty("Something went wrong rendering this page. See console.", "⚠️", "Error")}</div>`;
      }
    } else {
      app.classList.add("hidden");
      document.title = (route.title || "Home") + " — " + CONFIG.APP_NAME + " Admin";
      document.getElementById("view").innerHTML = "";
      const page = Pages[route.page];
      if (page) await page.render(loginRoot, params);
    }
    if (window.innerWidth <= 900) window.scrollTo(0, 0);
  }

  function go(hash) {
    if (!hash.startsWith("#")) hash = "#" + hash;
    location.hash = hash;
  }

  function init() {
    window.addEventListener("hashchange", render);
    render();
  }

  return { init, go, render, currentIsPublic };
})();

document.addEventListener("DOMContentLoaded", () => Router.init());