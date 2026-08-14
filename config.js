/* ============================================================
   config.js — Panthraa Admin configuration
   Fill in your Supabase project URL and public anon key below.
   (Find them in Supabase Dashboard → Project Settings → API)
   ============================================================ */
const CONFIG = {
  SUPABASE_URL: "https://YOUR-PROJECT-ref.supabase.co",
  SUPABASE_ANON_KEY: "YOUR_PUBLIC_ANON_KEY",

  APP_NAME: "Panthraa",
  APP_TAGLINE: "Admin Control Center",

  /* Admin session lifetime (hours) — must match the SQL
     admin_login token expiry if you change it. */
  SESSION_HOURS: 12,

  /* Pagination defaults */
  PAGE_SIZE: 20,
};