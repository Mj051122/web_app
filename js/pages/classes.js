/* ============================================================
   Pages.classes — class list, detail (students, join requests,
   assignments), edit metadata, reassign professor, enroll/remove
   students, archive / delete with warning.
   ============================================================ */
window.Pages = window.Pages || {};
Pages.classes = (() => {

  const YEARS = ["first", "second", "third", "fourth"];

  /* ================= LIST ================= */
  async function renderList(view, params) {
    const deptRes = await API.callRpc("admin_list_classes", { p_filters: { page: 1, page_size: 200 } });
    const deptSet = new Set();
    ((deptRes.ok && deptRes.data.rows) || []).forEach(c => { if (c.department && c.department !== "Unassigned") deptSet.add(c.department); });
    const departments = [...deptSet].sort();
    const dt = UI.datatable({
      columns: [
        { label: "Class", sortable: true, sortBy: "class_name" },
        { label: "Subject" },
        { label: "Professor" },
        { label: "Year" },
        { label: "Schedule" },
        { label: "Students" },
        { label: "Status" },
        { label: "" },
      ],
      emptyText: "No classes found.",
      emptyIcon: "classes",
      defaultSortBy: "created_at",
      loader: async (state) => {
        const filters = { ...state.filters, search: state.search || null, page: state.page, page_size: state.pageSize };
        if (state.sortBy) { filters.sort_by = state.sortBy; filters.sort_dir = state.sortDir; }
        return API.callRpc("admin_list_classes", { p_filters: filters });
      },
      toolbarFilters(el, setFilter, filters) {
        el.appendChild(UI.select(YEARS, { value: filters.year_level || "", onChange: v => setFilter("year_level", v), placeholder: "All years" }));
        if (departments.length) el.appendChild(UI.select(departments, { value: filters.department || "", onChange: v => setFilter("department", v), placeholder: "All departments" }));
        el.appendChild(UI.select([
          { value: "active", label: "Active" }, { value: "archived", label: "Archived" },
        ], { value: filters.status || "", onChange: v => setFilter("status", v), placeholder: "All statuses" }));
      },
      renderRow(c) {
        return `<tr class="${c.is_archived ? "row-danger" : ""}">
          <td>
            <a href="#/classes/${c.id}"><span class="cell-main">${UI.escapeHtml(c.class_name)}</span></a>
            <br><span class="cell-sub mono">${UI.escapeHtml(c.class_code)}</span>
          </td>
          <td>
            <div class="cell-main" style="font-size:.82rem">${UI.escapeHtml(c.subject_name || "—")}</div>
            <div class="cell-sub mono">${UI.escapeHtml(c.subject_code || "")}</div>
          </td>
          <td>${UI.escapeHtml(c.professor_name || "—")}</td>
          <td>${UI.badge(c.year_level)}</td>
          <td class="muted small">${UI.escapeHtml(c.schedule_days || "—")}<br>${c.schedule_start_time ? UI.fmtTime(c.schedule_start_time) + "–" + UI.fmtTime(c.schedule_end_time) : ""}</td>
          <td>${UI.escapeHtml(c.enrollment_count ?? 0)}</td>
          <td>${c.is_archived ? UI.badge("archived", "danger") : UI.badge("active", "success")}</td>
          <td>
            <div class="table-actions">
              <a class="act primary" href="#/classes/${c.id}" title="View">${UI.icon("eye")}</a>
              <button class="act primary" data-act="edit" data-id="${c.id}" title="Edit">${UI.icon("pencil")}</button>
              ${c.is_archived
                ? `<button class="act success" data-act="unarchive" data-id="${c.id}" title="Restore">${UI.icon("archiveRestore")}</button>`
                : `<button class="act" data-act="archive" data-id="${c.id}" title="Archive">${UI.icon("archive")}</button>`}
              <button class="act danger" data-act="delete" data-id="${c.id}" title="Delete">${UI.icon("trash")}</button>
            </div>
          </td>
        </tr>`;
      },
    });

    dt.element.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      const id = btn.dataset.id, act = btn.dataset.act;
      if (act === "edit") openEdit(id, dt);
      else if (act === "archive") archiveClass(id, true, dt);
      else if (act === "unarchive") archiveClass(id, false, dt);
      else if (act === "delete") deleteClass(id, dt);
    });

    view.innerHTML = `
      <div class="section-title">
        <h1>Classes</h1>
        <div class="actions">${Auth.canEdit() ? `<button class="btn" id="newClassBtn">${UI.icon("plus")} New class</button>` : ""}</div>
      </div>
      <div id="classesTable"></div>`;
    view.querySelector("#classesTable").appendChild(dt.element);
    const newBtn = view.querySelector("#newClassBtn");
    if (newBtn) newBtn.addEventListener("click", () => openCreate(dt));
  }

  /* ================= CREATE ================= */
  async function openCreate(dt) {
    const profRes = await API.callRpc("admin_list_users", { p_filters: { role: "professor", page: 1, page_size: 200 } });
    if (!profRes.ok) { UI.toast(profRes.error, "error"); return; }
    const professors = profRes.data.rows || [];
    if (!professors.length) { UI.toast("Create a professor first.", "error"); return; }

    const m = UI.modal({ title: "New class", subtitle: "Create a class and assign its professor", size: "lg", footer: `
      <button class="btn secondary cancel">Cancel</button>
      <button class="btn ok" id="clsCreate">Create class</button>` });
    m.body.innerHTML = `
      <form id="clsCreateForm" novalidate>
        <div class="form-row">
          <div class="field"><label>Professor *</label>
            <select name="professor_id" required>
              <option value="">— select professor —</option>
              ${professors.map(p => `<option value="${p.id}">${UI.escapeHtml(p.full_name)} (${UI.escapeHtml(p.id_number)})</option>`).join("")}
            </select></div>
          <div class="field"><label>Class name *</label><input type="text" name="class_name" placeholder="e.g. CS 101 Lecture" required /></div>
        </div>
        <div class="form-row">
          <div class="field"><label>Subject code *</label><input type="text" name="subject_code" placeholder="e.g. CS101" required /></div>
          <div class="field"><label>Subject name</label><input type="text" name="subject_name" /></div>
          <div class="field"><label>Class code</label><input type="text" name="class_code" /></div>
        </div>
        <div class="form-row">
          <div class="field"><label>Year level</label>
            <select name="year_level"><option value="">—</option>${YEARS.map(y => `<option>${y}</option>`).join("")}</select></div>
          <div class="field"><label>Department</label><input type="text" name="department" /></div>
          <div class="field"><label>Section</label><input type="text" name="section" /></div>
        </div>
        <div class="form-row">
          <div class="field"><label>Track</label><input type="text" name="track" /></div>
          <div class="field"><label>Schedule days</label><input type="text" name="schedule_days" placeholder="e.g. Mon, Wed" /></div>
          <div class="field"><label>Join code</label><input type="text" name="join_code" placeholder="6 digits — auto-generated if blank" maxlength="6" /></div>
        </div>
        <div class="form-row">
          <div class="field"><label>Start time</label><input type="time" name="schedule_start_time" /></div>
          <div class="field"><label>End time</label><input type="time" name="schedule_end_time" /></div>
          <div class="field"><label>Theme color</label><input type="text" name="theme_color" placeholder="#4338ca" /></div>
        </div>
        <div class="field"><label>Cover image URL</label><input type="url" name="cover_image_url" /></div>
      </form>`;
    m.foot.querySelector(".cancel").addEventListener("click", m.close);
    m.foot.querySelector("#clsCreate").addEventListener("click", async (e) => {
      const form = m.body.querySelector("#clsCreateForm");
      if (!form.reportValidity()) return;
      const btn = e.target; btn.disabled = true;
      const data = Object.fromEntries(new FormData(form).entries());
      const res = await API.callRpc("admin_create_class", { p_data: data });
      if (!res.ok) { btn.disabled = false; UI.toast(res.error, "error"); return; }
      UI.toast("Class created.", "success");
      m.close(); dt.reload();
    });
  }

  async function getClass(id) {
    const res = await API.callRpc("admin_list_classes", { p_filters: { class_id: id, page: 1, page_size: 1 } });
    if (!res.ok) return res;
    return { ok: true, data: (res.data.rows || [])[0] || null };
  }

  /* ================= EDIT / REASSIGN ================= */
  async function openEdit(id, dt) {
    const r = await getClass(id);
    if (!r.ok || !r.data) { UI.toast(r.ok ? "Class not found." : r.error, "error"); return; }
    const c = r.data;

    /* professor picker data */
    const profRes = await API.callRpc("admin_list_users", { p_filters: { role: "professor", page: 1, page_size: 200 } });
    const professors = (profRes.ok && profRes.data.rows) || [];

    const m = UI.modal({ title: "Edit class", subtitle: `${c.class_name}`, size: "lg", footer: `
      <button class="btn secondary cancel">Cancel</button>
      <button class="btn ok" id="clsSave">Save changes</button>` });
    m.body.innerHTML = `
      <form id="clsForm" novalidate>
        <div class="form-row">
          <div class="field"><label>Class name *</label><input type="text" name="class_name" value="${UI.escapeHtml(c.class_name)}" required /></div>
          <div class="field"><label>Subject name</label><input type="text" name="subject_name" value="${UI.escapeHtml(c.subject_name || "")}" /></div>
        </div>
        <div class="form-row">
          <div class="field"><label>Class code</label><input type="text" name="class_code" value="${UI.escapeHtml(c.class_code || "")}" /></div>
          <div class="field"><label>Subject code</label><input type="text" name="subject_code" value="${UI.escapeHtml(c.subject_code || "")}" /></div>
          <div class="field"><label>Join code</label><input type="text" name="join_code" value="${UI.escapeHtml(c.join_code || "")}" /></div>
        </div>
        <div class="form-row">
          <div class="field"><label>Professor (reassign)</label>
            <select name="professor_id" required>
              ${professors.map(p => `<option value="${p.id}" ${p.id === c.professor_id ? "selected" : ""}>${UI.escapeHtml(p.full_name)} (${UI.escapeHtml(p.id_number)})</option>`).join("")}
            </select></div>
          <div class="field"><label>Year level</label>
            <select name="year_level">${YEARS.map(y => `<option ${c.year_level === y ? "selected" : ""}>${y}</option>`).join("")}</select></div>
          <div class="field"><label>Department</label><input type="text" name="department" value="${UI.escapeHtml(c.department || "")}" /></div>
        </div>
        <div class="form-row">
          <div class="field"><label>Section</label><input type="text" name="section" value="${UI.escapeHtml(c.section || "")}" /></div>
          <div class="field"><label>Track</label><input type="text" name="track" value="${UI.escapeHtml(c.track || "")}" /></div>
          <div class="field"><label>Schedule days</label><input type="text" name="schedule_days" value="${UI.escapeHtml(c.schedule_days || "")}" placeholder="e.g. Mon, Wed" /></div>
        </div>
        <div class="form-row">
          <div class="field"><label>Start time</label><input type="time" name="schedule_start_time" value="${c.schedule_start_time ? c.schedule_start_time.slice(0, 5) : ""}" /></div>
          <div class="field"><label>End time</label><input type="time" name="schedule_end_time" value="${c.schedule_end_time ? c.schedule_end_time.slice(0, 5) : ""}" /></div>
          <div class="field"><label>Theme color</label><input type="text" name="theme_color" value="${UI.escapeHtml(c.theme_color || "")}" placeholder="#4338ca" /></div>
        </div>
        <div class="field"><label>Cover image URL</label><input type="url" name="cover_image_url" value="${UI.escapeHtml(c.cover_image_url || "")}" /></div>
      </form>`;
    m.foot.querySelector(".cancel").addEventListener("click", m.close);
    m.foot.querySelector("#clsSave").addEventListener("click", async (e) => {
      const form = m.body.querySelector("#clsForm");
      if (!form.reportValidity()) return;
      const btn = e.target; btn.disabled = true;
      const data = Object.fromEntries(new FormData(form).entries());
      const res = await API.callRpc("admin_update_class", { p_class_id: id, p_data: data });
      if (!res.ok) { btn.disabled = false; UI.toast(res.error, "error"); return; }
      UI.toast("Class updated.", "success");
      m.close(); dt.reload();
    });
  }

  /* ================= ARCHIVE / DELETE ================= */
  function archiveClass(id, archive, dt) {
    UI.confirm({
      title: archive ? "Archive class?" : "Restore class?",
      message: archive
        ? "The class is flagged as archived in the admin system. It stays visible in the mobile app — a true hide would change the app's schema, which is off-limits. Use this to mark classes you plan to remove."
        : "Remove the archived flag from this class.",
      okText: archive ? "Archive" : "Restore",
      danger: archive,
    }).then(async ok => {
      if (!ok) return;
      const res = await API.callRpc(archive ? "admin_archive_class" : "admin_unarchive_class", { p_class_id: id });
      if (!res.ok) { UI.toast(res.error, "error"); return; }
      UI.toast(archive ? "Class archived." : "Class restored.", "success");
      dt.reload();
    });
  }

  function deleteClass(id, dt) {
    UI.confirm({
      title: "Delete class — permanent",
      message: "This permanently deletes the class, its enrollments, assignments, submissions and attendance from the database. This cannot be undone. An audit snapshot is kept.",
      okText: "Delete class", danger: true,
    }).then(async ok => {
      if (!ok) return;
      const res = await API.callRpc("admin_delete_class", { p_class_id: id, p_force: true });
      if (!res.ok) { UI.toast(res.error, "error"); return; }
      UI.toast("Class deleted (snapshot kept in audit log).", "success");
      dt.reload();
    });
  }

  /* ================= DETAIL ================= */
  async function renderDetail(view, params) {
    view.innerHTML = UI.loading("Loading class\u2026");
    const id = params.id;
    const r = await getClass(id);
    if (!r.ok || !r.data) {
      view.innerHTML = `<div class="card card-body">${UI.empty(r.ok ? "Class not found." : r.error, "alert", "Not found")}</div>`;
      return;
    }
    const c = r.data;
    let activeTab = "students";

    view.innerHTML = `
      <a href="#/classes" class="btn ghost sm" style="margin-bottom:12px">${UI.icon("arrowLeft")} All classes</a>
      <div class="detail-head">
        <div style="width:64px;height:64px;border-radius:14px;background:${UI.escapeHtml(c.theme_color || "#4338ca")};display:grid;place-items:center;font-size:1.6rem;color:#fff;flex-shrink:0">
          ${c.cover_image_url ? `<img src="${UI.escapeHtml(c.cover_image_url)}" style="width:100%;height:100%;object-fit:cover;border-radius:14px" onerror="this.style.display='none'" alt="">` : '<svg class="icn lg" viewBox="0 0 24 24" aria-hidden="true"><path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/></svg>'}
        </div>
        <div class="dt">
          <h1>${UI.escapeHtml(c.class_name)}</h1>
          <div class="sub">
            ${UI.escapeHtml(c.subject_name || "No subject")} &middot; <span class="mono">${UI.escapeHtml(c.class_code)}</span>
            &middot; ${UI.badge(c.year_level)}
            ${c.is_archived ? " " + UI.badge("archived", "danger") : ""}
          </div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn secondary" id="detEdit">Edit</button>
          <button class="btn ghost" id="detArchive">${c.is_archived ? "Restore" : "Archive"}</button>
          <button class="btn danger outline" id="detDelete">Delete</button>
        </div>
      </div>

      <div class="card" style="margin-bottom:16px">
        <div class="card-body" style="display:flex;flex-wrap:wrap;gap:24px">
          <div><div class="stat-label" style="font-size:.74rem;font-weight:650;color:var(--text-3)">Professor</div>
            <div style="margin-top:4px;display:flex;align-items:center;gap:8px">${UI.avatar(c.professor_name, null)}<b>${UI.escapeHtml(c.professor_name || "—")}</b></div></div>
          <div><div class="stat-label" style="font-size:.74rem;font-weight:650;color:var(--text-3)">Schedule</div>
            <div style="margin-top:4px"><b>${UI.escapeHtml(c.schedule_days || "—")}</b><br><span class="muted small">${c.schedule_start_time ? UI.fmtTime(c.schedule_start_time) + " – " + UI.fmtTime(c.schedule_end_time) : ""}</span></div></div>
          <div><div class="stat-label" style="font-size:.74rem;font-weight:650;color:var(--text-3)">Department</div>
            <div style="margin-top:4px"><b>${UI.escapeHtml(c.department || "—")}</b><br><span class="muted small">${UI.escapeHtml([c.section, c.track].filter(Boolean).join(" · ") || "")}</span></div></div>
          <div><div class="stat-label" style="font-size:.74rem;font-weight:650;color:var(--text-3)">Enrolled</div>
            <div style="margin-top:4px"><b>${UI.escapeHtml(c.enrollment_count ?? 0)}</b> students</div></div>
          <div><div class="stat-label" style="font-size:.74rem;font-weight:650;color:var(--text-3)">Assignments</div>
            <div style="margin-top:4px"><b>${UI.escapeHtml(c.assignment_count ?? 0)}</b> posted</div></div>
        </div>
      </div>

      <div class="card">
        <div class="tab-bar" id="detTabs">
          <button class="tab active" data-tab="students">Students</button>
          <button class="tab" data-tab="requests">Join requests</button>
          <button class="tab" data-tab="assignments">Assignments</button>
        </div>
        <div id="detContent"></div>
      </div>`;

    view.querySelector("#detEdit").addEventListener("click", () => openEdit(id, { reload: () => Pages.classDetail.render(view, params) }));
    view.querySelector("#detArchive").addEventListener("click", () => archiveClass(id, !c.is_archived, { reload: () => Pages.classDetail.render(view, params) }));
    view.querySelector("#detDelete").addEventListener("click", () => deleteClass(id, { reload: () => Router.go("/classes") }));

    view.querySelector("#detTabs").addEventListener("click", (e) => {
      const tab = e.target.closest(".tab");
      if (!tab) return;
      activeTab = tab.dataset.tab;
      view.querySelectorAll("#detTabs .tab").forEach(t => t.classList.toggle("active", t === tab));
      loadTab(activeTab);
    });

    const content = view.querySelector("#detContent");

    async function loadTab(tab) {
      content.innerHTML = UI.loading();
      if (tab === "students") {
        const r2 = await API.callRpc("admin_list_users", { p_filters: { class_id: id, page: 1, page_size: 500 } });
        if (!r2.ok) { content.innerHTML = UI.empty(r2.error, "alert"); return; }
        const rows = r2.data.rows || [];
        const html = `
          <div style="padding:14px 18px;display:flex;justify-content:flex-end">
            <button class="btn sm" id="enrollBtn">${UI.icon("plus")} Enroll student</button>
          </div>
          <div class="card-body flush">${rows.length ? `<table class="table"><thead><tr><th>Student</th><th>ID number</th><th>Year</th></tr></thead><tbody>
            ${rows.map(s => `<tr>
              <td>${UI.avatar(s.full_name, s.profile_picture_url)} <span class="cell-main">${UI.escapeHtml(s.full_name)}</span></td>
              <td class="mono">${UI.escapeHtml(s.id_number)}</td>
              <td>${UI.escapeHtml(s.year_level || "—")}</td>
            </tr>`).join("")}</tbody></table>` : UI.empty("No students enrolled.", "users")}</div>`;
        content.innerHTML = html;
        content.querySelector("#enrollBtn").addEventListener("click", () => openEnroll(id, () => loadTab("students")));
      } else if (tab === "requests") {
        const r2 = await API.callRpc("admin_list_join_requests", { p_filters: { class_id: id, page: 1, page_size: 200 } });
        if (!r2.ok) { content.innerHTML = UI.empty(r2.error, "alert"); return; }
        const rows = r2.data.rows || [];
        const pending = rows.filter(x => x.status === "pending");
        const decided = rows.filter(x => x.status !== "pending");
        let html = `<div class="card-body flush">`;
        html += `<div class="card-head" style="border-bottom:1px solid var(--border)"><h3>Pending (${pending.length})</h3></div>`;
        html += pending.length ? `<table class="table"><thead><tr><th>Student</th><th>ID number</th><th>Requested</th><th></th></tr></thead><tbody>
          ${pending.map(q => `<tr>
            <td><a href="#/users/${q.student_id}"><span class="cell-main">${UI.escapeHtml(q.student_name)}</span></a></td>
            <td class="mono">${UI.escapeHtml(q.student_id_number)}</td>
            <td class="muted small">${UI.timeAgo(q.requested_at)}</td>
            <td style="display:flex;gap:6px;justify-content:flex-end">
              <button class="act success" data-req="approve" data-id="${q.id}" title="Approve">${UI.icon("check")}</button>
              <button class="act danger" data-req="reject" data-id="${q.id}" title="Reject">${UI.icon("x")}</button>
            </td>
          </tr>`).join("")}</tbody></table>` : UI.empty("No pending requests.", "inbox");
        html += `<div class="card-head" style="border-bottom:1px solid var(--border)"><h3>Decided (${decided.length})</h3></div>`;
        html += decided.length ? `<table class="table"><thead><tr><th>Student</th><th>ID number</th><th>Status</th><th>Decided</th></tr></thead><tbody>
          ${decided.map(q => `<tr>
            <td><span class="cell-main">${UI.escapeHtml(q.student_name)}</span></td>
            <td class="mono">${UI.escapeHtml(q.student_id_number)}</td>
            <td>${UI.badge(q.status)}</td>
            <td class="muted small">${UI.fmtDateTime(q.decided_at)}</td>
          </tr>`).join("")}</tbody></table>` : UI.empty("Nothing decided yet.", "inbox");
        html += `</div>`;
        content.innerHTML = html;
        content.querySelectorAll("[data-req]").forEach(b => b.addEventListener("click", async () => {
          const action = b.dataset.req;
          const ok = await UI.confirm({
            title: action === "approve" ? "Approve join request?" : "Reject join request?",
            message: action === "approve" ? "The student will be enrolled in this class." : "The student will not be enrolled.",
            okText: action === "approve" ? "Approve" : "Reject",
            danger: action === "reject",
          });
          if (!ok) return;
          const res = await API.callRpc("admin_decide_join_request", { p_request_id: b.dataset.id, p_decision: action });
          if (!res.ok) { UI.toast(res.error, "error"); return; }
          UI.toast(action === "approve" ? "Request approved." : "Request rejected.", "success");
          loadTab("requests");
        }));
      } else if (tab === "assignments") {
        const r2 = await API.callRpc("admin_list_assignments", { p_filters: { class_id: id, page: 1, page_size: 200 } });
        if (!r2.ok) { content.innerHTML = UI.empty(r2.error, "alert"); return; }
        const rows = r2.data.rows || [];
        content.innerHTML = `<div class="card-body flush">${rows.length ? `<table class="table"><thead><tr><th>Title</th><th>Type</th><th>Category</th><th>Due</th><th>Submissions</th><th></th></tr></thead><tbody>
          ${rows.map(a => `<tr>
            <td><span class="cell-main">${UI.escapeHtml(a.title)}</span><br><span class="cell-sub">${UI.escapeHtml(a.assignment_type)} · ${UI.escapeHtml(a.target_points ?? "")} pts</span></td>
            <td>${UI.badge(a.assignment_type)}</td>
            <td class="muted">${UI.escapeHtml(a.category || "—")}</td>
            <td class="small">${a.end_date ? UI.fmtDate(a.end_date) : "—"}</td>
            <td>${UI.escapeHtml(a.submission_count ?? 0)} <span class="muted">/ ${UI.escapeHtml(a.enrolled_student_count ?? 0)}</span><br>${a.ungraded_count ? UI.badge("ungraded: " + a.ungraded_count, "warning") : UI.badge("all graded", "success")}</td>
            <td><button class="act primary" data-assign="${a.id}" title="Submissions">${UI.icon("arrowUpRight")}</button></td>
          </tr>`).join("")}</tbody></table>` : UI.empty("No assignments posted.", "file")}</div>`;
        content.querySelectorAll("[data-assign]").forEach(b => b.addEventListener("click", () => {
          Router.go("/submissions?assignment=" + b.dataset.assign);
        }));
      }
    }
    loadTab("students");
  }

  /* ================= ENROLL ================= */
  function openEnroll(classId, after) {
    const m = UI.modal({ title: "Enroll a student", subtitle: "Search students and pick one to enroll", size: "sm", footer: `
      <button class="btn secondary cancel">Cancel</button>` });
    m.body.innerHTML = `
      <div class="field"><label>Search student</label><input type="search" id="enrollSearch" placeholder="Name or ID number" /></div>
      <div id="enrollResults" style="max-height:300px;overflow-y:auto;margin-top:8px">${UI.loading()}</div>`;
    m.foot.querySelector(".cancel").addEventListener("click", m.close);
    const results = m.body.querySelector("#enrollResults");
    const input = m.body.querySelector("#enrollSearch");

    async function search(q) {
      results.innerHTML = UI.loading("Searching\u2026");
      const res = await API.callRpc("admin_list_users", { p_filters: { role: "student", search: q || null, page: 1, page_size: 30 } });
      if (!res.ok) { results.innerHTML = UI.empty(res.error, "alert"); return; }
      const rows = res.data.rows || [];
      if (!rows.length) { results.innerHTML = UI.empty("No students matched.", "search"); return; }
      results.innerHTML = rows.map(s => `
        <div style="display:flex;align-items:center;gap:10px;padding:9px 10px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;cursor:pointer" data-pick="${s.id}">
          ${UI.avatar(s.full_name, s.profile_picture_url)}
          <div style="flex:1"><div style="font-weight:600;font-size:.86rem">${UI.escapeHtml(s.full_name)}</div><div class="small muted mono">${UI.escapeHtml(s.id_number)}</div></div>
          <button class="btn sm" style="pointer-events:none">${UI.icon("plus")} Enroll</button>
        </div>`).join("");
      results.querySelectorAll("[data-pick]").forEach(el => el.addEventListener("click", async () => {
        const res = await API.callRpc("admin_enroll_student", { p_class_id: classId, p_student_id: el.dataset.pick });
        if (!res.ok) { UI.toast(res.error, "error"); return; }
        UI.toast("Student enrolled.", "success");
        m.close(); after();
      }));
    }
    input.addEventListener("input", UI.debounce(() => search(input.value.trim()), 350));
    search("");
  }

  return {
    render(view, params) {
      if (params.id) return renderDetail(view, params);
      return renderList(view, params);
    },
    renderDetail,
  };
})();

Pages.classDetail = { render: (view, params) => Pages.classes.renderDetail(view, params) };