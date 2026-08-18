/* ============================================================
   Pages.users — list, search/filter, create, edit, block/unblock,
   password reset, and the per-user detail view (classes,
   submissions, attendance). Only RPC calls — never direct tables.
   ============================================================ */
window.Pages = window.Pages || {};
Pages.users = (() => {

  const YEARS = ["first", "second", "third", "fourth"];
  const ROLES = ["student", "professor"];

  function statusBadge(u) {
    if (u.is_blocked) return UI.badge("blocked", "danger");
    return UI.badge("active", "success");
  }

  /* ================= LIST ================= */
  async function renderList(view, params) {
    const initQuery = (params.query && params.query.role) || "";

    const courseRes = await API.callRpc("admin_list_users", { p_filters: { page: 1, page_size: 200 } });
    const courseSet = new Set();
    ((courseRes.ok && courseRes.data.rows) || []).forEach(u => { if (u.course) courseSet.add(u.course); });
    const courses = [...courseSet].sort();

    const dt = UI.datatable({
      columns: [
        { label: "User", sortable: true, sortBy: "full_name" },
        { label: "ID number", sortable: true, sortBy: "id_number" },
        { label: "Role" },
        { label: "Program" },
        { label: "Contact" },
        { label: "Status" },
        { label: "Joined" },
        { label: "", },
      ],
      emptyText: "No users found.",
      emptyIcon: "users",
      defaultSortBy: "created_at",
      loader: async (state) => {
        const filters = { ...state.filters, search: state.search || null, page: state.page, page_size: state.pageSize };
        if (state.sortBy) { filters.sort_by = state.sortBy; filters.sort_dir = state.sortDir; }
        const res = await API.callRpc("admin_list_users", { p_filters: filters });
        return res;
      },
      toolbarFilters(el, setFilter, filters) {
        el.appendChild(UI.select(ROLES, { value: filters.role || "", onChange: v => setFilter("role", v), placeholder: "All roles" }));
        el.appendChild(UI.select(YEARS, { value: filters.year_level || "", onChange: v => setFilter("year_level", v), placeholder: "All years" }));
        if (courses.length) el.appendChild(UI.select(courses, { value: filters.course || "", onChange: v => setFilter("course", v), placeholder: "All courses" }));
        el.appendChild(UI.select([
          { value: "true", label: "Blocked" }, { value: "false", label: "Active" },
        ], { value: filters.is_blocked || "", onChange: v => setFilter("is_blocked", v), placeholder: "All statuses" }));
      },
      renderRow(u) {
        const blocked = u.is_blocked;
        return `<tr class="${blocked ? "row-danger" : ""}">
          <td>
            <a href="#/users/${u.id}" style="display:flex;align-items:center;gap:10px">
              ${UI.avatar(u.full_name, u.profile_picture_url)}
              <span><span class="cell-main">${UI.escapeHtml(u.full_name)}</span><br><span class="cell-sub">${UI.escapeHtml(u.email || "")}</span></span>
            </a>
          </td>
          <td class="mono">${UI.escapeHtml(u.id_number)}</td>
          <td>${UI.badge(u.role)}</td>
          <td>
            <div class="cell-main" style="font-size:.8rem">${UI.escapeHtml(u.course || "—")}</div>
            <div class="cell-sub">${UI.escapeHtml([u.year_level, u.section].filter(Boolean).join(" · ") || "—")}</div>
          </td>
          <td class="muted">${UI.escapeHtml(u.phone_number || "—")}</td>
          <td>${statusBadge(u)}</td>
          <td class="muted small">${UI.fmtDate(u.created_at)}</td>
          <td>
            <div class="table-actions">
              <a class="act primary" href="#/users/${u.id}" title="View">${UI.icon("eye")}</a>
              <button class="act primary" data-act="edit" data-id="${u.id}" title="Edit">${UI.icon("pencil")}</button>
              ${blocked
                ? `<button class="act success" data-act="unblock" data-id="${u.id}" title="Unblock">${UI.icon("shieldCheck")}</button>`
                : `<button class="act danger" data-act="block" data-id="${u.id}" title="Block">${UI.icon("shieldOff")}</button>`}
              <button class="act" data-act="reset" data-id="${u.id}" title="Reset password">${UI.icon("key")}</button>
              ${Auth.canEdit() ? `<button class="act danger" data-act="delete" data-id="${u.id}" title="Delete">${UI.icon("trash")}</button>` : ""}
            </div>
          </td>
        </tr>`;
      },
    });

    /* delegate row actions */
    dt.element.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      const id = btn.dataset.id;
      const act = btn.dataset.act;
      if (act === "edit") openEdit(id, dt);
      else if (act === "block") blockUser(id, true, dt);
      else if (act === "unblock") blockUser(id, false, dt);
      else if (act === "reset") openReset(id, dt);
      else if (act === "delete") deleteUser(id, dt);
    });

    view.innerHTML = `
      <div class="section-title">
        <h1>Users</h1>
        <div class="actions"><button class="btn" id="createUserBtn">${UI.icon("plus")} New user</button></div>
      </div>
      <div id="usersTable"></div>`;

    view.querySelector("#usersTable").appendChild(dt.element);
    if (initQuery) dt.setFilter("role", initQuery);

    view.querySelector("#createUserBtn").addEventListener("click", () => openCreate(dt));
  }

  async function fetchRow(id) {
    // no-op placeholder (kept for clarity) — rows are edited by id
    return id;
  }

  /* fetch a single user row via admin_get_user */
  async function getUser(id) {
    const res = await API.callRpc("admin_get_user", { p_user_id: id });
    return res;
  }

  /* ================= CREATE ================= */
  function openCreate(dt) {
    const m = UI.modal({ title: "New user", subtitle: "Create a student or professor account", size: "lg", footer: `
      <button class="btn secondary cancel">Cancel</button>
      <button class="btn ok" id="createSubmit">Create user</button>` });
    m.body.innerHTML = `
      <form id="userCreateForm" novalidate>
        <div class="form-row">
          <div class="field"><label>Full name *</label><input type="text" name="full_name" required /></div>
          <div class="field"><label>ID number *</label><input type="text" name="id_number" required /></div>
        </div>
        <div class="form-row">
          <div class="field"><label>Role *</label>
            <select name="role" required>
              <option value="student">student</option>
              <option value="professor">professor</option>
            </select></div>
          <div class="field"><label>Temporary password *</label><input type="password" name="password" required minlength="6" /></div>
        </div>
        <div class="form-row">
          <div class="field"><label>Email</label><input type="email" name="email" /></div>
          <div class="field"><label>Phone</label><input type="text" name="phone_number" /></div>
        </div>
        <div class="form-row">
          <div class="field"><label>Course</label><input type="text" name="course" /></div>
          <div class="field"><label>Year level</label>
            <select name="year_level"><option value="">—</option>${YEARS.map(y => `<option>${y}</option>`).join("")}</select></div>
          <div class="field"><label>Section</label><input type="text" name="section" /></div>
          <div class="field"><label>Track</label><input type="text" name="track" /></div>
        </div>
        <div class="field"><label>Bio</label><textarea name="bio" rows="2"></textarea></div>
      </form>`;
    m.foot.querySelector(".cancel").addEventListener("click", m.close);
    m.foot.querySelector("#createSubmit").addEventListener("click", async (e) => {
      const form = m.body.querySelector("#userCreateForm");
      if (!form.reportValidity()) return;
      const btn = e.target; btn.disabled = true;
      const data = Object.fromEntries(new FormData(form).entries());
      const res = await API.callRpc("admin_create_user", { p_data: data });
      if (!res.ok) { btn.disabled = false; UI.toast(res.error, "error"); return; }
      UI.toast("User created.", "success");
      m.close(); dt.reload();
    });
  }

  /* ================= EDIT ================= */
  async function openEdit(id, dt) {
    const res = await getUser(id);
    if (!res.ok) { UI.toast(res.error, "error"); return; }
    const u = res.data;
    const m = UI.modal({ title: "Edit user", subtitle: `${u.full_name}`, size: "lg", footer: `
      <button class="btn secondary cancel">Cancel</button>
      <button class="btn ok" id="editSubmit">Save changes</button>` });
    m.body.innerHTML = `
      <div class="info-box">ID number, role and block status cannot be changed here. Use the row actions for blocking.</div>
      <form id="userEditForm" novalidate>
        <div class="form-row">
          <div class="field"><label>Full name</label><input type="text" name="full_name" value="${UI.escapeHtml(u.full_name)}" required /></div>
          <div class="field"><label>ID number</label><input type="text" value="${UI.escapeHtml(u.id_number)}" disabled /></div>
        </div>
        <div class="form-row">
          <div class="field"><label>Email</label><input type="email" name="email" value="${UI.escapeHtml(u.email || "")}" /></div>
          <div class="field"><label>Phone</label><input type="text" name="phone_number" value="${UI.escapeHtml(u.phone_number || "")}" /></div>
        </div>
        <div class="form-row">
          <div class="field"><label>Course</label><input type="text" name="course" value="${UI.escapeHtml(u.course || "")}" /></div>
          <div class="field"><label>Year level</label>
            <select name="year_level"><option value="">—</option>${YEARS.map(y => `<option ${u.year_level === y ? "selected" : ""}>${y}</option>`).join("")}</select></div>
          <div class="field"><label>Section</label><input type="text" name="section" value="${UI.escapeHtml(u.section || "")}" /></div>
          <div class="field"><label>Track</label><input type="text" name="track" value="${UI.escapeHtml(u.track || "")}" /></div>
        </div>
        <div class="field"><label>Profile picture URL</label><input type="url" name="profile_picture_url" value="${UI.escapeHtml(u.profile_picture_url || "")}" /></div>
        <div class="field"><label>Bio</label><textarea name="bio" rows="3">${UI.escapeHtml(u.bio || "")}</textarea></div>
      </form>`;
    m.foot.querySelector(".cancel").addEventListener("click", m.close);
    m.foot.querySelector("#editSubmit").addEventListener("click", async (e) => {
      const form = m.body.querySelector("#userEditForm");
      if (!form.reportValidity()) return;
      const btn = e.target; btn.disabled = true;
      const data = Object.fromEntries(new FormData(form).entries());
      const res = await API.callRpc("admin_update_user", { p_user_id: id, p_data: data });
      if (!res.ok) { btn.disabled = false; UI.toast(res.error, "error"); return; }
      UI.toast("User updated.", "success");
      m.close(); dt.reload();
    });
  }

  /* ================= BLOCK / UNBLOCK ================= */
  function blockUser(id, block, dt) {
    const label = block ? "Block" : "Unblock";
    UI.confirm({
      title: `${label} user?`,
      message: block
        ? "The user will be unable to sign in to the Panthraa app. Existing records are kept. You can unblock them anytime."
        : "The user will be able to sign in again.",
      okText: label, danger: block,
    }).then(async (ok) => {
      if (!ok) return;
      const res = await API.callRpc(block ? "admin_block_user" : "admin_unblock_user", { p_user_id: id });
      if (!res.ok) { UI.toast(res.error, "error"); return; }
      UI.toast(`User ${label.toLowerCase()}d.`, "success");
      dt.reload();
    });
  }

  /* ================= DELETE ================= */
  function deleteUser(id, dt) {
    UI.confirm({
      title: "Delete user — permanent",
      message: "This permanently removes the user and all their records (classes they own, enrollments, submissions, attendance). This cannot be undone. An audit snapshot is kept.",
      okText: "Delete user", danger: true,
    }).then(async (ok) => {
      if (!ok) return;
      const res = await API.callRpc("admin_delete_user", { p_user_id: id, p_force: true });
      if (!res.ok) { UI.toast(res.error, "error"); return; }
      UI.toast("User deleted (snapshot kept in audit log).", "success");
      if (dt && dt.reload) dt.reload();
    });
  }

  /* ================= RESET PASSWORD ================= */
  function openReset(id, dt) {
    const m = UI.modal({ title: "Reset password", subtitle: "Set a new password for this user", size: "sm", footer: `
      <button class="btn secondary cancel">Cancel</button>
      <button class="btn ok" id="resetSubmit">Set password</button>` });
    m.body.innerHTML = `
      <div class="info-box">The new password follows the same rules as the app. It is written to <span class="mono">app_users.password</span> and never stored in logs.</div>
      <div class="field"><label>New password *</label><input type="password" id="newPw" minlength="6" required /></div>
      <div class="field"><label>Confirm password *</label><input type="password" id="newPw2" required /></div>
      <div class="field error" id="pwErr" style="display:none">Passwords do not match.</div>`;
    m.foot.querySelector(".cancel").addEventListener("click", m.close);
    m.foot.querySelector("#resetSubmit").addEventListener("click", async (e) => {
      const pw = m.body.querySelector("#newPw").value;
      const pw2 = m.body.querySelector("#newPw2").value;
      const err = m.body.querySelector("#pwErr");
      if (!pw) { err.textContent = "Password is required."; err.style.display = "block"; return; }
      if (pw !== pw2) { err.textContent = "Passwords do not match."; err.style.display = "block"; return; }
      err.style.display = "none";
      const btn = e.target; btn.disabled = true;
      const res = await API.callRpc("admin_reset_user_password", { p_user_id: id, p_new_password: pw });
      if (!res.ok) { btn.disabled = false; UI.toast(res.error, "error"); return; }
      UI.toast("Password reset.", "success");
      m.close();
    });
  }

  /* ================= DETAIL ================= */
  async function renderDetail(view, params) {
    view.innerHTML = UI.loading("Loading user\u2026");
    const id = params.id;
    const res = await getUser(id);
    if (!res.ok) {
      view.innerHTML = `<div class="card card-body">${UI.empty("Could not load this user.", "alert", "Not found")}</div>`;
      return;
    }
    const u = res.data;

    const tabs = [
      { id: "classes", label: `Classes` },
      { id: "submissions", label: "Submissions" },
      { id: "attendance", label: "Attendance" },
    ];
    let activeTab = "classes";

    view.innerHTML = `
      <a href="#/users" class="btn ghost sm" style="margin-bottom:12px">${UI.icon("arrowLeft")} All users</a>
      <div class="detail-head">
        ${UI.avatar(u.full_name, u.profile_picture_url, "lg")}
        <div class="dt">
          <h1>${UI.escapeHtml(u.full_name)}</h1>
          <div class="sub">${UI.escapeHtml(u.id_number)} &middot; ${UI.badge(u.role)} ${statusBadge(u)}</div>
        </div>
        <div class="actions" style="display:flex;gap:8px">
          <button class="btn secondary" id="detEdit">Edit</button>
          ${u.is_blocked
            ? `<button class="btn success" id="detBlock">Unblock</button>`
            : `<button class="btn danger outline" id="detBlock">Block</button>`}
          <button class="btn ghost" id="detReset" title="Reset password">${UI.icon("key")}</button>
          ${Auth.canEdit() ? `<button class="btn danger outline" id="detDelete">Delete</button>` : ""}
        </div>
      </div>

      <div class="detail-grid">
        <div class="card">
          <div class="card-head"><h3>Profile</h3></div>
          <div class="card-body">
            <div class="kv">
              <div class="kv-row"><span class="k">Email</span><span class="v">${UI.escapeHtml(u.email || "—")}</span></div>
              <div class="kv-row"><span class="k">Phone</span><span class="v">${UI.escapeHtml(u.phone_number || "—")}</span></div>
              <div class="kv-row"><span class="k">Course</span><span class="v">${UI.escapeHtml(u.course || "—")}</span></div>
              <div class="kv-row"><span class="k">Year / Section</span><span class="v">${UI.escapeHtml([u.year_level, u.section].filter(Boolean).join(" · ") || "—")}</span></div>
              <div class="kv-row"><span class="k">Track</span><span class="v">${UI.escapeHtml(u.track || "—")}</span></div>
              <div class="kv-row"><span class="k">Joined</span><span class="v">${UI.fmtDate(u.created_at)}</span></div>
              <div class="kv-row"><span class="k">Status</span><span class="v">${statusBadge(u)}</span></div>
            </div>
            ${u.bio ? `<div style="margin-top:12px;font-size:.84rem;color:var(--text-2)">${UI.escapeHtml(u.bio)}</div>` : ""}
          </div>
        </div>

        <div class="card">
          <div class="tab-bar" id="detTabs">
            ${tabs.map(t => `<button class="tab ${t.id === activeTab ? "active" : ""}" data-tab="${t.id}">${t.label}</button>`).join("")}
          </div>
          <div id="detContent"></div>
        </div>
      </div>`;

    view.querySelector("#detEdit").addEventListener("click", () => openEdit(id, { reload: () => Pages.userDetail.render(view, params) }));
    view.querySelector("#detBlock").addEventListener("click", () => blockUser(id, !u.is_blocked, { reload: () => Pages.userDetail.render(view, params) }));
    view.querySelector("#detReset").addEventListener("click", () => openReset(id, { reload: () => Pages.userDetail.render(view, params) }));
    const delBtn = view.querySelector("#detDelete");
    if (delBtn) delBtn.addEventListener("click", () => deleteUser(id, { reload: () => Router.go("/users") }));

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
      if (tab === "classes") {
        const r = await API.callRpc("admin_list_classes", { p_filters: { student_id: id, page: 1, page_size: 100 } });
        if (!r.ok) { content.innerHTML = UI.empty(r.error, "alert"); return; }
        const rows = r.data.rows || [];
        if (!rows.length) { content.innerHTML = UI.empty("Not enrolled in any classes.", "classes"); return; }
        content.innerHTML = `<div class="card-body flush"><table class="table"><thead><tr><th>Class</th><th>Code</th><th>Schedule</th><th>Year</th><th></th></tr></thead><tbody>
          ${rows.map(c => `<tr>
            <td><a href="#/classes/${c.id}"><span class="cell-main">${UI.escapeHtml(c.class_name)}</span></a><br><span class="cell-sub">${UI.escapeHtml(c.subject_name || "")}</span></td>
            <td class="mono">${UI.escapeHtml(c.class_code)}</td>
            <td class="muted small">${UI.escapeHtml(c.schedule_days || "—")} ${c.schedule_start_time ? "· " + UI.fmtTime(c.schedule_start_time) : ""}</td>
            <td>${UI.badge(c.year_level)}</td>
            <td><a class="act primary" href="#/classes/${c.id}" title="Open class">${UI.icon("arrowUpRight")}</a></td>
          </tr>`).join("")}
        </tbody></table></div>`;
      } else if (tab === "submissions") {
        const r = await API.callRpc("admin_list_submissions", { p_filters: { student_id: id, page: 1, page_size: 100 } });
        if (!r.ok) { content.innerHTML = UI.empty(r.error, "alert"); return; }
        const rows = r.data.rows || [];
        if (!rows.length) { content.innerHTML = UI.empty("No submissions yet.", "award"); return; }
        content.innerHTML = `<div class="card-body flush"><table class="table"><thead><tr><th>Assignment</th><th>Class</th><th>Submitted</th><th>Score</th><th></th></tr></thead><tbody>
          ${rows.map(s => `<tr>
            <td><span class="cell-main">${UI.escapeHtml(s.assignment_title)}</span></td>
            <td class="muted">${UI.escapeHtml(s.class_name)}</td>
            <td class="small">${UI.fmtDateTime(s.submitted_at)}</td>
            <td>${s.score == null ? UI.badge("ungraded", "warning") : `<span class="cell-main">${UI.escapeHtml(s.score)}<span class="muted">/${UI.escapeHtml(s.target_points ?? "")}</span></span>`}</td>
            <td><button class="act primary" data-sub="${s.id}" title="Grade">${UI.icon("pencil")}</button></td>
          </tr>`).join("")}
        </tbody></table></div>`;
        content.querySelectorAll("[data-sub]").forEach(b => b.addEventListener("click", () => {
          const sub = rows.find(x => x.id === b.dataset.sub);
          Pages.submissions.openGrade(sub, () => loadTab("submissions"));
        }));
      } else if (tab === "attendance") {
        const r = await API.callRpc("admin_list_attendance", { p_filters: { student_id: id, page: 1, page_size: 100 } });
        if (!r.ok) { content.innerHTML = UI.empty(r.error, "alert"); return; }
        const rows = r.data.rows || [];
        if (!rows.length) { content.innerHTML = UI.empty("No attendance records. Absences are inferred by missing rows.", "list"); return; }
        content.innerHTML = `<div class="card-body flush"><table class="table"><thead><tr><th>Class</th><th>Assignment</th><th>Date</th><th>Status</th></tr></thead><tbody>
          ${rows.map(a => `<tr>
            <td class="muted">${UI.escapeHtml(a.class_name)}</td>
            <td>${UI.escapeHtml(a.assignment_title || "—")}</td>
            <td>${UI.fmtDate(a.attendance_date)}</td>
            <td>${UI.badge(a.status || "present")}</td>
          </tr>`).join("")}
        </tbody></table></div>`;
      }
    }
    loadTab(activeTab);
  }

  return {
    render(view, params) {
      if (params.id) return renderDetail(view, params);
      return renderList(view, params);
    },
    renderDetail,
  };
})();

Pages.userDetail = { render: (view, params) => Pages.users.renderDetail(view, params) };