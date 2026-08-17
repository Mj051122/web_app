/* ============================================================
   Pages.comments — moderation of assignment comments:
   hide / show / delete. Visible comments are the default view.
   ============================================================ */
window.Pages = window.Pages || {};
Pages.comments = {
  render(view, params) {
    const dt = UI.datatable({
      columns: [
        { label: "Comment", sortable: true, sortBy: "created_at" },
        { label: "Author" },
        { label: "Class" },
        { label: "Assignment" },
        { label: "Posted" },
        { label: "" },
      ],
      emptyText: "No comments found.",
      emptyIcon: "message",
      defaultSortBy: "created_at",
      loader: async (state) => {
        const filters = { ...state.filters, search: state.search || null, page: state.page, page_size: state.pageSize };
        if (state.sortBy) { filters.sort_by = state.sortBy; filters.sort_dir = state.sortDir; }
        return API.callRpc("admin_list_comments", { p_filters: filters });
      },
      toolbarFilters(el, setFilter, filters) {
        el.appendChild(UI.select([
          { value: "false", label: "Visible" }, { value: "true", label: "Hidden" },
        ], { value: filters.hidden || "", onChange: v => setFilter("hidden", v), placeholder: "All comments" }));
        el.appendChild(UI.select(["student", "professor"], { value: filters.author_role || "", onChange: v => setFilter("author_role", v), placeholder: "All authors" }));
      },
      renderRow(c) {
        return `<tr class="${c.is_hidden ? "row-danger" : ""}">
          <td>
            <span class="cell-main">${UI.escapeHtml(c.content)}</span>
          </td>
          <td>
            <span class="cell-main">${UI.escapeHtml(c.author_name)}</span>
            <br><span class="cell-sub mono">${UI.escapeHtml(c.author_id_number || "")}</span>
          </td>
          <td><a href="#/classes/${c.class_id}"><span class="cell-main" style="font-size:.82rem">${UI.escapeHtml(c.class_name)}</span></a></td>
          <td><span class="cell-main" style="font-size:.82rem">${UI.escapeHtml(c.assignment_title || "—")}</span><br><span class="cell-sub">${UI.escapeHtml(c.author_role)}</span></td>
          <td class="muted small">${UI.timeAgo(c.created_at)}</td>
          <td>
            <div class="table-actions">
              ${Auth.canEdit() ? `
              ${c.is_hidden
                ? `<button class="btn sm success" data-act="show" data-id="${c.id}">Show</button>`
                : `<button class="btn sm ghost" data-act="hide" data-id="${c.id}">Hide</button>`}
              <button class="btn sm danger outline" data-act="delete" data-id="${c.id}">Delete</button>` : ""}
            </div>
          </td>
        </tr>`;
      },
    });

    dt.element.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      const id = btn.dataset.id, act = btn.dataset.act;
      if (act === "hide") toggleHide(id, true, dt);
      else if (act === "show") toggleHide(id, false, dt);
      else if (act === "delete") deleteComment(id, dt);
    });

    view.innerHTML = `
      <div class="section-title"><h1>Comments</h1></div>
      <div id="commentsTable"></div>`;
    view.querySelector("#commentsTable").appendChild(dt.element);
  },
};

function toggleHide(id, hide, dt) {
  UI.confirm({
    title: hide ? "Hide comment?" : "Show comment?",
    message: hide
      ? "The comment will no longer be visible to students and professors in the app. You can show it again anytime."
      : "The comment becomes visible to students and professors again.",
    okText: hide ? "Hide" : "Show",
  }).then(async (ok) => {
    if (!ok) return;
    const res = await API.callRpc(hide ? "admin_hide_comment" : "admin_show_comment", { p_comment_id: id });
    if (!res.ok) { UI.toast(res.error, "error"); return; }
    UI.toast(hide ? "Comment hidden." : "Comment shown.", "success");
    dt.reload();
  });
}

function deleteComment(id, dt) {
  UI.confirm({
    title: "Delete comment — permanent",
    message: "This permanently removes the comment from the database. This cannot be undone. An audit snapshot is kept.",
    okText: "Delete", danger: true,
  }).then(async (ok) => {
    if (!ok) return;
    const res = await API.callRpc("admin_delete_comment", { p_comment_id: id });
    if (!res.ok) { UI.toast(res.error, "error"); return; }
    UI.toast("Comment deleted.", "success");
    dt.reload();
  });
}