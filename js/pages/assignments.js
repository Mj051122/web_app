/* ============================================================
   Pages.assignments — every material/task/quiz/exam, due dates,
   submission health (missing / ungraded), edit/delete invalid
   ones. Links into the submissions page.
   ============================================================ */
window.Pages = window.Pages || {};
Pages.assignments = {
  render(view, params) {
    const initClass = (params.query && params.query.class_id) || "";

    const dt = UI.datatable({
      columns: [
        { label: "Assignment", sortable: true, sortBy: "title" },
        { label: "Class" },
        { label: "Type" },
        { label: "Due" },
        { label: "Submissions", sortable: true, sortBy: "submission_count" },
        { label: "Health" },
        { label: "" },
      ],
      emptyText: "No assignments found.",
      emptyIcon: "file",
      defaultSortBy: "created_at",
      loader: async (state) => {
        const filters = { ...state.filters, search: state.search || null, page: state.page, page_size: state.pageSize };
        if (state.sortBy) { filters.sort_by = state.sortBy; filters.sort_dir = state.sortDir; }
        return API.callRpc("admin_list_assignments", { p_filters: filters });
      },
      toolbarFilters(el, setFilter, filters) {
        el.appendChild(UI.select(["material", "task", "quiz", "exam"], { value: filters.assignment_type || "", onChange: v => setFilter("assignment_type", v), placeholder: "All types" }));
        el.appendChild(UI.select(["lecture", "laboratory"], { value: filters.category || "", onChange: v => setFilter("category", v), placeholder: "All categories" }));
        el.appendChild(UI.select(["open", "closed", "upcoming"], { value: filters.status || "", onChange: v => setFilter("status", v), placeholder: "All due states" }));
      },
      renderRow(a) {
        const health = [];
        if (a.missing_count) health.push(UI.badge(`missing ${a.missing_count}`, "danger"));
        if (a.ungraded_count) health.push(UI.badge(`ungraded ${a.ungraded_count}`, "warning"));
        if (!health.length) health.push(UI.badge("complete", "success"));
        return `<tr>
          <td>
            <span class="cell-main">${UI.escapeHtml(a.title)}</span>
            <br><span class="cell-sub">${UI.escapeHtml(a.target_points ?? "")} pts · ${UI.escapeHtml(a.submission_format || "any")}</span>
          </td>
          <td><a href="#/classes/${a.class_id}"><span class="cell-main" style="font-size:.82rem">${UI.escapeHtml(a.class_name)}</span></a><br><span class="cell-sub mono">${UI.escapeHtml(a.class_code || "")}</span></td>
          <td>
            ${UI.badge(a.assignment_type)}
            <div class="cell-sub" style="margin-top:3px">${UI.escapeHtml(a.category || "")}</div>
          </td>
          <td class="small">${a.end_date ? UI.fmtDate(a.end_date) : "—"}<br><span class="cell-sub">${a.is_closed ? UI.badge("closed", "neutral") : a.is_upcoming ? UI.badge("upcoming", "info") : UI.badge("open", "success")}</span></td>
          <td>${UI.escapeHtml(a.submission_count ?? 0)} <span class="muted">/ ${UI.escapeHtml(a.enrolled_student_count ?? 0)}</span></td>
          <td>${health.join(" ")}</td>
          <td>
            <div class="table-actions">
              <a class="btn sm secondary" href="#/submissions?assignment=${a.id}">Submissions</a>
              <button class="btn sm ghost" data-act="edit" data-id="${a.id}">Edit</button>
              <button class="btn sm danger outline" data-act="delete" data-id="${a.id}">Delete</button>
            </div>
          </td>
        </tr>`;
      },
    });

    dt.element.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      if (btn.dataset.act === "edit") openEdit(btn.dataset.id, dt);
      else if (btn.dataset.act === "delete") deleteAssignment(btn.dataset.id, dt);
    });

    view.innerHTML = `
      <div class="section-title">
        <h1>Assignments</h1>
        <div class="actions">
          ${Auth.canEdit() ? `<button class="btn" id="newAsgBtn">+ New assignment</button>` : ""}
          <a class="btn secondary sm" href="#/submissions">Ungraded queue</a>
        </div>
      </div>
      <div id="assignTable"></div>`;
    view.querySelector("#assignTable").appendChild(dt.element);
    const newBtn = view.querySelector("#newAsgBtn");
    if (newBtn) newBtn.addEventListener("click", () => openCreate(dt));
    if (initClass) dt.setFilter("class_id", initClass);
  },

  /* expose for other pages */
  openEdit,
  deleteAssignment,
};

async function openCreate(dt) {
  const clsRes = await API.callRpc("admin_list_classes", { p_filters: { status: "active", page: 1, page_size: 200 } });
  if (!clsRes.ok) { UI.toast(clsRes.error, "error"); return; }
  const classes = clsRes.data.rows || [];
  if (!classes.length) { UI.toast("Create a class first.", "error"); return; }

  const m = UI.modal({ title: "New assignment", subtitle: "Post a material, task, quiz or exam to a class", size: "lg", footer: `
    <button class="btn secondary cancel">Cancel</button>
    <button class="btn ok" id="asgCreate">Create assignment</button>` });
  m.body.innerHTML = `
    <form id="asgCreateForm" novalidate>
      <div class="form-row">
        <div class="field"><label>Class *</label>
          <select name="class_id" required>
            <option value="">— select class —</option>
            ${classes.map(c => `<option value="${c.id}">${UI.escapeHtml(c.class_name)} (${UI.escapeHtml(c.class_code)})</option>`).join("")}
          </select></div>
        <div class="field"><label>Title *</label><input type="text" name="title" required /></div>
      </div>
      <div class="form-row">
        <div class="field"><label>Type</label>
          <select name="assignment_type">${["material", "task", "quiz", "exam"].map(t => `<option>${t}</option>`).join("")}</select></div>
        <div class="field"><label>Category</label>
          <select name="category">${["lecture", "laboratory"].map(t => `<option>${t}</option>`).join("")}</select></div>
        <div class="field"><label>Target points</label><input type="number" name="target_points" min="1" value="100" /></div>
        <div class="field"><label>Submission format</label>
          <select name="submission_format">${["pdf", "docx", "pptx", "xlsx", "image", "zip"].map(t => `<option>${t}</option>`).join("")}</select></div>
      </div>
      <div class="form-row">
        <div class="field"><label>Start date</label><input type="date" name="start_date" /></div>
        <div class="field"><label>End date</label><input type="date" name="end_date" /></div>
        <div class="field"><label>Start time</label><input type="time" name="start_time" /></div>
        <div class="field"><label>End time</label><input type="time" name="end_time" /></div>
      </div>
      <div class="form-row">
        <div class="field"><label>File URL</label><input type="url" name="file_url" /></div>
        <div class="field" style="display:flex;align-items:flex-end;gap:16px">
          <label style="display:flex;align-items:center;gap:6px"><input type="checkbox" name="requires_file" checked /> File required</label>
          <label style="display:flex;align-items:center;gap:6px"><input type="checkbox" name="allow_comments" checked /> Comments</label>
        </div>
      </div>
      <div class="field"><label>Instructions</label><textarea name="instructions" rows="4"></textarea></div>
    </form>`;
  m.foot.querySelector(".cancel").addEventListener("click", m.close);
  m.foot.querySelector("#asgCreate").addEventListener("click", async (e) => {
    const form = m.body.querySelector("#asgCreateForm");
    if (!form.reportValidity()) return;
    const btn = e.target; btn.disabled = true;
    const data = Object.fromEntries(new FormData(form).entries());
    const res = await API.callRpc("admin_create_assignment", { p_data: data });
    if (!res.ok) { btn.disabled = false; UI.toast(res.error, "error"); return; }
    UI.toast("Assignment created.", "success");
    m.close();
    if (dt && dt.reload) dt.reload();
  });
}

async function openEdit(id, dt) {
  const r = await API.callRpc("admin_list_assignments", { p_filters: { assignment_id: id, page: 1, page_size: 1 } });
  if (!r.ok || !(r.data.rows || []).length) { UI.toast(r.ok ? "Assignment not found." : r.error, "error"); return; }
  const a = r.data.rows[0];
  const m = UI.modal({ title: "Edit assignment", subtitle: a.title, size: "lg", footer: `
    <button class="btn secondary cancel">Cancel</button>
    <button class="btn ok" id="asgSave">Save changes</button>` });
  m.body.innerHTML = `
    <form id="asgForm" novalidate>
      <div class="field"><label>Title *</label><input type="text" name="title" value="${UI.escapeHtml(a.title)}" required /></div>
      <div class="form-row">
        <div class="field"><label>Type</label>
          <select name="assignment_type">${["material", "task", "quiz", "exam"].map(t => `<option ${a.assignment_type === t ? "selected" : ""}>${t}</option>`).join("")}</select></div>
        <div class="field"><label>Category</label>
          <select name="category">${["lecture", "laboratory"].map(t => `<option ${a.category === t ? "selected" : ""}>${t}</option>`).join("")}</select></div>
        <div class="field"><label>Target points</label><input type="number" name="target_points" min="0" value="${UI.escapeHtml(a.target_points ?? "")}" /></div>
        <div class="field"><label>Submission format</label>
          <select name="submission_format">${["", "pdf", "docx", "pptx", "xlsx", "image", "zip"].map(t => `<option value="${t}" ${(a.submission_format || "") === t ? "selected" : ""}>${t || "any"}</option>`).join("")}</select></div>
      </div>
      <div class="form-row">
        <div class="field"><label>Start date</label><input type="date" name="start_date" value="${a.start_date ? a.start_date.slice(0, 10) : ""}" /></div>
        <div class="field"><label>End date</label><input type="date" name="end_date" value="${a.end_date ? a.end_date.slice(0, 10) : ""}" /></div>
        <div class="field"><label>Start time</label><input type="time" name="start_time" value="${a.start_time ? a.start_time.slice(0, 5) : ""}" /></div>
        <div class="field"><label>End time</label><input type="time" name="end_time" value="${a.end_time ? a.end_time.slice(0, 5) : ""}" /></div>
      </div>
      <div class="field"><label>File URL</label><input type="url" name="file_url" value="${UI.escapeHtml(a.file_url || "")}" /></div>
      <div class="field"><label>Instructions</label><textarea name="instructions" rows="4">${UI.escapeHtml(a.instructions || "")}</textarea></div>
    </form>`;
  m.foot.querySelector(".cancel").addEventListener("click", m.close);
  m.foot.querySelector("#asgSave").addEventListener("click", async (e) => {
    const form = m.body.querySelector("#asgForm");
    if (!form.reportValidity()) return;
    const btn = e.target; btn.disabled = true;
    const data = Object.fromEntries(new FormData(form).entries());
    const res = await API.callRpc("admin_update_assignment", { p_assignment_id: id, p_data: data });
    if (!res.ok) { btn.disabled = false; UI.toast(res.error, "error"); return; }
    UI.toast("Assignment updated.", "success");
    m.close();
    if (dt && dt.reload) dt.reload();
  });
}

function deleteAssignment(id, dt) {
  UI.confirm({
    title: "Delete assignment?",
    message: "This permanently removes the assignment. Student submissions for it are deleted too. This cannot be undone.",
    okText: "Delete", danger: true,
  }).then(async ok => {
    if (!ok) return;
    const res = await API.callRpc("admin_delete_assignment", { p_assignment_id: id, p_force: true });
    if (!res.ok) { UI.toast(res.error, "error"); return; }
    UI.toast("Assignment deleted.", "success");
    if (dt && dt.reload) dt.reload();
  });
}