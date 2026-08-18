/* ============================================================
   Pages.faculties — professors first.
   List of faculty members; each opens a detail page showing
   their profile and the classes (subjects) they handle.
   Clicking a class opens its detail page which leads with
   the enrolled students.
   ============================================================ */
window.Pages = window.Pages || {};
Pages.faculties = (() => {

  const MAX = 200;

  function statusBadge(u) {
    if (u.is_blocked) return UI.badge("blocked", "danger");
    return UI.badge("active", "success");
  }

  /* Load all professors + all classes once; aggregate per-professor stats. */
  async function loadFacultyData() {
    const [usersRes, classesRes] = await Promise.all([
      API.callRpc("admin_list_users", { p_filters: { role: "professor", page: 1, page_size: MAX } }),
      API.callRpc("admin_list_classes", { p_filters: { page: 1, page_size: MAX } }),
    ]);
    if (!usersRes.ok) return { ok: false, error: usersRes.error };
    const professors = usersRes.data.rows || [];
    const classes = (classesRes.ok && classesRes.data.rows) || [];
    const byProf = {};
    for (const c of classes) {
      (byProf[c.professor_id] = byProf[c.professor_id] || []).push(c);
    }
    return {
      ok: true,
      professors: professors.map(p => {
        const cls = byProf[p.id] || [];
        return {
          ...p,
          classes: cls,
          class_count: cls.length,
          student_count: cls.reduce((n, c) => n + (c.enrollment_count || 0), 0),
          assignment_count: cls.reduce((n, c) => n + (c.assignment_count || 0), 0),
        };
      }),
    };
  }

  /* ================= LIST ================= */
  async function renderList(view) {
    view.innerHTML = UI.loading("Loading faculty\u2026");
    const data = await loadFacultyData();
    if (!data.ok) {
      view.innerHTML = `<div class="card card-body">${UI.empty(data.error, "alert", "Load failed")}</div>`;
      return;
    }

    view.innerHTML = `
      <div class="section-title">
        <h1>Faculties</h1>
        <div class="actions">${Auth.canEdit() ? `<a class="btn" href="#/users">${UI.icon("plus")} New professor</a>` : ""}</div>
      </div>
      <div class="grid cols-3" style="margin-bottom:16px">
        ${statCard("Faculty members", data.professors.length, "professor accounts", "users")}
        ${statCard("Classes handled", data.professors.reduce((n, p) => n + p.class_count, 0), "across all faculty", "classes")}
        ${statCard("Students taught", data.professors.reduce((n, p) => n + p.student_count, 0), "enrollments in their classes", "award")}
      </div>
      <div id="facultyTable"></div>`;

    view.querySelectorAll(".stat-value").forEach(v => UI.countUp(v));

    const dt = UI.datatable({
      columns: [
        { label: "Faculty member", sortable: true, sortBy: "full_name" },
        { label: "ID number", sortable: true, sortBy: "id_number" },
        { label: "Classes" },
        { label: "Students" },
        { label: "Contact" },
        { label: "Status" },
        { label: "" },
      ],
      emptyText: "No faculty members yet. Create a professor account first.",
      emptyIcon: "users",
      defaultSortBy: "created_at",
      loader: async (state) => {
        const q = (state.search || "").trim().toLowerCase();
        let rows = data.professors;
        if (q) {
          rows = rows.filter(p =>
            (p.full_name || "").toLowerCase().includes(q) ||
            (p.id_number || "").toLowerCase().includes(q) ||
            (p.email || "").toLowerCase().includes(q) ||
            (p.course || "").toLowerCase().includes(q));
        }
        const sortBy = state.sortBy || "created_at";
        const dir = state.sortDir === "asc" ? 1 : -1;
        rows = [...rows].sort((a, b) => {
          const va = a[sortBy] ?? "";
          const vb = b[sortBy] ?? "";
          if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
          return String(va).localeCompare(String(vb)) * dir;
        });
        const total = rows.length;
        const page = Math.max(1, state.page || 1);
        const size = state.pageSize || CONFIG.PAGE_SIZE;
        return { ok: true, data: { rows: rows.slice((page - 1) * size, page * size), total, page, page_size: size } };
      },
      renderRow(p) {
        return `<tr class="${p.is_blocked ? "row-danger" : ""}">
          <td>
            <a href="#/faculties/${p.id}" style="display:flex;align-items:center;gap:10px">
              ${UI.avatar(p.full_name, p.profile_picture_url)}
              <span><span class="cell-main">${UI.escapeHtml(p.full_name)}</span><br><span class="cell-sub">${UI.escapeHtml(p.email || "")}</span></span>
            </a>
          </td>
          <td class="mono">${UI.escapeHtml(p.id_number)}</td>
          <td><span class="cell-main">${p.class_count}</span> <span class="cell-sub">classes</span></td>
          <td><span class="cell-main">${p.student_count}</span> <span class="cell-sub">students</span></td>
          <td class="muted">${UI.escapeHtml(p.phone_number || "—")}</td>
          <td>${statusBadge(p)}</td>
          <td>
            <div class="table-actions">
              <a class="act primary" href="#/faculties/${p.id}" title="View faculty">${UI.icon("eye")}</a>
              <a class="act primary" href="#/users/${p.id}" title="Edit user">${UI.icon("pencil")}</a>
            </div>
          </td>
        </tr>`;
      },
    });

    view.querySelector("#facultyTable").appendChild(dt.element);
  }

  function statCard(label, value, sub, iconName) {
    const ICONS = {
      users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
      classes: '<path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/>',
      award: '<circle cx="12" cy="8" r="6"/><path d="M15.48 12.89 17 22l-5-3-5 3 1.52-9.11"/>',
    };
    return `
      <div class="stat-card">
        <div class="stat-top">
          <div>
            <div class="stat-label">${label}</div>
            <div class="stat-value">${UI.escapeHtml(value)}</div>
            <div class="stat-sub">${sub}</div>
          </div>
          <span class="stat-icon"><svg class="icn" viewBox="0 0 24 24" aria-hidden="true">${ICONS[iconName] || ""}</svg></span>
        </div>
      </div>`;
  }

  /* ================= DETAIL ================= */
  async function renderDetail(view, params) {
    view.innerHTML = UI.loading("Loading faculty\u2026");
    const id = params.id;
    const data = await loadFacultyData();
    if (!data.ok) {
      view.innerHTML = `<div class="card card-body">${UI.empty(data.error, "alert", "Load failed")}</div>`;
      return;
    }
    const p = data.professors.find(x => x.id === id);
    if (!p) {
      view.innerHTML = `<div class="card card-body">${UI.empty("This faculty member was not found.", "search", "Not found")}</div>`;
      return;
    }

    view.innerHTML = `
      <a href="#/faculties" class="btn ghost sm" style="margin-bottom:12px">${UI.icon("arrowLeft")} All faculties</a>
      <div class="detail-head">
        ${UI.avatar(p.full_name, p.profile_picture_url, "lg")}
        <div class="dt">
          <h1>${UI.escapeHtml(p.full_name)}</h1>
          <div class="sub">${UI.escapeHtml(p.id_number)} &middot; ${UI.badge("professor")} ${statusBadge(p)}</div>
        </div>
        <div class="actions" style="display:flex;gap:8px">
          <a class="btn secondary" href="#/users/${p.id}">Edit</a>
          <a class="btn ghost" href="#/users/${p.id}" title="Full user profile">${UI.icon("eye")} Profile</a>
        </div>
      </div>

      <div class="grid cols-3" style="margin-bottom:16px">
        ${statCard("Classes", p.class_count, "subjects they handle", "classes")}
        ${statCard("Students", p.student_count, "enrolled across classes", "award")}
        ${statCard("Assignments", p.assignment_count, "posted in their classes", "file")}
      </div>
      <div class="grid cols-2">
        <div class="card">
          <div class="card-head"><h3>Profile</h3></div>
          <div class="card-body">
            <div class="kv">
              <div class="kv-row"><span class="k">Email</span><span class="v">${UI.escapeHtml(p.email || "—")}</span></div>
              <div class="kv-row"><span class="k">Phone</span><span class="v">${UI.escapeHtml(p.phone_number || "—")}</span></div>
              <div class="kv-row"><span class="k">Department / course</span><span class="v">${UI.escapeHtml(p.course || "—")}</span></div>
              <div class="kv-row"><span class="k">Track</span><span class="v">${UI.escapeHtml(p.track || "—")}</span></div>
              <div class="kv-row"><span class="k">Joined</span><span class="v">${UI.fmtDate(p.created_at)}</span></div>
              <div class="kv-row"><span class="k">Status</span><span class="v">${statusBadge(p)}</span></div>
            </div>
            ${p.bio ? `<div style="margin-top:12px;font-size:.84rem;color:var(--text-2)">${UI.escapeHtml(p.bio)}</div>` : ""}
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h3>Subjects / classes</h3><span class="muted small">${p.class_count} total</span></div>
          <div class="card-body flush" id="facClasses"></div>
        </div>
      </div>`;

    const box = view.querySelector("#facClasses");
    if (!p.classes.length) {
      box.innerHTML = UI.empty("This faculty member has no classes yet.", "classes");
      return;
    }
    box.innerHTML = `<div style="padding:10px 18px 14px;display:flex;justify-content:flex-end">
        <button class="btn sm" id="clsFilterBtn">All statuses</button>
      </div>
      <div id="clsList" class="card-body flush"></div>`;

    const clsList = view.querySelector("#clsList");
    const filterBtn = view.querySelector("#clsFilterBtn");
    let showArchived = true;

    function drawClasses() {
      const rows = p.classes.filter(c => showArchived || !c.is_archived);
      clsList.innerHTML = rows.length ? `<table class="table"><thead><tr><th>Subject / class</th><th>Code</th><th>Schedule</th><th>Year</th><th>Students</th><th>Status</th><th></th></tr></thead><tbody>
        ${rows.map(c => `<tr class="${c.is_archived ? "row-danger" : ""}">
          <td>
            <a href="#/classes/${c.id}"><span class="cell-main">${UI.escapeHtml(c.class_name)}</span></a>
            <br><span class="cell-sub">${UI.escapeHtml(c.subject_name || "—")}</span>
          </td>
          <td class="mono">${UI.escapeHtml(c.subject_code || c.class_code || "—")}</td>
          <td class="muted small">${UI.escapeHtml(c.schedule_days || "—")}${c.schedule_start_time ? "<br>" + UI.fmtTime(c.schedule_start_time) : ""}</td>
          <td>${UI.badge(c.year_level)}</td>
          <td><span class="cell-main">${c.enrollment_count ?? 0}</span></td>
          <td>${c.is_archived ? UI.badge("archived", "danger") : UI.badge("active", "success")}</td>
          <td>
            <div class="table-actions">
              <a class="act primary" href="#/classes/${c.id}" title="View students">${UI.icon("eye")}</a>
            </div>
          </td>
        </tr>`).join("")}</tbody></table>`
        : UI.empty("No classes match this filter.", "classes");
    }

    filterBtn.addEventListener("click", () => {
      showArchived = !showArchived;
      filterBtn.innerHTML = `${showArchived ? "All statuses" : "Active only"}`;
      drawClasses();
    });
    drawClasses();
  }

  return {
    render(view, params) {
      if (params.id) return renderDetail(view, params);
      return renderList(view);
    },
    renderDetail,
  };
})();

Pages.facultyDetail = { render: (view, params) => Pages.faculties.renderDetail(view, params) };