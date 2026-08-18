/* ============================================================
   Pages.notifications — send and review admin notifications.
   Audience: students, faculties, or everyone. Read tracking
   happens on the mobile app via notification_reads.
   ============================================================ */
window.Pages = window.Pages || {};
Pages.notifications = (() => {

  let lastRows = [];

  const AUDIENCES = [
    { key: "students", label: "Students" },
    { key: "faculties", label: "Faculties" },
    { key: "all", label: "Everyone" },
  ];

  const AUD_BADGE = { students: "info", faculties: "warning", all: "primary" };

  function audienceBadge(a) {
    const label = (AUDIENCES.find(x => x.key === a) || {}).label || a;
    return UI.badge(label, AUD_BADGE[a] || "neutral");
  }

  const ICONS = {
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    grad: '<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>',
    all: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  };
  const icon = (name) => `<svg class="icn" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ""}</svg>`;

  function statCard(label, value, sub, iconName) {
    return `
      <div class="stat-card">
        <div class="stat-top">
          <div>
            <div class="stat-label">${label}</div>
            <div class="stat-value">${UI.escapeHtml(value)}</div>
            <div class="stat-sub">${sub}</div>
          </div>
          <span class="stat-icon">${icon(iconName)}</span>
        </div>
      </div>`;
  }

  /* ---------- compose modal ---------- */
  function openCompose(counts, onSent) {
    let audience = "students";
    const m = UI.modal({
      title: "Send notification",
      subtitle: "Everyone in the chosen audience sees it on their next app visit.",
      size: "md",
      body: `
        <div class="field">
          <label>Send to</label>
          <div class="seg" id="audSeg">
            ${AUDIENCES.map(a => `
              <button type="button" class="seg-btn ${a.key === audience ? "active" : ""}" data-aud="${a.key}">
                ${icon(a.key === "students" ? "users" : a.key === "faculties" ? "grad" : "all")} ${a.label}
              </button>`).join("")}
          </div>
          <div class="small muted" id="audHint" style="margin-top:7px"><b>${counts.students}</b> students will receive this.</div>
        </div>
        <div class="field">
          <label>Title</label>
          <input type="text" id="ntfTitle" maxlength="120" placeholder="e.g. System maintenance tonight" />
        </div>
        <div class="field">
          <label>Message</label>
          <textarea id="ntfMessage" rows="5" maxlength="1000" placeholder="Write the announcement\u2026"></textarea>
        </div>`,
      footer: `
        <button class="btn secondary cancel">Cancel</button>
        <button class="btn send" id="sendBtn">${icon("send")} Send notification</button>`,
    });

    const seg = m.body.querySelector("#audSeg");
    const hint = m.body.querySelector("#audHint");
    seg.addEventListener("click", (e) => {
      const b = e.target.closest(".seg-btn");
      if (!b) return;
      audience = b.dataset.aud;
      seg.querySelectorAll(".seg-btn").forEach(x => x.classList.toggle("active", x === b));
      hint.innerHTML = audience === "all"
        ? `<b>${counts.students + counts.faculties}</b> users (${counts.students} students, ${counts.faculties} faculties) will receive this.`
        : audience === "students"
          ? `<b>${counts.students}</b> students will receive this.`
          : `<b>${counts.faculties}</b> faculties will receive this.`;
    });

    const titleEl = m.body.querySelector("#ntfTitle");
    const msgEl = m.body.querySelector("#ntfMessage");
    const sendBtn = m.foot.querySelector("#sendBtn");

    sendBtn.addEventListener("click", async () => {
      const title = titleEl.value.trim();
      const message = msgEl.value.trim();
      if (!title) { titleEl.focus(); UI.toast("A title is required.", "warning"); return; }
      if (!message) { msgEl.focus(); UI.toast("A message is required.", "warning"); return; }
      sendBtn.disabled = true;
      sendBtn.innerHTML = `<span class="spin"></span> Sending\u2026`;
      const res = await API.callRpc("admin_send_notification", { p_data: { title, message, audience } });
      sendBtn.disabled = false;
      sendBtn.innerHTML = `${icon("send")} Send notification`;
      if (!res.ok) { UI.toast(res.error || "Failed to send.", "error"); return; }
      UI.toast("Notification sent.");
      m.close();
      if (onSent) onSent();
    });

    m.foot.querySelector(".cancel").addEventListener("click", m.close);
    m.body.querySelector("#ntfTitle").focus();
  }

  /* ---------- view modal ---------- */
  function openView(n) {
    const pct = n.recipient_count > 0 ? Math.round((n.read_count / n.recipient_count) * 100) : 0;
    UI.modal({
      title: n.title,
      subtitle: `${audienceBadge(n.audience)} &nbsp;&middot;&nbsp; by ${UI.escapeHtml(n.sent_by || "—")} &middot; ${UI.fmtDate(n.created_at)}`,
      size: "md",
      body: `
        <div style="white-space:pre-wrap;font-size:.92rem;color:var(--text);line-height:1.6">${UI.escapeHtml(n.message || "—")}</div>
        <div style="margin-top:18px">
          <div style="display:flex;justify-content:space-between;margin-bottom:6px">
            <span class="small muted">Read by <b>${n.read_count} of ${n.recipient_count}</b> recipients</span>
            <span class="small muted">${pct}%</span>
          </div>
          <div class="progress-track"><div class="progress-fill" style="width:${Math.min(100, pct)}%"></div></div>
        </div>`,
      footer: `<button class="btn secondary ok">Close</button>`,
    }).foot.querySelector(".ok").addEventListener("click", () => UI.closeModals());
  }

  /* ---------- list ---------- */
  async function render(view) {
    view.innerHTML = UI.loading("Loading notifications\u2026");

    const [listRes, stuRes, facRes] = await Promise.all([
      API.callRpc("admin_list_notifications", { p_filters: { page: 1, page_size: 1 } }),
      API.callRpc("admin_list_users", { p_filters: { role: "student", page: 1, page_size: 1 } }),
      API.callRpc("admin_list_users", { p_filters: { role: "professor", page: 1, page_size: 1 } }),
    ]);

    if (!listRes.ok) {
      view.innerHTML = `<div class="card card-body">${UI.empty(listRes.error, "alert", "Load failed")}</div>`;
      return;
    }
    const counts = {
      students: stuRes.ok ? (stuRes.data.total || 0) : 0,
      faculties: facRes.ok ? (facRes.data.total || 0) : 0,
    };

    view.innerHTML = `
      <div class="section-title">
        <h1>Notifications</h1>
        <div class="actions">${Auth.canEdit() ? `<button class="btn" id="composeBtn">${icon("bell")} Send notification</button>` : ""}</div>
      </div>
      <div class="grid cols-4" style="margin-bottom:16px">
        ${statCard("Sent", listRes.data.total, "total notifications", "bell")}
        ${statCard("Students", counts.students, "can receive", "users")}
        ${statCard("Faculties", counts.faculties, "can receive", "grad")}
        ${statCard("Everyone", counts.students + counts.faculties, "total audience", "all")}
      </div>
      <div id="ntfTable"></div>`;

    view.querySelectorAll(".stat-value").forEach(v => UI.countUp(v));

    const dt = UI.datatable({
      columns: [
        { label: "Notification", sortable: true, sortBy: "title" },
        { label: "Audience" },
        { label: "Read" },
        { label: "Sent by" },
        { label: "Sent" },
        { label: "" },
      ],
      emptyText: "No notifications sent yet. Send your first one above.",
      emptyIcon: "bell",
      defaultSortBy: "created_at",
      toolbarFilters: (el, setFilter) => {
        el.innerHTML = `
          <select data-k="audience">
            <option value="">All audiences</option>
            ${AUDIENCES.map(a => `<option value="${a.key}">${a.label}</option>`).join("")}
          </select>`;
        el.querySelector("select").addEventListener("change", (e) => setFilter("audience", e.target.value || null));
      },
      loader: async (state) => {
        const res = await API.callRpc("admin_list_notifications", {
          p_filters: {
            page: state.page,
            page_size: state.pageSize,
            search: state.search || null,
            audience: state.filters.audience || null,
          },
        });
        if (!res.ok) return { ok: false, error: res.error };
        lastRows = res.data.rows || [];
        return { ok: true, data: res.data };
      },
      renderRow(n) {
        const pct = n.recipient_count > 0 ? Math.round((n.read_count / n.recipient_count) * 100) : 0;
        return `<tr>
          <td>
            <a href="#" class="ntf-link" data-id="${n.id}">
              <span class="cell-main">${UI.escapeHtml(n.title)}</span>
              ${n.message ? `<br><span class="cell-sub" style="max-width:420px;display:inline-block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;vertical-align:bottom">${UI.escapeHtml(n.message)}</span>` : ""}
            </a>
          </td>
          <td>${audienceBadge(n.audience)}</td>
          <td>
            <span class="cell-main">${n.read_count} / ${n.recipient_count}</span>
            <div class="progress-track" style="width:110px;height:5px;margin-top:3px">
              <div class="progress-fill" style="width:${Math.min(100, pct)}%"></div>
            </div>
          </td>
          <td class="muted">${UI.escapeHtml(n.sent_by || "—")}</td>
          <td class="muted">${UI.timeAgo(n.created_at)}</td>
          <td>
            <div class="table-actions">
              <a class="act primary ntf-view" data-id="${n.id}" title="View notification">${UI.icon("eye")}</a>
            </div>
          </td>
        </tr>`;
      },
    });

    const tableHost = view.querySelector("#ntfTable");
    tableHost.appendChild(dt.element);

    dt.element.addEventListener("click", (e) => {
      const el = e.target.closest(".ntf-link, .ntf-view");
      if (!el) return;
      e.preventDefault();
      const row = lastRows.find(r => String(r.id) === String(el.dataset.id));
      if (row) openView(row);
    });

    if (Auth.canEdit()) {
      view.querySelector("#composeBtn").addEventListener("click", () =>
        openCompose(counts, () => { dt.reload(); Pages.notifications.render(view); }));
    }
  }

  return { render };
})();