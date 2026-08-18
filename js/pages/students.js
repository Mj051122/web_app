/* ============================================================
   Pages.students — students first.
   List of all student accounts; each opens a detail page with
   profile, subject cards (each showing its professor) and a
   schedule container listing the student's class schedules.
   ============================================================ */
window.Pages = window.Pages || {};
Pages.students = (() => {

  const MAX = 200;

  const ICONS = {
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    grad: '<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>',
    classes: '<path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/>',
    blocked: '<circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 14.14 14.14"/>',
  };
  const icon = (name) => `<svg class="icn" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ""}</svg>`;

  const DAYS_ORDER = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

  function statusBadge(u) {
    if (u.is_blocked) return UI.badge("blocked", "danger");
    return UI.badge("active", "success");
  }

  /* schedule_days arrives as a text[]/jsonb array or "Mon, Wed" string.
     DB values are full lowercase names ("monday") — normalize to "Mon". */
  const DAY_ALIAS = {
    monday: "Mon", mon: "Mon",
    tuesday: "Tue", tue: "Tue",
    wednesday: "Wed", wed: "Wed",
    thursday: "Thu", thu: "Thu",
    friday: "Fri", fri: "Fri",
    saturday: "Sat", sat: "Sat",
    sunday: "Sun", sun: "Sun",
  };

  function parseDays(c) {
    const raw = c.schedule_days;
    if (!raw) return [];
    let list;
    if (typeof raw === "string" && raw.trim().startsWith("[")) {
      try { list = JSON.parse(raw); } catch (e) { /* fall through */ }
    }
    if (!list) list = typeof raw === "string" ? raw.split(",").map(d => d.trim()).filter(Boolean) : (Array.isArray(raw) ? raw : []);
    return list.map(d => {
      const k = String(d).trim().toLowerCase();
      return DAY_ALIAS[k] || String(d).trim();
    }).filter(Boolean);
  }

  function scheduleLabel(c) {
    const days = parseDays(c);
    const start = c.schedule_start_time ? UI.fmtTime(c.schedule_start_time) : "";
    const end = c.schedule_end_time ? UI.fmtTime(c.schedule_end_time) : "";
    if (!days.length && !start) return "No schedule set";
    const dayStr = days.length ? days.join(" · ") : "Flexible";
    const timeStr = start ? (end ? `${start} – ${end}` : start) : "";
    return timeStr ? `${dayStr} — ${timeStr}` : dayStr;
  }

  /* ================= LIST ================= */
  async function renderList(view) {
    view.innerHTML = UI.loading("Loading students\u2026");
    const res = await API.callRpc("admin_list_users", { p_filters: { role: "student", page: 1, page_size: MAX } });
    if (!res.ok) {
      view.innerHTML = `<div class="card card-body">${UI.empty(res.error, "alert", "Load failed")}</div>`;
      return;
    }
    const students = res.data.rows || [];

    view.innerHTML = `
      <div class="section-title">
        <h1>Students</h1>
        <div class="actions">${Auth.canEdit() ? `<a class="btn" href="#/users">${UI.icon("plus")} New student</a>` : ""}</div>
      </div>
      <div class="grid cols-3" style="margin-bottom:16px">
        ${statCard("Students", students.length, "student accounts", "users")}
        ${statCard("Active", students.filter(s => !s.is_blocked).length, "not blocked", "grad")}
        ${statCard("Blocked", students.filter(s => s.is_blocked).length, "suspended accounts", "blocked")}
      </div>
      <div id="studentTable"></div>`;

    view.querySelectorAll(".stat-value").forEach(v => UI.countUp(v));

    const dt = UI.datatable({
      columns: [
        { label: "Student", sortable: true, sortBy: "full_name" },
        { label: "ID number", sortable: true, sortBy: "id_number" },
        { label: "Year" },
        { label: "Course / section" },
        { label: "Contact" },
        { label: "Status" },
        { label: "" },
      ],
      emptyText: "No students yet.",
      emptyIcon: "users",
      defaultSortBy: "created_at",
      loader: async (state) => {
        const q = (state.search || "").trim().toLowerCase();
        let rows = students;
        if (q) {
          rows = rows.filter(s =>
            (s.full_name || "").toLowerCase().includes(q) ||
            (s.id_number || "").toLowerCase().includes(q) ||
            (s.email || "").toLowerCase().includes(q) ||
            (s.course || "").toLowerCase().includes(q) ||
            (s.section || "").toLowerCase().includes(q));
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
      renderRow(s) {
        return `<tr class="${s.is_blocked ? "row-danger" : ""}">
          <td>
            <a href="#/students/${s.id}" style="display:flex;align-items:center;gap:10px">
              ${UI.avatar(s.full_name, s.profile_picture_url)}
              <span><span class="cell-main">${UI.escapeHtml(s.full_name)}</span><br><span class="cell-sub">${UI.escapeHtml(s.email || "")}</span></span>
            </a>
          </td>
          <td class="mono">${UI.escapeHtml(s.id_number)}</td>
          <td>${UI.badge(s.year_level)}</td>
          <td class="muted">${UI.escapeHtml(s.course || "—")}${s.section ? " · " + UI.escapeHtml(s.section) : ""}</td>
          <td class="muted">${UI.escapeHtml(s.phone_number || "—")}</td>
          <td>${statusBadge(s)}</td>
          <td>
            <div class="table-actions">
              <a class="act primary" href="#/students/${s.id}" title="View student">${UI.icon("eye")}</a>
              <a class="act primary" href="#/users/${s.id}" title="Edit user">${UI.icon("pencil")}</a>
            </div>
          </td>
        </tr>`;
      },
    });

    view.querySelector("#studentTable").appendChild(dt.element);
  }

  function statCard(label, value, sub, iconName) {
    return `
      <div class="stat-card">
        <div class="stat-top">
          <div>
            <div class="stat-label">${label}</div>
            <div class="stat-value">${UI.escapeHtml(value)}</div>
            <div class="stat-sub">${sub}</div>
          </div>
          <span class="stat-icon">${icon(iconName)}</span>
        </div>
      </div>`;
  }

  /* ================= DETAIL ================= */
  async function renderDetail(view, params) {
    view.innerHTML = UI.loading("Loading student\u2026");
    const id = params.id;

    const [userRes, classesRes] = await Promise.all([
      API.callRpc("admin_get_user", { p_user_id: id }),
      API.callRpc("admin_list_classes", { p_filters: { student_id: id, page: 1, page_size: MAX } }),
    ]);
    if (!userRes.ok) {
      view.innerHTML = `<div class="card card-body">${UI.empty(userRes.error, "alert", "Load failed")}</div>`;
      return;
    }
    const s = userRes.data.user;
    if (!s) {
      view.innerHTML = `<div class="card card-body">${UI.empty("This student was not found.", "search", "Not found")}</div>`;
      return;
    }
    const classes = (classesRes.ok && classesRes.data.rows) || [];
    const subs = classes.filter(c => !c.is_archived);
    const sched = [...subs].sort((a, b) => {
      const da = Math.min(...(parseDays(a).map(d => DAYS_ORDER[d] ?? 9) || [9]));
      const db = Math.min(...(parseDays(b).map(d => DAYS_ORDER[d] ?? 9) || [9]));
      if (da !== db) return da - db;
      return String(a.schedule_start_time || "").localeCompare(String(b.schedule_start_time || ""));
    });

    view.innerHTML = `
      <a href="#/students" class="btn ghost sm" style="margin-bottom:12px">${UI.icon("arrowLeft")} All students</a>
      <div class="detail-head">
        ${UI.avatar(s.full_name, s.profile_picture_url, "lg")}
        <div class="dt">
          <h1>${UI.escapeHtml(s.full_name)}</h1>
          <div class="sub">${UI.escapeHtml(s.id_number)} &middot; ${UI.badge("student")} ${statusBadge(s)}</div>
        </div>
        <div class="actions" style="display:flex;gap:8px">
          <a class="btn secondary" href="#/users/${s.id}">Edit</a>
          <a class="btn ghost" href="#/users/${s.id}" title="Full user profile">${UI.icon("eye")} Profile</a>
        </div>
      </div>

      <div class="grid cols-3" style="margin-bottom:16px">
        ${statCard("Subjects", userRes.data.enrollment_count ?? 0, "classes they are enrolled in", "classes")}
        ${statCard("Assignments", userRes.data.submission_count ?? 0, "submissions made", "grad")}
        ${statCard("Attendance", userRes.data.attendance_count ?? 0, "records found", "users")}
      </div>

      ${Schedule.gridHTML(sched)}

      <div class="grid cols-2">
        <div class="card">
          <div class="card-head"><h3>Profile</h3></div>
          <div class="card-body">
            <div class="kv">
              <div class="kv-row"><span class="k">Email</span><span class="v">${UI.escapeHtml(s.email || "—")}</span></div>
              <div class="kv-row"><span class="k">Phone</span><span class="v">${UI.escapeHtml(s.phone_number || "—")}</span></div>
              <div class="kv-row"><span class="k">Year level</span><span class="v">${UI.badge(s.year_level)}</span></div>
              <div class="kv-row"><span class="k">Course</span><span class="v">${UI.escapeHtml(s.course || "—")}</span></div>
              <div class="kv-row"><span class="k">Section</span><span class="v">${UI.escapeHtml(s.section || "—")}</span></div>
              <div class="kv-row"><span class="k">Track</span><span class="v">${UI.escapeHtml(s.track || "—")}</span></div>
              <div class="kv-row"><span class="k">Joined</span><span class="v">${UI.fmtDate(s.created_at)}</span></div>
              <div class="kv-row"><span class="k">Status</span><span class="v">${statusBadge(s)}</span></div>
            </div>
            ${s.bio ? `<div style="margin-top:12px;font-size:.84rem;color:var(--text-2)">${UI.escapeHtml(s.bio)}</div>` : ""}
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h3>Subjects</h3><span class="muted small">${subs.length} enrolled</span></div>
          <div class="card-body subject-stack" id="subjectGrid"></div>
        </div>
      </div>`;

    /* clickable schedule blocks → professor popover */
    Schedule.init(view.querySelector(".sg-wrap"));

    /* subject cards */
    const grid = view.querySelector("#subjectGrid");
    if (!subs.length) {
      grid.innerHTML = UI.empty("This student is not enrolled in any subject yet.", "classes");
      return;
    }
    grid.innerHTML = subs.map(c => `
      <div class="subject-card">
        <div class="sc-top">
          <span class="sc-tile" style="background:${UI.escapeHtml(c.theme_color || "#4338ca")}"></span>
          <div style="min-width:0">
            <div class="cell-main" style="font-weight:650">${UI.escapeHtml(c.class_name || c.subject_name || "—")}</div>
            <div class="cell-sub">${UI.escapeHtml(c.subject_code || c.class_code || "")}${c.year_level ? " · " + UI.badge(c.year_level) : ""}${c.section ? " · " + UI.escapeHtml(c.section) : ""}</div>
          </div>
        </div>
        <div class="sc-prof">
          ${UI.avatar(c.professor_name, "", 30)}
          <span style="flex:1;min-width:0">
            <span class="cell-sub">Professor</span><br>
            <span class="cell-main">${UI.escapeHtml(c.professor_name || "Unassigned")}</span>
          </span>
          ${c.is_archived ? UI.badge("archived", "danger") : UI.badge("active", "success")}
        </div>
        <div class="sc-meta">${UI.icon("classes")} ${UI.escapeHtml(scheduleLabel(c))}</div>
        <div class="sc-foot">
          <span class="small muted">${c.enrollment_count ?? 0} students</span>
          <a class="btn sm secondary" href="#/classes/${c.id}">View class</a>
        </div>
      </div>`).join("");
  }

  return {
    render(view, params) {
      if (params.id) return renderDetail(view, params);
      return renderList(view);
    },
    renderDetail,
  };
})();

Pages.studentDetail = { render: (view, params) => Pages.students.renderDetail(view, params) };