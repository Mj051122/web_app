/* ============================================================
   Pages.signup — public admin sign-up request.
   Creates a Supabase Auth user flagged admin_signup. The
   trigger in SQL 001 creates an ACTIVE admin_users row that
   starts READ-ONLY until a super admin grants edit access.
   ============================================================ */
window.Pages = window.Pages || {};
Pages.signup = {
  async render(root) {
    await Auth.ready();

    const res = await Auth.resolveAdmin();
    if (res.status === "ok") { Router.go("/dashboard"); return; }
    if (res.status === "disabled" || res.status === "not_admin" || res.status === "error") {
      await Auth.signOutLocal();
    }

    const PAW = '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="6.2" cy="5.6" rx="2.1" ry="2.6"/><ellipse cx="12" cy="4.2" rx="2.1" ry="2.6"/><ellipse cx="17.8" cy="5.6" rx="2.1" ry="2.6"/><path d="M12 8.6c-4.1 0-6.6 2.5-6.6 5.5 0 2 1.4 3.3 3.1 3.3 1 0 1.9-.4 3.5-.4s2.5.4 3.5.4c1.7 0 3.1-1.3 3.1-3.3 0-3-2.5-5.5-6.6-5.5z"/></svg>';

    root.innerHTML = `
      <div class="login-wrap">
        <div class="login-card">
          <div class="login-brand-panel">
            <a href="#/" class="login-back">&larr; Back to home</a>
            <div class="login-brand">
              <span class="logo">${PAW}</span>
              <div>
                <h1>${CONFIG.APP_NAME} Admin</h1>
                <div class="tag">${CONFIG.APP_TAGLINE}</div>
              </div>
            </div>
            <ul class="login-perks">
              <li>You'll sign in with email + password</li>
              <li>You start read-only — a super admin can grant edit access</li>
              <li>Every action you take is audit-logged</li>
            </ul>
            <div class="login-quote">
              “Request access now, get editing rights later.”
            </div>
          </div>

          <div class="login-form-panel">
            <h2>Request admin access</h2>
            <div class="tag" style="margin-bottom:18px">You'll start in read-only mode — edit access is granted by a super admin</div>
            <div class="login-error hidden" id="signupError"></div>
            <form id="signupForm" novalidate>
              <div class="field">
                <label for="fullName">Full name *</label>
                <input type="text" id="fullName" name="full_name" required autofocus />
              </div>
              <div class="field">
                <label for="email">Email *</label>
                <input type="email" id="email" name="email" autocomplete="email" required />
              </div>
              <div class="field">
                <label for="password">Password *</label>
                <input type="password" id="password" name="password" minlength="8" autocomplete="new-password" required />
                <span class="hint">At least 8 characters.</span>
              </div>
              <div class="field">
                <label for="password2">Confirm password *</label>
                <input type="password" id="password2" name="password2" minlength="8" autocomplete="new-password" required />
              </div>
              <button class="btn lg" type="submit" id="signupBtn" style="width:100%;justify-content:center">
                <span id="signupBtnLabel">Request access</span>
              </button>
            </form>
            <div class="login-foot">
              Already an admin? <a href="#/login">Sign in</a>
              &middot; <a href="#/" class="muted">Back to home</a>
            </div>
          </div>
        </div>
      </div>`;

    const form = root.querySelector("#signupForm");
    const errBox = root.querySelector("#signupError");
    const btn = root.querySelector("#signupBtn");
    const btnLabel = root.querySelector("#signupBtnLabel");
    const showError = (msg) => { errBox.textContent = msg; errBox.classList.remove("hidden"); };

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errBox.classList.add("hidden");
      const fullName = form.full_name.value.trim();
      const email = form.email.value.trim().toLowerCase();
      const pw = form.password.value;
      const pw2 = form.password2.value;

      if (!fullName) { showError("Enter your full name."); return; }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { showError("Enter a valid email address."); return; }
      if (pw.length < 8) { showError("Password must be at least 8 characters."); return; }
      if (pw !== pw2) { showError("Passwords do not match."); return; }

      btn.disabled = true;
      btnLabel.innerHTML = `<span class="spin" style="border-top-color:#fff"></span> Submitting\u2026`;
      const res = await Auth.signUp(fullName, email, pw);
      if (!res.ok) {
        /* Already registered (e.g. resubmitted)? Jump to the code step. */
        if (/already registered|already been registered/i.test(res.error)) {
          renderCodeStep(root, email);
          return;
        }
        btn.disabled = false;
        btnLabel.textContent = "Request access";
        showError(res.error);
        return;
      }
      renderCodeStep(root, email);
    });
  },
};

/* ---------- step 2: paste the emailed code ---------- */
function renderCodeStep(root, email) {
  const panel = root.querySelector(".login-form-panel");
  panel.innerHTML = `
    <h2>Verify your email</h2>
    <div class="tag" style="margin-bottom:18px">We emailed an 8-digit code to <b>${UI.escapeHtml(email)}</b></div>
    <div class="login-error hidden" id="codeError"></div>
    <form id="codeForm" novalidate>
      <div class="field">
        <label for="code">8-digit code</label>
        <input type="text" id="code" name="code" inputmode="numeric" autocomplete="one-time-code"
               maxlength="8" pattern="[0-9]{8}" required autofocus style="font-size:1.3rem;letter-spacing:6px;text-align:center" />
        <span class="hint" id="codeHint">Copy the code from the email and paste it here.</span>
      </div>
      <button class="btn lg" type="submit" id="codeBtn" style="width:100%;justify-content:center">
        <span id="codeBtnLabel">Verify &amp; finish</span>
      </button>
    </form>
    <div class="login-foot">
      <a href="#" id="resendCode">Resend code</a>
      &middot; <a href="#" id="useOther">Use a different email</a>
    </div>`;

  const form = panel.querySelector("#codeForm");
  const errBox = panel.querySelector("#codeError");
  const btn = panel.querySelector("#codeBtn");
  const btnLabel = panel.querySelector("#codeBtnLabel");
  const showError = (msg) => { errBox.textContent = msg; errBox.classList.remove("hidden"); };

  panel.querySelector("#resendCode").addEventListener("click", async (e) => {
    e.preventDefault();
    const hint = panel.querySelector("#codeHint");
    hint.textContent = "Sending a new code\u2026";
    const res = await Auth.resendSignupCode(email);
    hint.textContent = res.ok
      ? "A new code is on its way."
      : "Could not send the code: " + res.error;
  });

  panel.querySelector("#useOther").addEventListener("click", (e) => {
    e.preventDefault();
    Pages.signup.render(root);
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errBox.classList.add("hidden");
    const token = form.code.value.trim();
    if (!/^[0-9]{8}$/.test(token)) { showError("Paste the 8-digit code from the email."); return; }

    btn.disabled = true;
    btnLabel.innerHTML = `<span class="spin" style="border-top-color:#fff"></span> Verifying\u2026`;
    const res = await Auth.confirmSignup(email, token);
    if (!res.ok) {
      btn.disabled = false;
      btnLabel.textContent = "Verify & finish";
      showError(res.error);
      return;
    }

    panel.innerHTML = `
      <h2>Request received</h2>
      <div class="tag" style="margin-bottom:18px">Email verified — you're in</div>
      <div class="info-box" style="color:#1e40af;border-color:#bfdbfe">
        <b>You can sign in now.</b> Your account starts in <b>read-only mode</b>:
        you can view everything, but editing is locked until a super admin
        grants you edit access (Settings &rarr; Admin accounts).
      </div>
      <a class="btn lg" href="#/login" style="width:100%;justify-content:center">Back to sign in</a>
      <div class="login-foot"><a href="#/">Back to home</a></div>`;
  });
}
