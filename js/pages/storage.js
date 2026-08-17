/* ============================================================
   Pages.storage — browse bucket files, flag orphans, delete
   carefully (audit-logged). Best-effort via storage.objects.
   ============================================================ */
window.Pages = window.Pages || {};
Pages.storage = {
  async render(view) {
    const BUCKETS = ["profile-pictures", "class-covers", "announcement-images", "assignment-files"];
    let currentBucket = BUCKETS[0];

    view.innerHTML = `
      <div class="section-title">
        <h1>Storage</h1>
        <div class="actions"><button class="btn secondary sm" id="stRefresh">Refresh</button></div>
      </div>
      <div class="notice-strip">Orphan detection is best-effort: it compares file names against the URL columns the app writes.
        Renamed or differently-referenced files may show up here even though they are in use.</div>
      <div class="card">
        <div class="card-head">
          <h3>Bucket</h3>
          <select id="bucketSel" style="width:auto;margin-left:8px">
            ${BUCKETS.map(b => `<option value="${b}">${b}</option>`).join("")}
          </select>
          <span class="muted small" id="bucketStats" style="margin-left:auto"></span>
        </div>
        <div id="stTable"></div>
      </div>`;

    const statsEl = view.querySelector("#bucketStats");
    const dt = UI.datatable({
      columns: [
        { label: "File" },
        { label: "Size" },
        { label: "Created" },
        { label: "Status" },
        { label: "" },
      ],
      emptyText: "No files in this bucket.",
      emptyIcon: "database",
      defaultSortBy: "",
      loader: async (state) => {
        const res = await API.callRpc("admin_list_storage_orphans", {
          p_bucket: currentBucket,
          p_filters: { page: state.page, page_size: state.pageSize },
        });
        if (res.ok) {
          statsEl.innerHTML = `${UI.escapeHtml(res.data.total ?? 0)} files · <b style="color:var(--danger)">${UI.escapeHtml(res.data.orphan_total ?? 0)} orphans</b>`;
        }
        return res;
      },
      renderRow(f) {
        const orphan = f.is_orphan;
        return `<tr class="${orphan ? "row-danger" : ""}">
          <td><span class="cell-main mono" style="font-size:.78rem">${UI.escapeHtml(f.name)}</span></td>
          <td class="muted small">${UI.fmtBytes(f.size)}</td>
          <td class="muted small">${UI.fmtDateTime(f.created_at)}</td>
          <td>${orphan ? UI.badge("orphan", "danger") : UI.badge("referenced", "success")}</td>
          <td>
            <div class="table-actions">
              <button class="btn sm ghost" data-dl="${UI.escapeHtml(f.name)}">⬇</button>
              ${orphan ? `<button class="btn sm danger outline" data-del="${UI.escapeHtml(f.name)}">Delete</button>` : ""}
            </div>
          </td>
        </tr>`;
      },
    });

    const tableHost = view.querySelector("#stTable");
    tableHost.appendChild(dt.element);

    view.querySelector("#bucketSel").addEventListener("change", (e) => {
      currentBucket = e.target.value;
      dt.reload();
    });
    view.querySelector("#stRefresh").addEventListener("click", () => dt.reload());

    dt.element.addEventListener("click", (e) => {
      const dl = e.target.closest("[data-dl]");
      if (dl) {
        API.fileLink(currentBucket, dl.dataset.dl).then(res => {
          if (!res.ok) { UI.toast(res.error, "error"); return; }
          window.open(res.data, "_blank");
        });
        return;
      }
      const del = e.target.closest("[data-del]");
      if (del) {
        UI.confirm({
          title: "Delete storage file?",
          message: `This permanently deletes <span class="mono">${UI.escapeHtml(del.dataset.del)}</span> from the ${currentBucket} bucket. Make sure no app screen references it.`,
          okText: "Delete file", danger: true,
        }).then(async ok => {
          if (!ok) return;
          const res = await API.callRpc("admin_delete_storage_file", { p_bucket: currentBucket, p_path: del.dataset.del });
          if (!res.ok) { UI.toast(res.error, "error"); return; }
          UI.toast("File deleted.", "success");
          dt.reload();
        });
      }
    });
  },
};