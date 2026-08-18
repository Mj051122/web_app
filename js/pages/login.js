/* ============================================================
   Pages.login — admin sign-in screen.
   Two-panel layout: brand panel + form. Sign-in is email +
   password (direct — no OTP at login; the 8-digit code is only
   used when verifying a sign-up). Shows disabled / not-an-admin
   notices, and handles Supabase password-recovery.
   ============================================================ */
window.Pages = window.Pages || {};
Pages.login = {
  async render(root, params) {
    await Auth.ready();

    /* Password-recovery flow: session granted via recovery link. */
    if (Auth.isRecoveryMode()) { renderRecovery(root); return; }

    const res = await Auth.resolveAdmin();
    if (res.status === "ok") { Router.go("/dashboard"); return; }

    let banner = null;
    if (res.status === "disabled") {
      await Auth.signOutLocal();
      banner = "Your admin account is disabled. A super admin must reactivate it.";
    } else if (res.status === "not_admin") {
      await Auth.signOutLocal();
      banner = "This email is not registered as an admin account.";
    } else if (res.status === "error") {
      await Auth.signOutLocal();
      banner = res.error;
    }

    const query = (params && params.query) || {};
    if (!banner && query.error) banner = "That link is invalid or expired. Request a new one.";
    if (!banner && query.disabled) banner = "Your admin account is disabled. A super admin must reactivate it.";
    if (!banner && query.notadmin) banner = "This email is not registered as an admin account.";

    renderStep1(root, banner);
  },
};

/* ---------- email + password ---------- */
const PAW = '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="6.2" cy="5.6" rx="2.1" ry="2.6"/><ellipse cx="12" cy="4.2" rx="2.1" ry="2.6"/><ellipse cx="17.8" cy="5.6" rx="2.1" ry="2.6"/><path d="M12 8.6c-4.1 0-6.6 2.5-6.6 5.5 0 2 1.4 3.3 3.1 3.3 1 0 1.9-.4 3.5-.4s2.5.4 3.5.4c1.7 0 3.1-1.3 3.1-3.3 0-3-2.5-5.5-6.6-5.5z"/></svg>';

function renderStep1(root, banner) {
  root.innerHTML = `
    <div class="login-wrap">
      <div class="login-card">
        <div class="login-brand-panel">
          <a href="#/" class="login-back">${UI.icon("arrowLeft")} Back to home</a>
          <div class="login-brand">
            <span class="logo">${PAW}</span>
            <div>
              <h1>${CONFIG.APP_NAME} Admin</h1>
              <div class="tag">${CONFIG.APP_TAGLINE}</div>
            </div>
          </div>
          <ul class="login-perks">
            <li>${UI.icon("users")} Monitor users, classes and requests</li>
            <li>${UI.icon("pencil")} Grade, correct and announce</li>
            <li>${UI.icon("shieldCheck")} Every action audit-logged</li>
          </ul>
          <div class="login-quote">
            “The mobile app keeps working. You get the control center.”
          </div>
        </div>

        <div class="login-form-panel">
          <h2>Sign in</h2>
          <div class="tag" style="margin-bottom:18px">Restricted access &middot; admins only</div>
          ${banner ? `<div class="info-box" style="color:#1e40af;border-color:#bfdbfe">${UI.escapeHtml(banner)}</div>` : ""}
          <div class="login-error hidden" id="loginError"></div>
          <form id="loginForm" novalidate>
            <div class="field">
              <label for="email">Email</label>
              <input type="email" id="email" name="email" autocomplete="username" required autofocus />
            </div>
            <div class="field">
              <label for="password">Password</label>
              <input type="password" id="password" name="password" autocomplete="current-password" required />
              <span class="hint"><a href="#" id="forgotPw">Forgot password?</a></span>
            </div>
            <button class="btn lg" type="submit" id="loginBtn" style="width:100%;justify-content:center">
              <span id="loginBtnLabel">Sign in</span>
            </button>
          </form>
          <div class="login-foot">
            Not an admin yet? <a href="#/signup">Request access</a>
            &middot; <a href="#/" class="muted">Back to home</a>
          </div>
        </div>
      </div>
    </div>`;

  const form = root.querySelector("#loginForm");
  const errBox = root.querySelector("#loginError");
  const btn = root.querySelector("#loginBtn");
  const btnLabel = root.querySelector("#loginBtnLabel");

  const showError = (msg) => {
    errBox.textContent = msg;
    errBox.classList.remove("hidden");
  };

  root.querySelector("#forgotPw").addEventListener("click", (e) => {
    e.preventDefault();
    forgotPasswordModal(form.email.value.trim());
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errBox.classList.add("hidden");
    const email = form.email.value.trim().toLowerCase();
    const password = form.password.value;
    if (!email || !password) { showError("Enter both email and password."); return; }

    btn.disabled = true;
    btnLabel.innerHTML = `<span class="spin" style="border-top-color:#fff"></span> Signing in\u2026`;
    const res = await Auth.login(email, password);
    if (!res.ok) {
      btn.disabled = false;
      btnLabel.textContent = "Sign in";
      if (res.disabled) {
        renderStep1(root, "Your admin account is disabled. A super admin must reactivate it.");
        return;
      }
      showError(res.error);
      return;
    }
    UI.toast("Welcome back!", "success");
    Router.go("/dashboard");
  });
}

/* ---------- forgot password ---------- */
function forgotPasswordModal(knownEmail) {
  const m = UI.modal({ title: "Reset your password", subtitle: "We'll email you a secure link", size: "sm", footer: `
    <button class="btn secondary cancel">Cancel</button>
    <button class="btn ok" id="fpSend">Send reset link</button>` });
  m.body.innerHTML = `
    <div class="field">
      <label>Email *</label>
      <input type="email" id="fpEmail" value="${UI.escapeHtml(knownEmail || "")}" required autofocus />
    </div>
    <div class="field error" id="fpErr" style="display:none"></div>
    <div class="hint" style="font-size:.76rem;color:var(--text-3)">
      The reset link works for a short time. If you don't see the email, check spam.
    </div>`;
  m.foot.querySelector(".cancel").addEventListener("click", m.close);
  m.foot.querySelector("#fpSend").addEventListener("click", async (e) => {
    const email = m.body.querySelector("#fpEmail").value.trim().toLowerCase();
    const err = m.body.querySelector("#fpErr");
    if (!email) { err.textContent = "Enter your email."; err.style.display = "block"; return; }
    err.style.display = "none";
    const btn = e.target; btn.disabled = true;
    const res = await Auth.forgotPassword(email);
    btn.disabled = false;
    if (!res.ok) { err.textContent = res.error; err.style.display = "block"; return; }
    m.close();
    UI.toast("If an admin account exists for that email, a reset link is on its way.", "success");
  });
}

/* ---------- recovery: set a new password ---------- */
function renderRecovery(root) {
  root.innerHTML = `
    <div class="login-wrap">
      <div class="login-card">
        <div class="login-brand-panel">
          <a href="#/" class="login-back">${UI.icon("arrowLeft")} Back to home</a>
          <div class="login-brand">
            <span class="logo">${PAW}</span>
            <div>
              <h1>${CONFIG.APP_NAME} Admin</h1>
              <div class="tag">${CONFIG.APP_TAGLINE}</div>
            </div>
          </div>
          <ul class="login-perks">
            <li>${UI.icon("users")} Monitor users, classes and requests</li>
            <li>${UI.icon("pencil")} Grade, correct and announce</li>
            <li>${UI.icon("shieldCheck")} Every action audit-logged</li>
          </ul>
        </div>

        <div class="login-form-panel">
          <h2>Set a new password</h2>
          <div class="tag" style="margin-bottom:18px">Password recovery</div>
          <div class="login-error hidden" id="loginError"></div>
          <form id="recForm" novalidate>
            <div class="field">
              <label for="npw">New password *</label>
              <input type="password" id="npw" minlength="8" required autofocus />
            </div>
            <div class="field">
              <label for="npw2">Confirm new password *</label>
              <input type="password" id="npw2" minlength="8" required />
            </div>
            <button class="btn lg" type="submit" id="recBtn" style="width:100%;justify-content:center">
              <span id="recBtnLabel">Update password</span>
            </button>
          </form>
          <div class="login-foot"><a href="#/login">Back to sign in</a></div>
        </div>
      </div>
    </div>`;

  const errBox = root.querySelector("#loginError");
  const btn = root.querySelector("#recBtn");
  const btnLabel = root.querySelector("#recBtnLabel");
  const showError = (msg) => { errBox.textContent = msg; errBox.classList.remove("hidden"); };

  root.querySelector("#recForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    errBox.classList.add("hidden");
    const pw = root.querySelector("#npw").value;
    const pw2 = root.querySelector("#npw2").value;
    if (pw.length < 8) { showError("Password must be at least 8 characters."); return; }
    if (pw !== pw2) { showError("Passwords do not match."); return; }

    btn.disabled = true;
    btnLabel.innerHTML = `<span class="spin" style="border-top-color:#fff"></span> Updating\u2026`;
    const res = await Auth.changePassword(pw);
    if (!res.ok) { btn.disabled = false; btnLabel.textContent = "Update password"; showError(res.error); return; }

    await API.callRpc("admin_log_self_action", { p_action: "admin_update_own_password" });
    await Auth.signOutLocal();
    Auth.finishRecovery();
    UI.toast("Password updated. Sign in with your new password.", "success");
    location.hash = "#/login";
  });
}
