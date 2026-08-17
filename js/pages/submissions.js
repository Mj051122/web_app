/* ============================================================
   Pages.submissions — submissions per assignment, file download,
   score override (audit-logged), missing/ungraded summary.
   ============================================================ */
window.Pages = window.Pages || {};
Pages.submissions = (() => {

  const render = async (view, params) => {
    const initAssignment = (params.query && params.query.assignment) || "";

    /* summary strip: ungraded per assignment */
    const sumRes = await API.callRpc("admin_list_ungraded", { p_filters: { scope: "assignments", page: 1, page_size: 15 } });
    const ungraded = (sumRes.ok && sumRes.data && sumRes.data.rows) || [];

    view.innerHTML = `
      <div class="section-title">
        <h1>Submissions &amp; grades</h1>
        <div class="actions"><a class="btn secondary sm" href="#/assignments">All assignments</a></div>
      </div>
      <div class="card" style="margin-bottom:16px">
        <div class="card-head"><h3>Ungraded backlog</h3><span class="muted small">assignments with submissions still needing scores</span></div>
        <div class="card-body flush">
          ${ungraded.length ? `<table class="table"><thead><tr><th>Assignment</th><th>Class</th><th>Submitted</th><th>Graded</th><th>Ungraded</th><th>Missing</th><th></th></tr></thead><tbody>
            ${ungraded.map(u => `<tr>
              <td><span class="cell-main">${UI.escapeHtml(u.title)}</span></td>
              <td class="muted">${UI.escapeHtml(u.class_name)}</td>
              <td>${UI.escapeHtml(u.submitted_count)}</td>
              <td>${UI.escapeHtml(u.graded_count)}</td>
              <td>${u.ungraded_count ? UI.badge(u.ungraded_count, "warning") : UI.badge("0", "success")}</td>
              <td>${u.missing_count ? UI.badge(u.missing_count, "danger") : UI.badge("none", "success")}</td>
              <td><a class="btn sm secondary" href="#/submissions?assignment=${u.assignment_id}">Open</a></td>
            </tr>`).join("")}</tbody></table>` : UI.empty("All submissions are graded. Nice work!", "award", "All caught up")}
        </div>
      </div>

      <div class="card" id="subsCard"></div>`;

    const dt = UI.datatable({
      columns: [
        { label: "Student", sortable: true, sortBy: "student_name" },
        { label: "Assignment" },
        { label: "Submitted", sortable: true, sortBy: "submitted_at" },
        { label: "Score" },
        { label: "File" },
        { label: "" },
      ],
      emptyText: "No submissions found.",
      emptyIcon: "award",
      defaultSortBy: "submitted_at",
      loader: async (state) => {
        const filters = { ...state.filters, search: state.search || null, page: state.page, page_size: state.pageSize };
        if (state.sortBy) { filters.sort_by = state.sortBy; filters.sort_dir = state.sortDir; }
        return API.callRpc("admin_list_submissions", { p_filters: filters });
      },
      toolbarFilters(el, setFilter, filters) {
        el.appendChild(UI.select([
          { value: "ungraded", label: "Ungraded only" }, { value: "graded", label: "Graded only" },
        ], { value: filters.status || "", onChange: v => setFilter("status", v), placeholder: "All submissions" }));
      },
      renderRow(s) {
        return `<tr>
          <td><a href="#/users/${s.student_id}"><span class="cell-main">${UI.escapeHtml(s.student_name)}</span></a><br><span class="cell-sub mono">${UI.escapeHtml(s.student_id_number)}</span></td>
          <td>
            <span class="cell-main" style="font-size:.82rem">${UI.escapeHtml(s.assignment_title)}</span>
            <br><span class="cell-sub">${UI.escapeHtml(s.class_name)}</span>
          </td>
          <td class="small">${UI.fmtDateTime(s.submitted_at)}</td>
          <td>${s.score == null ? UI.badge("ungraded", "warning") : `<span class="cell-main">${UI.escapeHtml(s.score)}<span class="muted">/${UI.escapeHtml(s.target_points ?? "")}</span></span>`}</td>
          <td>${s.submission_file_url ? `<button class="btn sm ghost" data-dl="${UI.escapeHtml(s.id)}">⬇ Download</button>` : "—"}</td>
          <td><button class="btn sm secondary" data-grade="${s.id}">${s.score == null ? "Grade" : "Override"}</button></td>
        </tr>`;
      },
    });

    view.querySelector("#subsCard").appendChild(dt.element);

    dt.element.addEventListener("click", async (e) => {
      const gradeBtn = e.target.closest("[data-grade]");
      if (gradeBtn) {
        const r = await API.callRpc("admin_list_submissions", { p_filters: { page: 1, page_size: 1 } });
        // fetch the specific row
        const rowRes = await fetchSubmission(gradeBtn.dataset.grade);
        if (rowRes.ok) openGrade(rowRes.data, () => dt.reload());
        return;
      }
      const dlBtn = e.target.closest("[data-dl]");
      if (dlBtn) {
        const r = await fetchSubmission(dlBtn.dataset.dl);
        if (!r.ok) { UI.toast(r.error, "error"); return; }
        downloadFile(r.data.submission_file_url);
      }
    });

    if (initAssignment) dt.setFilter("assignment_id", initAssignment);
  };

  async function fetchSubmission(id) {
    return API.callRpc("admin_list_submissions", { p_filters: { submission_id: id, page: 1, page_size: 1 } })
      .then(res => res.ok && (res.data.rows || []).length ? { ok: true, data: res.data.rows[0] } : res);
  }

  async function downloadFile(path) {
    const res = await API.fileLinkSmart(path);
    if (!res.ok) { UI.toast(res.error, "error"); return; }
    window.open(res.data, "_blank");
  }

  function openGrade(sub, after) {
    const m = UI.modal({ title: sub.score == null ? "Grade submission" : "Override score", subtitle: sub.student_name + " — " + sub.assignment_title, footer: `
      <button class="btn secondary cancel">Cancel</button>
      ${sub.score != null ? `<button class="btn ghost" id="clearScore">Clear score</button>` : ""}
      <button class="btn ok" id="saveScore">Save score</button>` });

    m.body.innerHTML = `
      ${sub.response_text ? `
        <div class="field"><label>Response text</label>
          <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:10px 12px;font-size:.85rem;white-space:pre-wrap">${UI.escapeHtml(sub.response_text)}</div>
        </div>` : ""}
      ${sub.submission_file_url ? `
        <div class="field"><label>Submitted file</label>
          <div><button class="btn sm secondary" id="dlFile">⬇ Download file</button></div>
        </div>` : ""}
      <div class="form-row">
        <div class="field"><label>Score (0 – ${UI.escapeHtml(sub.target_points ?? "∞")})</label>
          <input type="number" id="scoreInput" min="0" max="${UI.escapeHtml(sub.target_points ?? "")}" step="0.01" value="${sub.score != null ? UI.escapeHtml(sub.score) : ""}" required /></div>
      </div>
      <div class="info-box">Score overrides are audit-logged (admin id, before/after). This does not modify the app's grading RPC.</div>`;

    if (sub.submission_file_url) {
      m.body.querySelector("#dlFile").addEventListener("click", () => downloadFile(sub.submission_file_url));
    }
    m.foot.querySelector(".cancel").addEventListener("click", m.close);
    m.foot.querySelector("#saveScore").addEventListener("click", async (e) => {
      const input = m.body.querySelector("#scoreInput");
      const val = input.value.trim();
      if (val === "" || isNaN(val)) { input.classList.add("invalid"); return; }
      const btn = e.target; btn.disabled = true;
      const res = await API.callRpc("admin_set_score", { p_submission_id: sub.id, p_score: Number(val) });
      if (!res.ok) { btn.disabled = false; UI.toast(res.error, "error"); return; }
      UI.toast("Score saved.", "success");
      m.close();
      if (after) after();
    });
    const clearBtn = m.foot.querySelector("#clearScore");
    if (clearBtn) clearBtn.addEventListener("click", async () => {
      const ok = await UI.confirm({ title: "Clear score?", message: "The submission returns to the ungraded state.", okText: "Clear", danger: true });
      if (!ok) return;
      const res = await API.callRpc("admin_set_score", { p_submission_id: sub.id, p_score: null });
      if (!res.ok) { UI.toast(res.error, "error"); return; }
      UI.toast("Score cleared.", "success");
      m.close();
      if (after) after();
    });
  }

  return { render, openGrade, downloadFile };
})();