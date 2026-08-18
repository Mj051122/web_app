/* ============================================================
   Pages.landing — public landing page (default route).
   Shown to everyone; the CTA adapts to session state.
   Includes: hero with product preview, animated stats band,
   scroll-reveal effects (IntersectionObserver), parallax mock,
   scroll progress bar. All motion respects prefers-reduced-motion.
   ============================================================ */
window.Pages = window.Pages || {};
Pages.landing = {
  async render(root) {
    await Auth.ready();
    const res = await Auth.resolveAdmin();
    const admin = res.status === "ok" ? res.admin : null;
    const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const primaryCta = admin
      ? `<a class="btn lg" href="#/dashboard">Open dashboard ${UI.icon("arrowRight")}</a>`
      : `<a class="btn lg" href="#/login">Sign in to the admin panel</a>`;

    const PAW = '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="6.2" cy="5.6" rx="2.1" ry="2.6"/><ellipse cx="12" cy="4.2" rx="2.1" ry="2.6"/><ellipse cx="17.8" cy="5.6" rx="2.1" ry="2.6"/><path d="M12 8.6c-4.1 0-6.6 2.5-6.6 5.5 0 2 1.4 3.3 3.1 3.3 1 0 1.9-.4 3.5-.4s2.5.4 3.5.4c1.7 0 3.1-1.3 3.1-3.3 0-3-2.5-5.5-6.6-5.5z"/></svg>';

    const STATS = [
      { value: 1200, suffix: "+", label: "Students active", sub: "across every year level" },
      { value: 80, suffix: "+", label: "Faculty members", sub: "professors handling classes" },
      { value: 6400, suffix: "+", label: "Submissions graded", sub: "with full audit history" },
      { value: 99, suffix: ".9%", label: "Uptime", sub: "same Supabase database" },
    ];

    root.innerHTML = `
      <div class="landing">
        <div class="scroll-progress" id="scrollProgress" aria-hidden="true"></div>

        <header class="landing-nav" data-reveal>
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
          <span class="landing-badge" data-reveal>${CONFIG.APP_TAGLINE}</span>
          <h1 class="landing-title" data-reveal style="--d:.08s">Run your entire <span>academic platform</span> from one control center.</h1>
          <p class="landing-sub" data-reveal style="--d:.16s">
            ${CONFIG.APP_NAME} students and professors keep working in the Android app.
            You get the bird's-eye view: users, classes, grades, attendance, announcements,
            storage and a full audit trail — backed by the same Supabase database.
          </p>
          <div class="landing-cta" data-reveal style="--d:.24s">${primaryCta}</div>
          <div class="landing-trust" data-reveal style="--d:.32s">
            <span>${UI.icon("check")} No app downtime</span><span>${UI.icon("check")} Every action audited</span><span>${UI.icon("check")} Block, don't delete</span>
          </div>

          <div class="hero-stage" id="heroStage" data-reveal style="--d:.4s">
            <div class="hero-mock">
              <div class="mock-top">
                <span class="mock-dot r"></span><span class="mock-dot y"></span><span class="mock-dot g"></span>
                <span class="mock-url">panthraa.app/admin</span>
              </div>
              <div class="mock-body">
                <div class="mock-row head">
                  <span class="mock-avatar">MJ</span>
                  <div><div class="mock-line w60"></div><div class="mock-line w30 slim"></div></div>
                  <span class="mock-chip">Super admin</span>
                </div>
                <div class="mock-grid">
                  <div class="mock-stat"><span class="mock-num">1,204</span><span class="mock-line w40"></span></div>
                  <div class="mock-stat"><span class="mock-num">83</span><span class="mock-line w50"></span></div>
                  <div class="mock-stat"><span class="mock-num">96</span><span class="mock-line w45"></span></div>
                </div>
                <div class="mock-bars">
                  <div class="mock-bar"><span class="mock-bar-label">Students</span><div class="mock-track"><i style="--w:88%"></i></div></div>
                  <div class="mock-bar"><span class="mock-bar-label">Graded</span><div class="mock-track"><i style="--w:64%"></i></div></div>
                  <div class="mock-bar"><span class="mock-bar-label">Attendance</span><div class="mock-track"><i style="--w:76%"></i></div></div>
                </div>
                <div class="mock-rows">
                  <div class="mock-user"><span class="mock-avatar teal">A</span><div class="mock-line w50"></div><span class="mock-chip green">Active</span></div>
                  <div class="mock-user"><span class="mock-avatar amber">B</span><div class="mock-line w40"></div><span class="mock-chip gray">Pending</span></div>
                  <div class="mock-user"><span class="mock-avatar blue">C</span><div class="mock-line w55"></div><span class="mock-chip green">Active</span></div>
                </div>
              </div>
              <div class="mock-glow"></div>
            </div>
            <div class="float-chip fc-1">${UI.icon("check")} 1,204 students</div>
            <div class="float-chip fc-2">${UI.icon("shield")} 100% audited</div>
            <div class="float-chip fc-3">${UI.icon("refresh")} Live sync</div>
          </div>
        </section>

        <section class="landing-stats" id="statsBand" data-reveal>
          ${STATS.map((s, i) => `
            <div class="landing-stat">
              <div class="ls-value"><span data-count="${s.value}">0</span>${s.suffix}</div>
              <div class="ls-label">${s.label}</div>
              <div class="ls-sub">${s.sub}</div>
            </div>`).join("")}
        </section>

        <section class="landing-section">
          <h2 data-reveal>What you can do</h2>
          <div class="landing-features">
            <div class="feature-card" data-reveal><span class="fc-ic"><svg class="icn lg" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></span><h3>Monitor users</h3><p>Search every student and professor, review their classes, submissions and attendance, block or unblock with one click.</p></div>
            <div class="feature-card" data-reveal><span class="fc-ic"><svg class="icn lg" viewBox="0 0 24 24" aria-hidden="true"><path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/></svg></span><h3>Manage classes</h3><p>Inspect any class, reassign professors, enroll or remove students, and moderate join requests from one queue.</p></div>
            <div class="feature-card" data-reveal><span class="fc-ic"><svg class="icn lg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="6"/><path d="M15.48 12.89 17 22l-5-3-5 3 1.52-9.11"/></svg></span><h3>Grade &amp; fix records</h3><p>Clear the ungraded backlog, override scores, correct attendance, and spot duplicate scans.</p></div>
            <div class="feature-card" data-reveal><span class="fc-ic"><svg class="icn lg" viewBox="0 0 24 24" aria-hidden="true"><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg></span><h3>Announce globally</h3><p>Post announcements to all years or specific ones, and moderate what professors publish.</p></div>
            <div class="feature-card" data-reveal><span class="fc-ic"><svg class="icn lg" viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/></svg></span><h3>Tidy storage</h3><p>Browse every bucket, flag orphaned files, and delete carefully — always logged.</p></div>
            <div class="feature-card" data-reveal><span class="fc-ic"><svg class="icn lg" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg></span><h3>Full audit trail</h3><p>Every privileged action is recorded with before/after data, actor and timestamp. No silent changes.</p></div>
          </div>
        </section>

        <section class="landing-section">
          <h2 data-reveal>How it works</h2>
          <div class="steps">
            <div class="step" data-reveal><span class="step-num">1</span><h3>Request access</h3><p>Sign up with your school email. A super admin approves your account before you can do anything.</p></div>
            <div class="step" data-reveal><span class="step-num">2</span><h3>Sign in securely</h3><p>Two admin roles, granular edit locks, and session recovery — everything is verified server-side.</p></div>
            <div class="step" data-reveal><span class="step-num">3</span><h3>Manage with confidence</h3><p>Every click is audited with before/after snapshots. Nothing happens silently.</p></div>
          </div>
        </section>

        <section class="landing-cta-band" data-reveal>
          <h2>Ready to take control?</h2>
          <p>Join the ${CONFIG.APP_NAME} admin panel and keep the whole academic platform under one roof.</p>
          <div class="landing-cta">${primaryCta}</div>
        </section>

        <footer class="landing-footer">
          © 2026 ${CONFIG.APP_NAME} Admin &middot; ${CONFIG.APP_TAGLINE}
        </footer>
      </div>`;

    /* ---------- scroll progress bar ---------- */
    if (!reduceMotion) {
      const bar = root.querySelector("#scrollProgress");
      let ticking = false;
      const update = () => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        bar.style.width = (max > 0 ? (window.scrollY / max) * 100 : 0) + "%";
        ticking = false;
      };
      window.addEventListener("scroll", () => {
        if (!ticking) { ticking = true; requestAnimationFrame(update); }
      }, { passive: true });
      update();
    }

    /* ---------- scroll reveal + count-up ---------- */
    const revealEls = root.querySelectorAll("[data-reveal]");
    const counters = root.querySelectorAll("[data-count]");
    if (reduceMotion) {
      revealEls.forEach(el => el.classList.add("in"));
      counters.forEach(el => el.textContent = Number(el.dataset.count).toLocaleString());
    } else if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        }
      }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
      revealEls.forEach(el => io.observe(el));
      io.observe(root.querySelector("#statsBand"));

      /* count-up the stat numbers when the band becomes visible */
      const statsObs = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          counters.forEach(el => {
            const target = Number(el.dataset.count);
            const dur = 1200;
            const start = performance.now();
            (function tick(now) {
              const p = Math.min(1, (now - start) / dur);
              const eased = 1 - Math.pow(1 - p, 3);
              el.textContent = Math.round(target * eased).toLocaleString();
              if (p < 1) requestAnimationFrame(tick);
              else el.textContent = target.toLocaleString();
            })(start);
          });
          statsObs.disconnect();
        }
      }, { threshold: 0.35 });
      statsObs.observe(root.querySelector("#statsBand"));

      /* gentle parallax on the hero mock */
      const stage = root.querySelector("#heroStage");
      if (stage) {
        let raf = null;
        window.addEventListener("scroll", () => {
          if (raf) return;
          raf = requestAnimationFrame(() => {
            const y = Math.min(window.scrollY, 600);
            stage.style.transform = `translateY(${y * -0.04}px)`;
            raf = null;
          });
        }, { passive: true });
      }
    }

    const logout = root.querySelector("#landingLogout");
    if (logout) logout.addEventListener("click", () => Auth.logout());
  },
};