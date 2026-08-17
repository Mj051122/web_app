/* ============================================================
   api.js — the ONLY place that talks to Supabase.
   Every privileged call goes through an admin_* RPC.
   The Supabase Auth session is attached automatically by
   supabase-js; the server verifies the caller via auth.uid().
   NEVER read/write tables directly from this client.
   ============================================================ */
const API = (() => {
  if (typeof supabase === "undefined") {
    console.error("Supabase JS client failed to load. Check your internet connection or the CDN tag in index.html.");
  }

  const client = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

  /* Normalize an error thrown by the supabase-js client. */
  function normalizeError(error) {
    if (!error) return "Unknown error.";
    const msg = error.message || error.error_description || String(error);
    return String(msg).replace(/^database error:\s*/i, "").trim();
  }

  /* Server messages that mean "the session is invalid — sign in again". */
  const AUTH_ERROR_RE = /sign in required|session|token|jwt|expired|invalid login credentials/i;

  /* Call an admin RPC.
     Returns { ok: true, data } or { ok: false, error }.
     Session failures are detected here and force a logout. */
  async function callRpc(name, args = {}) {
    const { data: { session } } = await client.auth.getSession();
    if (!session) {
      Auth.handleAuthFailure();
      return { ok: false, error: "Sign in required.", needsLogin: true };
    }

    let result;
    try {
      result = await client.rpc(name, args || {});
    } catch (e) {
      const error = normalizeError(e);
      const isAuth = AUTH_ERROR_RE.test(error);
      if (isAuth) Auth.handleAuthFailure();
      return { ok: false, error, needsLogin: isAuth };
    }

    if (result.error) {
      const error = normalizeError(result.error);
      const code = result.error.code || "";
      const isAuth = code === "P0001" && AUTH_ERROR_RE.test(error);
      if (isAuth) Auth.handleAuthFailure();
      return { ok: false, error, code, needsLogin: isAuth };
    }

    return { ok: true, data: result.data, code: null };
  }

  /* Best-effort link to a storage file.
     - Full URL (http/https) → returned as-is.
     - Bare path → tries a signed URL from the given bucket.
       Panthraa stores files as bare names inside buckets, so signed
       URLs are required for the anon key to fetch them. */
  async function fileLink(bucket, path) {
    if (!path) return { ok: false, error: "No file path." };
    if (/^https?:\/\//i.test(path)) return { ok: true, data: path };
    try {
      const { data, error } = await client.storage.from(bucket).createSignedUrl(path, 3600);
      if (error) return { ok: false, error: normalizeError(error) };
      return { ok: true, data: data.signedUrl };
    } catch (e) {
      return { ok: false, error: normalizeError(e) };
    }
  }

  /* Guess the right bucket for a submission/assignment file path. */
  const FILE_BUCKETS = ["assignment-files", "profile-pictures", "class-covers", "announcement-images"];
  async function fileLinkSmart(path) {
    if (!path) return { ok: false, error: "No file path." };
    if (/^https?:\/\//i.test(path)) return { ok: true, data: path };
    for (const bucket of FILE_BUCKETS) {
      const res = await fileLink(bucket, path);
      if (res.ok) return res;
    }
    return { ok: false, error: "Could not resolve a storage link for this file." };
  }

  return { client, callRpc, fileLink, fileLinkSmart, normalizeError };
})();
