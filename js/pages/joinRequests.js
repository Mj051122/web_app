/* ============================================================
   Pages.joinRequests — the full pending queue with class and
   student info; approve/reject (audit-logged, reuses the app's
   decide flow when its RPC exists).
   ============================================================ */
window.Pages = window.Pages || {};
Pages.joinRequests = {
  render(view) {
    const dt = UI.datatable({
      columns: [
        { label: "Student", sortable: true, sortBy: "student_name" },
        { label: "ID number" },
        { label: "Class", sortable: true, sortBy: "class_name" },
        { label: "Year" },
        { label: "Requested", sortable: true, sortBy: "requested_at" },
        { label: "Status" },
        { label: "" },
      ],
      emptyText: "No join requests match.",
      emptyIcon: "inbox",
      defaultSortBy: "requested_at",
      loader: async (state) => {
        const filters = { ...state.filters, search: state.search || null, page: state.page, page_size: state.pageSize };
        if (state.sortBy) { filters.sort_by = state.sortBy; filters.sort_dir = state.sortDir; }
        return API.callRpc("admin_list_join_requests", { p_filters: filters });
      },
      toolbarFilters(el, setFilter, filters) {
        el.appendChild(UI.select(["pending", "approved", "rejected"], { value: filters.status || "", onChange: v => setFilter("status", v), placeholder: "All statuses" }));
      },
      renderRow(q) {
        return `<tr class="${q.status === "pending" ? "" : ""}">
          <td><a href="#/users/${q.student_id}"><span class="cell-main">${UI.escapeHtml(q.student_name)}</span></a></td>
          <td class="mono">${UI.escapeHtml(q.student_id_number)}</td>
          <td><a href="#/classes/${q.class_id}"><span class="cell-main">${UI.escapeHtml(q.class_name)}</span></a><br><span class="cell-sub mono">${UI.escapeHtml(q.class_code || "")}</span></td>
          <td>${UI.badge(q.student_year_level || "—")}</td>
          <td class="muted small">${UI.fmtDateTime(q.requested_at)}</td>
          <td>${UI.badge(q.status)}</td>
          <td>${q.status === "pending" ? `
            <div class="table-actions">
              <button class="btn sm success" data-req="approve" data-id="${q.id}">Approve</button>
              <button class="btn sm danger outline" data-req="reject" data-id="${q.id}">Reject</button>
            </div>` : `<span class="muted small">${q.decided_at ? UI.timeAgo(q.decided_at) : ""}</span>`}
          </td>
        </tr>`;
      },
    });

    dt.element.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-req]");
      if (!btn) return;
      const action = btn.dataset.req;
      UI.confirm({
        title: action === "approve" ? "Approve join request?" : "Reject join request?",
        message: action === "approve"
          ? "The student will be enrolled in the class. This follows the app's approval flow."
          : "The student will not be enrolled in this class.",
        okText: action === "approve" ? "Approve" : "Reject",
        danger: action === "reject",
      }).then(async ok => {
        if (!ok) return;
        const res = await API.callRpc("admin_decide_join_request", { p_request_id: btn.dataset.id, p_decision: action });
        if (!res.ok) { UI.toast(res.error, "error"); return; }
        UI.toast(action === "approve" ? "Request approved." : "Request rejected.", "success");
        dt.reload();
      });
    });

    view.innerHTML = `
      <div class="section-title">
        <h1>Join requests</h1>
        <div class="actions"><button class="btn secondary sm" id="jrRefresh">Refresh</button></div>
      </div>
      <div id="jrTable"></div>`;
    view.querySelector("#jrTable").appendChild(dt.element);
    view.querySelector("#jrRefresh").addEventListener("click", () => dt.reload());
  },
};