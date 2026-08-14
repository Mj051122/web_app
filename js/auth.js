/* ============================================================
   auth.js — admin session management (localStorage token).
   The token is issued by admin_login and verified by every
   admin RPC server-side. It never leaves the browser except
   through the api.js wrapper.
   ============================================================ */
const Auth = (() => {
  const KEY = API.SESSION_KEY;

  function getSession() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || !s.token || !s.admin) return null;
      if (s.expires_at && new Date(s.expires_at).getTime() <= Date.now()) {
        clearSession();
        return null;
      }
      return s;
    } catch {
      return null;
    }
  }

  function setSession(session) {
    localStorage.setItem(KEY, JSON.stringify(session));
  }

  function clearSession() {
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  }

  function current() { return getSession(); }
  function admin() { const s = getSession(); return s ? s.admin : null; }
  function isSuper() { const a = admin(); return !!a && a.role === "super_admin"; }

  async function login(username, password) {
    const res = await API.callRpc("admin_login", { p_username: username, p_password: password }, { public: true });
    if (!res.ok) return res;
    setSession(res.data);
    return res;
  }

  function logout() {
    clearSession();
    Router.go("/login");
  }

  /* Called when the server rejects a token — clear and bounce to login. */
  function handleAuthFailure() {
    clearSession();
    if (location.hash.replace(/^#/, "") !== "/login") {
      Router.go("/login");
    }
  }

  function guard() {
    if (Router.currentIsPublic()) return;
    if (!getSession()) Router.go("/login");
  }

  return { getSession, setSession, clearSession, current, admin, isSuper, login, logout, handleAuthFailure, guard };
})();