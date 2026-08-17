/* ============================================================
   Pages.announcements — post admin/global announcements (target
   by year or all), moderate professors' announcements (edit/
   delete), read stats.
   ============================================================ */
window.Pages = window.Pages || {};
Pages.announcements = {
  render(view) {
    const dt = UI.datatable({
      columns: [
        { label: "Announcement", sortable: true, sortBy: "title" },
        { label: "Author" },
        { label: "Targets" },
        { label: "Reads" },
        { label: "Posted", sortable: true, sortBy: "created_at" },
        { label: "" },
      ],
      emptyText: "No announcements yet.",
      emptyIcon: "megaphone",
      defaultSortBy: "created_at",
      loader: async (state) => {
        const filters = { ...state.filters, search: state.search || null, page: state.page, page_size: state.pageSize };
        if (state.sortBy) { filters.sort_by = state.sortBy; filters.sort_dir = state.sortDir; }
        return API.callRpc("admin_list_announcements", { p_filters: filters });
      },
      toolbarFilters(el, setFilter, filters) {
        el.appendChild(UI.select([
          { value: "admin", label: "Admin posts" }, { value: "professor", label: "Professor posts" },
        ], { value: filters.author || "", onChange: v => setFilter("author", v), placeholder: "All authors" }));
        el.appendChild(UI.select(["first", "second", "third", "fourth"], { value: filters.target_year || "", onChange: v => setFilter("target_year", v), placeholder: "All years" }));
      },
      renderRow(a) {
        const targets = (a.target_years && a.target_years.length) ? a.target_years.map(y => `<span class="chip">${y}</span>`).join("") : `<span class="chip">all years</span>`;
        return `<tr>
          <td>
            <span class="cell-main">${UI.escapeHtml(a.title)}</span>
            ${a.subtitle ? `<br><span class="cell-sub">${UI.escapeHtml(a.subtitle)}</span>` : ""}
            ${a.content ? `<br><span class="cell-sub" style="max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block">${UI.escapeHtml(a.content)}</span>` : ""}
          </td>
          <td>${a.author_is_admin ? UI.badge("Admin", "dark") : UI.escapeHtml(a.author_name || "Professor")}</td>
          <td>${targets}</td>
          <td>${UI.escapeHtml(a.read_count ?? 0)} <span class="muted small">/ read</span></td>
          <td class="muted small">${UI.fmtDateTime(a.created_at)}</td>
          <td>
            <div class="table-actions">
              <button class="btn sm secondary" data-act="edit" data-id="${a.id}">Edit</button>
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
      else if (btn.dataset.act === "delete") deleteAnn(btn.dataset.id, dt);
    });

    view.innerHTML = `
      <div class="section-title">
        <h1>Announcements</h1>
        <div class="actions"><button class="btn" id="newAnnBtn">+ New announcement</button></div>
      </div>
      <div id="annTable"></div>`;
    view.querySelector("#annTable").appendChild(dt.element);
    view.querySelector("#newAnnBtn").addEventListener("click", () => openCreate(dt));
  },
};

const ANN_YEARS = ["first", "second", "third", "fourth"];

function targetsEditor(selected) {
  const sel = selected || [];
  const all = sel.length === 0;
  const y = (y) => `<label class="checkbox"><input type="checkbox" name="year" value="${y}" ${!all && sel.includes(y) ? "checked" : ""}/> ${y}</label>`;
  return `
    <label class="checkbox" style="margin-bottom:6px"><input type="checkbox" id="allYears" ${all ? "checked" : ""} /> All years</label>
    <div style="display:flex;gap:14px;flex-wrap:wrap">${ANN_YEARS.map(y).join("")}</div>`;
}

function openCreate(dt) {
  const m = UI.modal({ title: "New announcement", subtitle: "Post a global / admin announcement", size: "md", footer: `
    <button class="btn secondary cancel">Cancel</button>
    <button class="btn ok" id="annSave">Publish</button>` });
  m.body.innerHTML = `
    <form id="annForm" novalidate>
      <div class="field"><label>Title *</label><input type="text" name="title" required /></div>
      <div class="field"><label>Subtitle</label><input type="text" name="subtitle" /></div>
      <div class="field"><label>Content</label><textarea name="content" rows="4"></textarea></div>
      <div class="field"><label>Image URL</label><input type="url" name="image_url" /></div>
      <div class="field"><label>Target years</label>${targetsEditor(null)}</div>
    </form>`;
  const body = m.body;
  m.foot.querySelector(".cancel").addEventListener("click", m.close);
  m.foot.querySelector("#annSave").addEventListener("click", async (e) => {
    const form = body.querySelector("#annForm");
    if (!form.reportValidity()) return;
    const all = body.querySelector("#allYears").checked;
    const checked = [...body.querySelectorAll('input[name="year"]:checked')].map(i => i.value);
    const target_years = all ? [] : checked;
    const btn = e.target; btn.disabled = true;
    const data = Object.fromEntries(new FormData(form).entries());
    data.target_years = target_years;
    const res = await API.callRpc("admin_create_announcement", { p_data: data });
    if (!res.ok) { btn.disabled = false; UI.toast(res.error, "error"); return; }
    UI.toast("Announcement published.", "success");
    m.close(); dt.reload();
  });
}

function openEdit(id, dt) {
  API.callRpc("admin_list_announcements", { p_filters: { announcement_id: id, page: 1, page_size: 1 } }).then((r) => {
    if (!r.ok || !(r.data.rows || []).length) { UI.toast(r.ok ? "Not found." : r.error, "error"); return; }
    const a = r.data.rows[0];
    const m = UI.modal({ title: "Edit announcement", subtitle: a.title, size: "md", footer: `
      <button class="btn secondary cancel">Cancel</button>
      <button class="btn ok" id="annSave">Save changes</button>` });
    m.body.innerHTML = `
      <form id="annForm" novalidate>
        <div class="field"><label>Title *</label><input type="text" name="title" value="${UI.escapeHtml(a.title)}" required /></div>
        <div class="field"><label>Subtitle</label><input type="text" name="subtitle" value="${UI.escapeHtml(a.subtitle || "")}" /></div>
        <div class="field"><label>Content</label><textarea name="content" rows="4">${UI.escapeHtml(a.content || "")}</textarea></div>
        <div class="field"><label>Image URL</label><input type="url" name="image_url" value="${UI.escapeHtml(a.image_url || "")}" /></div>
        <div class="field"><label>Target years</label>${targetsEditor(a.target_years)}</div>
      </form>`;
    m.foot.querySelector(".cancel").addEventListener("click", m.close);
    m.foot.querySelector("#annSave").addEventListener("click", async (e) => {
      const form = m.body.querySelector("#annForm");
      if (!form.reportValidity()) return;
      const all = m.body.querySelector("#allYears").checked;
      const checked = [...m.body.querySelectorAll('input[name="year"]:checked')].map(i => i.value);
      const btn = e.target; btn.disabled = true;
      const data = Object.fromEntries(new FormData(form).entries());
      data.target_years = all ? [] : checked;
      const res = await API.callRpc("admin_update_announcement", { p_announcement_id: id, p_data: data });
      if (!res.ok) { btn.disabled = false; UI.toast(res.error, "error"); return; }
      UI.toast("Announcement updated.", "success");
      m.close(); dt.reload();
    });
  });
}

function deleteAnn(id, dt) {
  UI.confirm({ title: "Delete announcement?", message: "This permanently removes the announcement and its read records.", okText: "Delete", danger: true })
    .then(async ok => {
      if (!ok) return;
      const res = await API.callRpc("admin_delete_announcement", { p_announcement_id: id });
      if (!res.ok) { UI.toast(res.error, "error"); return; }
      UI.toast("Announcement deleted.", "success");
      dt.reload();
    });
}