/* ============================================================
   auth.js — admin identity built on Supabase Auth.
   Sign-in: email + password (direct). Sign-up: 8-digit email
   code pasted into the form. Admin status (admin_users profile)
   is verified by the admin_get_me RPC, which also enforces
   access level (active + read-only vs. can_edit).
   Handles Supabase password-recovery links arriving in the
   URL hash (…?mode=recovery).
   ============================================================ */
const Auth = (() => {

  let cachedAdmin = null;
  let recoveryMode = false;
  let readyPromise = null;

  /* ---------- boot ---------- */

  function ready() {
    if (!readyPromise) readyPromise = init().catch(err => console.error("Auth init failed:", err));
    return readyPromise;
  }

  /* One-time boot: absorb recovery tokens from the URL hash,
     then keep the admin cache in sync with auth events. */
  async function init() {
    let q = null;
    try { q = new URLSearchParams(location.hash.replace(/^#\/?/, "")); } catch { q = null; }
    const accessToken = q && q.get("access_token");
    const type = q && q.get("type");

    if (accessToken && type) {
      const { error } = await API.client.auth.setSession({
        access_token: accessToken,
        refresh_token: q.get("refresh_token") || "",
      });
      if (!error && type === "recovery") {
        recoveryMode = true;
        location.replace("#/login?mode=recovery");
      } else {
        location.replace("#/login?error=" + encodeURIComponent(error ? error.message : "Invalid recovery link."));
      }
    }

    API.client.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") cachedAdmin = null;
    });
  }

  /* ---------- session / profile ---------- */

  async function getSession() {
    const { data: { session } } = await API.client.auth.getSession();
    return session;
  }

  /* Cached admin profile (filled by resolveAdmin). Sync reads
     for the topbar and role checks. */
  function admin() { return cachedAdmin; }
  function isSuper() { return !!(cachedAdmin && cachedAdmin.role === "super_admin"); }
  function canEdit() { return !!(cachedAdmin && cachedAdmin.can_edit); }
  function isRecoveryMode() { return recoveryMode; }
  function finishRecovery() { recoveryMode = false; }

  /* Who is the current user, per the admin RPCs?
     Returns { status: "ok", admin } | "no_session" | "disabled"
     | "not_admin" | { status: "error", error }. */
  async function resolveAdmin() {
    const session = await getSession();
    if (!session) { cachedAdmin = null; return { status: "no_session" }; }

    const res = await API.callRpc("admin_get_me");
    if (!res.ok) {
      cachedAdmin = null;
      if (/disabled/i.test(res.error)) return { status: "disabled", error: res.error };
      if (/not registered as an admin/i.test(res.error)) return { status: "not_admin", error: res.error };
      return { status: "error", error: res.error };
    }
    cachedAdmin = res.data.admin;
    return { status: "ok", admin: res.data.admin };
  }

  /* ---------- sign in (email + password) ---------- */

  function friendlyAuthError(error) {
    if (!error) return "Unknown error.";
    let msg = String(error.message || error.error_description || error).replace(/^database error:\s*/i, "").trim();
    if (/invalid login credentials/i.test(msg)) msg = "Invalid email or password.";
    else if (/email not confirmed|confirm your email/i.test(msg)) msg = "Verify your email address first — check your inbox for the code.";
    return msg;
  }

  async function login(email, password) {
    const { error } = await API.client.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, error: friendlyAuthError(error) };

    const res = await resolveAdmin();
    if (res.status === "ok") return { ok: true, admin: res.admin };
    if (res.status === "disabled") {
      await signOutLocal();
      return { ok: false, error: res.error, disabled: true };
    }
    if (res.status === "not_admin") {
      await signOutLocal();
      return { ok: false, error: res.error };
    }
    if (res.status === "error") {
      await signOutLocal();
      return { ok: false, error: res.error };
    }
    return { ok: false, error: "Sign in failed." };
  }

  /* ---------- sign up / recovery ---------- */

  async function signUp(fullName, email, password) {
    const { error } = await API.client.auth.signUp({
      email,
      password,
      options: { data: { admin_signup: "true", full_name: fullName } },
    });
    if (error) return { ok: false, error: friendlyAuthError(error) };
    return { ok: true };
  }

  /* Confirm the email with the 8-digit code from the
     "Confirm signup" email (pasted into the form). */
  async function confirmSignup(email, token) {
    const { error } = await API.client.auth.verifyOtp({ email, token, type: "signup" });
    if (error) return { ok: false, error: friendlyAuthError(error) };
    return { ok: true };
  }

  async function resendSignupCode(email) {
    const { error } = await API.client.auth.resend({ type: "signup", email });
    if (error) return { ok: false, error: friendlyAuthError(error) };
    return { ok: true };
  }

  async function forgotPassword(email) {
    const { error } = await API.client.auth.resetPasswordForEmail(email);
    if (error) return { ok: false, error: friendlyAuthError(error) };
    return { ok: true };
  }

  async function changePassword(newPassword) {
    const { error } = await API.client.auth.updateUser({ password: newPassword });
    if (error) return { ok: false, error: friendlyAuthError(error) };
    return { ok: true };
  }

  /* ---------- sign out ---------- */

  async function signOutLocal() {
    try { await API.client.auth.signOut(); } catch { /* ignore */ }
    cachedAdmin = null;
  }

  async function logout() {
    await signOutLocal();
    Router.go("/");
  }

  /* Called when the server rejects a session — clear and bounce to login. */
  async function handleAuthFailure() {
    await signOutLocal();
    if (location.hash.replace(/^#/, "") !== "/login") {
      Router.go("/login");
    }
  }

  return {
    ready, getSession, admin, isSuper, canEdit,
    isRecoveryMode, finishRecovery, resolveAdmin,
    login,
    signUp, confirmSignup, resendSignupCode,
    forgotPassword, changePassword,
    signOutLocal, logout, handleAuthFailure,
  };
})();
