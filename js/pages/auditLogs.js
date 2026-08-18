/* ============================================================
   Pages.auditLogs — read-only trail of admin actions with
   filters and before/after detail. Never shows passwords.
   ============================================================ */
window.Pages = window.Pages || {};
Pages.auditLogs = {
  render(view) {
    const dt = UI.datatable({
      columns: [
        { label: "Time", sortable: true, sortBy: "created_at" },
        { label: "Admin" },
        { label: "Action", sortable: true, sortBy: "action" },
        { label: "Target" },
        { label: "" },
      ],
      emptyText: "No audit entries yet.",
      emptyIcon: "scroll",
      defaultSortBy: "created_at",
      loader: async (state) => {
        const filters = { ...state.filters, search: state.search || null, page: state.page, page_size: state.pageSize };
        if (state.sortBy) { filters.sort_by = state.sortBy; filters.sort_dir = state.sortDir; }
        return API.callRpc("admin_list_audit_logs", { p_filters: filters });
      },
      toolbarFilters(el, setFilter, filters) {
        const dateFrom = document.createElement("input"); dateFrom.type = "date"; dateFrom.value = filters.date_from || "";
        const dateTo = document.createElement("input"); dateTo.type = "date"; dateTo.value = filters.date_to || "";
        dateFrom.addEventListener("change", () => setFilter("date_from", dateFrom.value));
        dateTo.addEventListener("change", () => setFilter("date_to", dateTo.value));
        el.appendChild(dateFrom); el.appendChild(dateTo);
      },
      renderRow(e) {
        return `<tr>
          <td class="small">${UI.fmtDateTime(e.created_at)}</td>
          <td>${UI.escapeHtml(e.admin_name || e.admin_id || "—")}</td>
          <td>${UI.badge(e.action, "primary")}</td>
          <td><span class="mono" style="font-size:.78rem">${UI.escapeHtml(e.target_table || "")}</span> ${e.target_id ? `<span class="muted small mono">${UI.escapeHtml(e.target_id)}</span>` : ""}</td>
          <td><button class="act primary" data-view="${e.id}" title="View details">${UI.icon("eye")}</button></td>
        </tr>`;
      },
    });

    dt.element.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-view]");
      if (!btn) return;
      const id = btn.dataset.view;
      API.callRpc("admin_list_audit_logs", { p_filters: { audit_id: id, page: 1, page_size: 1 } }).then(r => {
        if (!r.ok || !(r.data.rows || []).length) { UI.toast(r.ok ? "Not found." : r.error, "error"); return; }
        const row = r.data.rows[0];
        const m = UI.modal({ title: "Audit entry", subtitle: row.action + " — " + row.created_at, size: "lg", footer: `<button class="btn secondary ok">Close</button>` });
        m.body.innerHTML = `
          <div class="kv" style="margin-bottom:10px">
            <div class="kv-row"><span class="k">Admin</span><span class="v">${UI.escapeHtml(row.admin_name || row.admin_id || "—")}</span></div>
            <div class="kv-row"><span class="k">Action</span><span class="v">${UI.escapeHtml(row.action)}</span></div>
            <div class="kv-row"><span class="k">Target</span><span class="v mono">${UI.escapeHtml(row.target_table || "—")} ${row.target_id ? "· " + UI.escapeHtml(row.target_id) : ""}</span></div>
          </div>
          <div class="field"><label>Before</label><div class="audit-diff">${UI.escapeHtml(JSON.stringify(row.before_data, null, 2) || "null")}</div></div>
          <div class="field"><label>After</label><div class="audit-diff">${UI.escapeHtml(JSON.stringify(row.after_data, null, 2) || "null")}</div></div>
          ${row.details ? `<div class="field"><label>Details</label><div class="audit-diff">${UI.escapeHtml(JSON.stringify(row.details, null, 2))}</div></div>` : ""}`;
        m.foot.querySelector(".ok").addEventListener("click", m.close);
      });
    });

    view.innerHTML = `
      <div class="section-title">
        <h1>Audit logs</h1>
        <div class="actions"><button class="btn secondary sm" id="alRefresh">${UI.icon("refresh")} Refresh</button></div>
      </div>
      <div class="notice-strip">Read-only trail. Every privileged admin action writes a row here. Password values are never logged.</div>
      <div id="alTable"></div>`;
    view.querySelector("#alTable").appendChild(dt.element);
    view.querySelector("#alRefresh").addEventListener("click", () => dt.reload());
  },
};