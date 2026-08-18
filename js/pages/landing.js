/* ============================================================
   Pages.landing — public landing page (default route).
   Shown to everyone; the CTA adapts to session state.
   ============================================================ */
window.Pages = window.Pages || {};
Pages.landing = {
  async render(root) {
    await Auth.ready();
    const res = await Auth.resolveAdmin();
    const admin = res.status === "ok" ? res.admin : null;

    const primaryCta = admin
      ? `<a class="btn lg" href="#/dashboard">Open dashboard ${UI.icon("arrowRight")}</a>`
      : `<a class="btn lg" href="#/login">Sign in to the admin panel</a>`;

    const PAW = '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="6.2" cy="5.6" rx="2.1" ry="2.6"/><ellipse cx="12" cy="4.2" rx="2.1" ry="2.6"/><ellipse cx="17.8" cy="5.6" rx="2.1" ry="2.6"/><path d="M12 8.6c-4.1 0-6.6 2.5-6.6 5.5 0 2 1.4 3.3 3.1 3.3 1 0 1.9-.4 3.5-.4s2.5.4 3.5.4c1.7 0 3.1-1.3 3.1-3.3 0-3-2.5-5.5-6.6-5.5z"/></svg>';

    root.innerHTML = `
      <div class="landing">
        <header class="landing-nav">
          <a href="#/" class="landing-brand"><span class="logo">${PAW}</span> ${CONFIG.APP_NAME}<small>Admin</small></a>
          <div class="landing-nav-actions">
            ${admin
              ? `<span class="muted small" style="margin-right:8px">Signed in as ${UI.escapeHtml(admin.full_name || admin.email)}</span>
                 <a class="btn sm" href="#/dashboard">Dashboard</a>
                 <button class="btn sm ghost" id="landingLogout">${UI.icon("logout")} Log out</button>`
              : `<a class="btn sm ghost" href="#/signup">Request access</a>
                 <a class="btn sm" href="#/login">Sign in</a>`}
          </div>
        </header>

        <section class="landing-hero">
          <span class="landing-badge">${CONFIG.APP_TAGLINE}</span>
          <h1 class="landing-title">Run your entire <span>academic platform</span> from one control center.</h1>
          <p class="landing-sub">
            ${CONFIG.APP_NAME} students and professors keep working in the Android app.
            You get the bird's-eye view: users, classes, grades, attendance, announcements,
            storage and a full audit trail — backed by the same Supabase database.
          </p>
          <div class="landing-cta">${primaryCta}</div>
          <div class="landing-trust">
            <span>${UI.icon("check")} No app downtime</span><span>${UI.icon("check")} Every action audited</span><span>${UI.icon("check")} Block, don't delete</span>
          </div>
        </section>

        <section class="landing-section">
          <h2>What you can do</h2>
          <div class="landing-features">
            <div class="feature-card"><span class="fc-ic"><svg class="icn lg" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></span><h3>Monitor users</h3><p>Search every student and professor, review their classes, submissions and attendance, block or unblock with one click.</p></div>
            <div class="feature-card"><span class="fc-ic"><svg class="icn lg" viewBox="0 0 24 24" aria-hidden="true"><path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/></svg></span><h3>Manage classes</h3><p>Inspect any class, reassign professors, enroll or remove students, and moderate join requests from one queue.</p></div>
            <div class="feature-card"><span class="fc-ic"><svg class="icn lg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="6"/><path d="M15.48 12.89 17 22l-5-3-5 3 1.52-9.11"/></svg></span><h3>Grade &amp; fix records</h3><p>Clear the ungraded backlog, override scores, correct attendance, and spot duplicate scans.</p></div>
            <div class="feature-card"><span class="fc-ic"><svg class="icn lg" viewBox="0 0 24 24" aria-hidden="true"><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg></span><h3>Announce globally</h3><p>Post announcements to all years or specific ones, and moderate what professors publish.</p></div>
            <div class="feature-card"><span class="fc-ic"><svg class="icn lg" viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/></svg></span><h3>Tidy storage</h3><p>Browse every bucket, flag orphaned files, and delete carefully — always logged.</p></div>
            <div class="feature-card"><span class="fc-ic"><svg class="icn lg" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg></span><h3>Full audit trail</h3><p>Every privileged action is recorded with before/after data, actor and timestamp. No silent changes.</p></div>
          </div>
        </section>

        <footer class="landing-footer">
          © 2026 ${CONFIG.APP_NAME} Admin &middot; ${CONFIG.APP_TAGLINE}
        </footer>
      </div>`;

    const logout = root.querySelector("#landingLogout");
    if (logout) logout.addEventListener("click", () => Auth.logout());
  },
};