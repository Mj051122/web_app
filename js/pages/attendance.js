/* ============================================================
   Pages.attendance — per class/date/assignment records, manual
   corrections (audit-logged), duplicate-scan warnings.
   Absence is inferred by missing rows — "mark absent" removes
   the present record.
   ============================================================ */
window.Pages = window.Pages || {};
Pages.attendance = {
  async render(view) {
    const classRes = await API.callRpc("admin_list_classes", { p_filters: { page: 1, page_size: 200 } });
    const classes = (classRes.ok && classRes.data.rows) || [];
    const assignRes = await API.callRpc("admin_list_assignments", { p_filters: { page: 1, page_size: 200 } });
    const assignments = (assignRes.ok && assignRes.data.rows) || [];

    view.innerHTML = `
      <div class="section-title">
        <h1>Attendance</h1>
        <div class="actions"><button class="btn" id="addAttBtn">+ Record attendance</button></div>
      </div>
      <div class="notice-strip hidden" id="dupBanner">
        ⚠️ Duplicate scans detected — the same student has multiple present records for the same date/assignment.
        Review below and clean up with the "Fix" action.
      </div>
      <div id="attTable"></div>`;

    const dt = UI.datatable({
      columns: [
        { label: "Student", sortable: true, sortBy: "student_name" },
        { label: "Class" },
        { label: "Assignment" },
        { label: "Date", sortable: true, sortBy: "attendance_date" },
        { label: "Status" },
        { label: "Recorded" },
        { label: "" },
      ],
      emptyText: "No attendance records. Absence is inferred by missing rows.",
      emptyIcon: "list",
      defaultSortBy: "attendance_date",
      loader: async (state) => {
        const filters = { ...state.filters, search: state.search || null, page: state.page, page_size: state.pageSize };
        if (state.sortBy) { filters.sort_by = state.sortBy; filters.sort_dir = state.sortDir; }
        const res = await API.callRpc("admin_list_attendance", { p_filters: filters });
        if (res.ok) {
          view.querySelector("#dupBanner").classList.toggle("hidden", !(res.data && res.data.duplicate_count));
        }
        return res;
      },
      toolbarFilters(el, setFilter, filters) {
        const classSel = UI.select(classes.map(c => ({ value: c.id, label: c.class_name })), {
          value: filters.class_id || "", onChange: v => setFilter("class_id", v), placeholder: "All classes",
        });
        const assignSel = UI.select(assignments.map(a => ({ value: a.id, label: a.title })), {
          value: filters.assignment_id || "", onChange: v => setFilter("assignment_id", v), placeholder: "All assignments",
        });
        const dateInput = document.createElement("input");
        dateInput.type = "date";
        dateInput.value = filters.attendance_date || "";
        dateInput.addEventListener("change", () => setFilter("attendance_date", dateInput.value));

        el.appendChild(classSel);
        el.appendChild(assignSel);
        el.appendChild(dateInput);
        el.appendChild(UI.select(["present"], { value: filters.status || "", onChange: v => setFilter("status", v), placeholder: "Present / absent" }));

        const dupLabel = document.createElement("label");
        dupLabel.className = "checkbox";
        dupLabel.innerHTML = `<input type="checkbox" ${filters.duplicates_only ? "checked" : ""} /> Duplicates only`;
        dupLabel.querySelector("input").addEventListener("change", () => setFilter("duplicates_only", dupLabel.querySelector("input").checked ? "true" : ""));
        el.appendChild(dupLabel);
      },
      renderRow(a) {
        return `<tr>
          <td><a href="#/users/${a.student_id}"><span class="cell-main">${UI.escapeHtml(a.student_name)}</span></a><br><span class="cell-sub mono">${UI.escapeHtml(a.id_number)}</span></td>
          <td class="muted">${UI.escapeHtml(a.class_name)}</td>
          <td class="muted small">${UI.escapeHtml(a.assignment_title || "—")}</td>
          <td>${UI.fmtDate(a.attendance_date)}</td>
          <td>${a.is_duplicate ? UI.badge("present ×" + a.dup_count, "warning") : UI.badge(a.status || "present", "success")}</td>
          <td class="muted small">${UI.timeAgo(a.created_at)}</td>
          <td><button class="btn sm danger outline" data-fix="${a.id}" data-name="${UI.escapeHtml(a.student_name)}">Fix</button></td>
        </tr>`;
      },
    });

    view.querySelector("#attTable").appendChild(dt.element);

    dt.element.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-fix]");
      if (!btn) return;
      openFix(btn.dataset.id, btn.dataset.name, () => dt.reload());
    });

    view.querySelector("#addAttBtn").addEventListener("click", () => openAdd(() => dt.reload()));
  },
};

function openFix(id, name, after) {
  const m = UI.modal({ title: "Fix attendance record", subtitle: name, size: "sm", footer: `
    <button class="btn secondary cancel">Cancel</button>
    <button class="btn danger" id="markAbsent">Mark absent</button>` });
  m.body.innerHTML = `
    <div class="info-box">Absence is inferred by <b>missing rows</b>. Marking a record absent removes it — the student then counts as absent for that date/assignment.</div>
    <div class="warn-box">This correction is audit-logged with before/after data.</div>`;
  m.foot.querySelector(".cancel").addEventListener("click", m.close);
  m.foot.querySelector("#markAbsent").addEventListener("click", async (e) => {
    const ok = await UI.confirm({ title: "Mark absent?", message: `The present record for ${name} will be removed.`, okText: "Mark absent", danger: true });
    if (!ok) return;
    const btn = e.target; btn.disabled = true;
    const res = await API.callRpc("admin_fix_attendance", { p_attendance_id: id, p_new_status: "absent" });
    if (!res.ok) { btn.disabled = false; UI.toast(res.error, "error"); return; }
    UI.toast("Record corrected.", "success");
    m.close(); after();
  });
}

function openAdd(after) {
  const m = UI.modal({ title: "Record attendance", subtitle: "Manually add a present record", size: "md", footer: `
    <button class="btn secondary cancel">Cancel</button>
    <button class="btn ok" id="attSave">Save record</button>` });

  m.body.innerHTML = `
    <form id="attForm" novalidate>
      <div class="form-row">
        <div class="field"><label>Class *</label><select name="class_id" id="attClass" required><option value="">— select —</option></select></div>
        <div class="field"><label>Assignment</label><select name="assignment_id" id="attAssign"><option value="">— none —</option></select></div>
      </div>
      <div class="field"><label>Student *</label>
        <input type="search" id="attStudentSearch" placeholder="Search name or ID number" />
        <div id="attStudentResults"></div>
      </div>
      <div class="form-row">
        <div class="field"><label>Date *</label><input type="date" name="attendance_date" id="attDate" required /></div>
        <div class="field"><label>Status</label><select name="status"><option value="present">present</option></select></div>
      </div>
      <div class="info-box">If a record already exists for this student/assignment/date, the save is rejected as a duplicate scan.</div>
    </form>`;

  const classSel = m.body.querySelector("#attClass");
  const assignSel = m.body.querySelector("#attAssign");
  const studentSearch = m.body.querySelector("#attStudentSearch");
  const studentResults = m.body.querySelector("#attStudentResults");
  let pickedStudent = null;

  const populateClasses = async () => {
    const r = await API.callRpc("admin_list_classes", { p_filters: { page: 1, page_size: 200 } });
    const rows = (r.ok && r.data.rows) || [];
    classSel.innerHTML = `<option value="">— select —</option>` + rows.map(c => `<option value="${c.id}">${UI.escapeHtml(c.class_name)} (${UI.escapeHtml(c.class_code)})</option>`).join("");
  };
  const populateAssignments = async () => {
    const r = await API.callRpc("admin_list_assignments", { p_filters: { page: 1, page_size: 200 } });
    const rows = (r.ok && r.data.rows) || [];
    assignSel.innerHTML = `<option value="">— none —</option>` + rows.map(a => `<option value="${a.id}">${UI.escapeHtml(a.title)}</option>`).join("");
  };
  const searchStudents = UI.debounce(async (q) => {
    if (!q) { studentResults.innerHTML = ""; return; }
    studentResults.innerHTML = UI.loading();
    const r = await API.callRpc("admin_list_users", { p_filters: { role: "student", search: q, page: 1, page_size: 15 } });
    const rows = (r.ok && r.data.rows) || [];
    if (!rows.length) { studentResults.innerHTML = `<div class="small muted" style="padding:6px 0">No students found.</div>`; return; }
    studentResults.innerHTML = rows.map(s => `
      <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--border);border-radius:8px;margin-top:6px;cursor:pointer" data-pick="${s.id}" data-name="${UI.escapeHtml(s.full_name)}">
        ${UI.avatar(s.full_name, s.profile_picture_url)}
        <div style="flex:1"><div style="font-weight:600;font-size:.85rem">${UI.escapeHtml(s.full_name)}</div><div class="small muted mono">${UI.escapeHtml(s.id_number)}</div></div>
        <button class="btn sm">Pick</button>
      </div>`).join("");
    studentResults.querySelectorAll("[data-pick]").forEach(el => el.addEventListener("click", () => {
      pickedStudent = el.dataset.pick;
      studentSearch.value = el.dataset.name;
      studentResults.innerHTML = `<div class="small success" style="padding:4px 0;color:var(--success)">✓ ${UI.escapeHtml(el.dataset.name)} selected</div>`;
    }));
  }, 350);
  studentSearch.addEventListener("input", () => searchStudents(studentSearch.value.trim()));

  populateClasses(); populateAssignments();

  m.foot.querySelector(".cancel").addEventListener("click", m.close);
  m.foot.querySelector("#attSave").addEventListener("click", async (e) => {
    if (!pickedStudent) { UI.toast("Pick a student first.", "error"); return; }
    if (!classSel.value) { UI.toast("Select a class.", "error"); return; }
    const date = m.body.querySelector("#attDate").value;
    if (!date) { UI.toast("Select a date.", "error"); return; }
    const btn = e.target; btn.disabled = true;
    const res = await API.callRpc("admin_add_attendance", {
      p_class_id: classSel.value,
      p_assignment_id: assignSel.value || null,
      p_student_id: pickedStudent,
      p_date: date,
    });
    if (!res.ok) { btn.disabled = false; UI.toast(res.error, "error"); return; }
    UI.toast("Attendance recorded.", "success");
    m.close(); after();
  });
}