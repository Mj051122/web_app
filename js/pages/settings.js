/* ============================================================
   Pages.settings — your account (change password) and, for
   super admins, management of admin_users (invite, roles,
   enable/disable, read-only ↔ edit toggle, reset password).
   Server enforces super_admin for all admin management.
   ============================================================ */
window.Pages = window.Pages || {};
Pages.settings = {
  async render(view) {
    const me = Auth.admin() || {};
    const isSuper = Auth.isSuper();

    view.innerHTML = `
      <div class="section-title"><h1>Settings</h1></div>

      <div class="grid" style="grid-template-columns:1fr 1fr;align-items:start">
        <div class="card">
          <div class="card-head"><h3>My account</h3></div>
          <div class="card-body">
            <div class="kv" style="margin-bottom:14px">
              <div class="kv-row"><span class="k">Email</span><span class="v">${UI.escapeHtml(me.email)}</span></div>
              <div class="kv-row"><span class="k">Name</span><span class="v">${UI.escapeHtml(me.full_name || "—")}</span></div>
              <div class="kv-row"><span class="k">Role</span><span class="v">${UI.badge(me.role)}</span></div>
              <div class="kv-row"><span class="k">Access</span><span class="v">${me.can_edit ? UI.badge("can edit", "success") : UI.badge("read-only", "warning")}</span></div>
            </div>
            <button class="btn" id="changePw">Change my password</button>
          </div>
        </div>

        ${isSuper ? `
        <div class="card">
          <div class="card-head">
            <h3>Admin accounts</h3>
            <div class="seg" id="adminTabs" style="margin-left:auto">
              <button class="seg-btn active" data-edit="">All</button>
              <button class="seg-btn" data-edit="false">Read-only</button>
              <button class="seg-btn" data-edit="true">Can edit</button>
            </div>
            <button class="btn sm" id="inviteAdmin" style="margin-left:8px">${UI.icon("plus")} Invite admin</button>
          </div>
          <div id="adminList" class="card-body flush">${UI.loading()}</div>
        </div>` : `
        <div class="card">
          <div class="card-body">
            <div class="info-box">You are an <b>admin</b>. Managing other admin accounts is reserved for <b>super admins</b>.</div>
          </div>
        </div>`}
      </div>`;

    view.querySelector("#changePw").addEventListener("click", changeMyPassword);

    if (isSuper) {
      const listEl = view.querySelector("#adminList");
      const tabs = view.querySelector("#adminTabs");
      let editFilter = "";

      const loadAdmins = async () => {
        listEl.innerHTML = UI.loading();
        const r = await API.callRpc("admin_list_admin_users", {
          p_filters: { can_edit: editFilter || null, page: 1, page_size: 200 },
        });
        if (!r.ok) { listEl.innerHTML = UI.empty(r.error, "alert"); return; }
        const rows = r.data.rows || [];
        listEl.innerHTML = rows.map(a => {
          const accessBadge = a.can_edit
            ? UI.badge("can edit", "success")
            : UI.badge("read-only", "warning");
          const stateBadge = a.is_active ? "" : UI.badge("disabled", "danger");
          const isSelf = a.id === me.id;
          return `
            <div style="padding:12px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px">
              <span class="avatar">${UI.escapeHtml(UI.initials(a.full_name || a.email))}</span>
              <div style="flex:1;min-width:0">
                <div style="font-weight:600;font-size:.86rem">${UI.escapeHtml(a.full_name || a.email)}${isSelf ? ' <span class="small muted">(you)</span>' : ""}</div>
                <div class="small muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                  ${UI.escapeHtml(a.email)} · ${UI.badge(a.role)} ${accessBadge} ${stateBadge}
                </div>
              </div>
              <div class="table-actions">
                ${a.can_edit
                  ? `<button class="act" data-edit-off="${a.id}" data-name="${UI.escapeHtml(a.email)}" title="Make read-only">${UI.icon("shieldOff")}</button>`
                  : `<button class="act success" data-edit-on="${a.id}" data-name="${UI.escapeHtml(a.email)}" title="Grant edit access">${UI.icon("shieldCheck")}</button>`}
                ${a.is_active && !isSelf
                  ? `<button class="act ${a.role === "super_admin" ? "" : "danger"}" data-toggle="${a.id}" data-name="${UI.escapeHtml(a.email)}" title="Disable">${UI.icon("power")}</button>` : ""}
                ${!a.is_active && !isSelf
                  ? `<button class="act success" data-toggle="${a.id}" data-name="${UI.escapeHtml(a.email)}" title="Enable">${UI.icon("power")}</button>` : ""}
                ${!isSelf
                  ? `<button class="act primary" data-edit="${a.id}" data-name="${UI.escapeHtml(a.email)}" title="Edit">${UI.icon("pencil")}</button>
                     <button class="act" data-resetpw="${a.id}" data-name="${UI.escapeHtml(a.email)}" title="Reset password">${UI.icon("key")}</button>` : ""}
              </div>
            </div>`;
        }).join("") || UI.empty("No admins match this filter.", "settings");

        listEl.querySelectorAll("[data-edit-on]").forEach(b => b.addEventListener("click", () => toggleEdit(b.dataset.editOn, b.dataset.name, true, loadAdmins)));
        listEl.querySelectorAll("[data-edit-off]").forEach(b => b.addEventListener("click", () => toggleEdit(b.dataset.editOff, b.dataset.name, false, loadAdmins)));
        listEl.querySelectorAll("[data-toggle]").forEach(b => b.addEventListener("click", () => toggleAdmin(b.dataset.toggle, b.dataset.name, loadAdmins)));
        listEl.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => editAdmin(b.dataset.edit, b.dataset.name, loadAdmins)));
        listEl.querySelectorAll("[data-resetpw]").forEach(b => b.addEventListener("click", () => resetAdminPassword(b.dataset.resetpw, b.dataset.name, loadAdmins)));
      };

      tabs.querySelectorAll(".seg-btn").forEach(btn => btn.addEventListener("click", () => {
        tabs.querySelectorAll(".seg-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        editFilter = btn.dataset.edit;
        loadAdmins();
      }));

      loadAdmins();
      view.querySelector("#inviteAdmin").addEventListener("click", () => inviteAdmin(loadAdmins));
    }
  },
};

/* ---------- change my password ---------- */
function changeMyPassword() {
  const m = UI.modal({ title: "Change my password", size: "sm", footer: `
    <button class="btn secondary cancel">Cancel</button>
    <button class="btn ok" id="pwSave">Update password</button>` });
  m.body.innerHTML = `
    <div class="field"><label>New password *</label><input type="password" id="newPw" minlength="8" required autofocus /></div>
    <div class="field"><label>Confirm new password *</label><input type="password" id="newPw2" minlength="8" required /></div>
    <div class="field error" id="pwErr" style="display:none"></div>`;
  m.foot.querySelector(".cancel").addEventListener("click", m.close);
  m.foot.querySelector("#pwSave").addEventListener("click", async (e) => {
    const pw = m.body.querySelector("#newPw").value;
    const pw2 = m.body.querySelector("#newPw2").value;
    const err = m.body.querySelector("#pwErr");
    if (pw.length < 8) { err.textContent = "Password must be at least 8 characters."; err.style.display = "block"; return; }
    if (pw !== pw2) { err.textContent = "Passwords do not match."; err.style.display = "block"; return; }
    err.style.display = "none";
    const btn = e.target; btn.disabled = true;
    const res = await Auth.changePassword(pw);
    if (!res.ok) { btn.disabled = false; UI.toast(res.error, "error"); return; }
    await API.callRpc("admin_log_self_action", { p_action: "admin_update_own_password" });
    UI.toast("Password updated.", "success");
    m.close();
  });
}

/* ---------- admin management (super admin) ---------- */
function inviteAdmin(after) {
  const m = UI.modal({ title: "Invite an admin", subtitle: "Creates the account — the invitee sets their own password via \"Forgot password\"", size: "md", footer: `
    <button class="btn secondary cancel">Cancel</button>
    <button class="btn ok" id="adInvite">Send invite</button>` });
  m.body.innerHTML = `
    <form id="adForm" novalidate>
      <div class="field"><label>Email *</label><input type="email" name="email" required autofocus /></div>
      <div class="field"><label>Full name</label><input type="text" name="full_name" /></div>
      <div class="field"><label>Role</label>
        <select name="role">
          <option value="admin">admin</option>
          <option value="super_admin">super_admin</option>
        </select></div>
    </form>`;
  m.foot.querySelector(".cancel").addEventListener("click", m.close);
  m.foot.querySelector("#adInvite").addEventListener("click", async (e) => {
    const form = m.body.querySelector("#adForm");
    if (!form.reportValidity()) return;
    const btn = e.target; btn.disabled = true;
    const d = Object.fromEntries(new FormData(form).entries());
    const res = await API.callRpc("admin_invite_admin", {
      p_email: d.email.trim().toLowerCase(),
      p_full_name: d.full_name.trim(),
      p_role: d.role,
    });
    if (!res.ok) { btn.disabled = false; UI.toast(res.error, "error"); return; }
    m.close();
    UI.toast("Invited. The new admin must use \"Forgot password\" to set their own password.", "success");
    after();
  });
}

function toggleEdit(id, name, grant, after) {
  const grantEdit = grant;
  UI.confirm({
    title: grantEdit ? "Grant edit access?" : "Make read-only?",
    message: grantEdit
      ? `${name} will be able to create, edit and delete data.`
      : `${name} will only be able to view data.`,
    okText: grantEdit ? "Grant edit" : "Make read-only",
    danger: !grantEdit,
  }).then(async ok => {
    if (!ok) return;
    const res = await API.callRpc("admin_update_admin", { p_admin_id: id, p_data: { can_edit: grantEdit } });
    if (!res.ok) { UI.toast(res.error, "error"); return; }
    UI.toast(grantEdit ? `${name} can now edit.` : `${name} is now read-only.`, "success");
    after();
  });
}

function editAdmin(id, name, after) {
  API.callRpc("admin_list_admin_users", { p_filters: { admin_id: id, page: 1, page_size: 1 } }).then(r => {
    if (!r.ok || !(r.data.rows || []).length) { UI.toast(r.ok ? "Not found." : r.error, "error"); return; }
    const a = r.data.rows[0];
    const m = UI.modal({ title: "Edit admin", subtitle: a.email, size: "md", footer: `
      <button class="btn secondary cancel">Cancel</button>
      <button class="btn ok" id="adSave">Save</button>` });
    m.body.innerHTML = `
      <form id="adForm" novalidate>
        <div class="field"><label>Full name</label><input type="text" name="full_name" value="${UI.escapeHtml(a.full_name || "")}" /></div>
        <div class="field"><label>Role</label>
          <select name="role">
            <option value="admin" ${a.role === "admin" ? "selected" : ""}>admin</option>
            <option value="super_admin" ${a.role === "super_admin" ? "selected" : ""}>super_admin</option>
          </select></div>
      </form>`;
    m.foot.querySelector(".cancel").addEventListener("click", m.close);
    m.foot.querySelector("#adSave").addEventListener("click", async (e) => {
      const form = m.body.querySelector("#adForm");
      if (!form.reportValidity()) return;
      const btn = e.target; btn.disabled = true;
      const data = Object.fromEntries(new FormData(form).entries());
      const res = await API.callRpc("admin_update_admin", { p_admin_id: id, p_data: data });
      if (!res.ok) { btn.disabled = false; UI.toast(res.error, "error"); return; }
      UI.toast("Admin updated.", "success");
      m.close(); after();
    });
  });
}

function toggleAdmin(id, name, after) {
  API.callRpc("admin_list_admin_users", { p_filters: { admin_id: id, page: 1, page_size: 1 } }).then(r => {
    if (!r.ok || !(r.data.rows || []).length) return;
    const a = r.data.rows[0];
    const disable = a.is_active;
    UI.confirm({
      title: disable ? "Disable admin?" : "Enable admin?",
      message: disable ? `${a.email} will no longer be able to sign in.` : `${a.email} can sign in again.`,
      okText: disable ? "Disable" : "Enable", danger: disable,
    }).then(async ok => {
      if (!ok) return;
      const res = await API.callRpc("admin_update_admin", { p_admin_id: id, p_data: { is_active: !a.is_active } });
      if (!res.ok) { UI.toast(res.error, "error"); return; }
      UI.toast("Admin updated.", "success");
      after();
    });
  });
}

function resetAdminPassword(id, name, after) {
  const m = UI.modal({ title: "Reset password", subtitle: name, size: "sm", footer: `
    <button class="btn secondary cancel">Cancel</button>
    <button class="btn ok" id="rpSave">Reset password</button>` });
  m.body.innerHTML = `
    <div class="field"><label>New password *</label><input type="password" id="rpPw" minlength="8" required autofocus /></div>
    <div class="field error" id="rpErr" style="display:none"></div>`;
  m.foot.querySelector(".cancel").addEventListener("click", m.close);
  m.foot.querySelector("#rpSave").addEventListener("click", async (e) => {
    const pw = m.body.querySelector("#rpPw").value;
    const err = m.body.querySelector("#rpErr");
    if (pw.length < 8) { err.textContent = "Password must be at least 8 characters."; err.style.display = "block"; return; }
    err.style.display = "none";
    const btn = e.target; btn.disabled = true;
    const res = await API.callRpc("admin_reset_admin_password", { p_admin_id: id, p_new_password: pw });
    if (!res.ok) { btn.disabled = false; UI.toast(res.error, "error"); return; }
    UI.toast("Password reset. Tell the admin their new password.", "success");
    m.close();
  });
}
