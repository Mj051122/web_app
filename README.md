# Panthraa Admin — Web Control Center

The administration web app for **Panthraa**, the academic management platform.
The mobile app (Kotlin + Jetpack Compose) is the daily tool for **students and
professors**; this static site is the control center for **platform admins**:
monitoring, moderation, corrections, and auditing — all against the **same
Supabase project**, without ever touching the app's data contract.

```
Android app (students & professors)        Admin web app (this project)
        │                                        │
        └─────────── same Supabase project ──────┘
        │                                        │
   app RPCs (existing)                     admin_* RPCs (new, SECURITY DEFINER)
   app tables (untouched)                  + admin_* tables + audit log
```

---

## 1. What you get

| Area | Capability |
|---|---|
| Dashboard | Live totals: students, professors, classes, pending join requests, ungraded submissions, blocked users, recent activity |
| Users | Search/filter, create, edit, block/unblock, password reset, per-user detail (classes, submissions, attendance) |
| Classes | All classes, edit metadata, reassign professor, enroll/remove students, approve/reject join requests, archive/delete with warning |
| Join requests | Global pending queue with student + class context |
| Assignments | Every material/task/quiz/exam, due states, missing/ungraded counts, edit/delete |
| Submissions & grades | Per-assignment submissions, file download, score override (audit-logged), ungraded backlog |
| Attendance | Per class/date/assignment records, manual corrections, duplicate-scan warnings |
| Announcements | Post admin/global announcements (by year or all), moderate professors' posts |
| Storage | Browse buckets, orphan detection (best-effort), careful deletion (audit-logged) |
| Audit logs | Read-only trail of every privileged admin action with before/after JSON |
| Settings | Change own password; super admins manage admin accounts (roles, enable/disable, read-only ↔ edit toggle) |

## 2. Stack

- **Frontend:** plain HTML + CSS + vanilla JS. No framework, no build step, no npm.
- **Backend:** your existing Supabase project. No servers, no serverless functions.
- **Client:** Supabase JS v2 from CDN, using the public anon key.
- **Security:** every privileged operation is a `SECURITY DEFINER` RPC that
  verifies the caller's Supabase Auth session (`auth.uid()`) and access
  level server-side. The web client **never** reads or writes tables directly.

## 3. Files

```
index.html                SPA shell (sidebar, topbar, views, modals, toasts)
styles.css                Hand-written design system (CSS variables)
config.js                 Supabase URL + anon key (fill these in)
js/api.js                 The ONLY file that talks to Supabase (RPC wrapper)
js/auth.js                Admin identity: Supabase Auth (email + password + OTP)
js/ui.js                  Toasts, modals, datatables, badges, formatters
js/router.js              Hash routing (#/users, #/classes/:id, ...)
js/pages/*.js             One module per feature (login, signup, dashboard, ...)
supabase/001_admin_users.sql    admin_users table + sign-up trigger (Auth-based)
supabase/002_admin_audit_logs.sql  audit log table + helper
supabase/003_admin_core_rpcs.sql   the complete admin RPC set + grants
```

## 4. Setup

### 4.1 Configure the site

Open `config.js` and fill in your project values (Supabase Dashboard →
Project Settings → API):

```js
const CONFIG = {
  SUPABASE_URL: "https://YOUR-PROJECT-ref.supabase.co",
  SUPABASE_ANON_KEY: "YOUR_PUBLIC_ANON_KEY",
  ...
};
```

That's it. Open `index.html` in a browser and it works from the folder itself.

### 4.2 Run the SQL (in order, in the Supabase SQL Editor)

Run **`supabase/001_admin_users.sql`**, then **`002_admin_audit_logs.sql`**,
then **`003_admin_core_rpcs.sql`**. All three are idempotent and safe to
re-run. They create only `admin_*` objects plus a few indexes — nothing on the
app's tables or RPCs is changed.

### 4.3 Enable email authentication

In Supabase Dashboard → **Authentication → Sign In / Providers**, make sure
**Email** is enabled. Recommended settings:

- **Confirm email** — ON (new sign-ups must confirm their address)
- **Secure email change** — ON
- The **Confirm signup** email template must include the `{{ .Token }}`
  placeholder (default template has it) — the admin web app asks you to paste
  that 8-digit code into the sign-up form. Set **Email OTP Length** to `8`
  under Authentication → Email. (The "Confirm sign in" template is not used:
  login is plain email + password.)
- Under **Authentication → URL Configuration**, set **Site URL** to wherever
  the admin app is hosted (e.g. `https://panthraa-admin.vercel.app`) and add
  it to **Redirect URLs** — this is where password-recovery links land, and
  the login page picks them up automatically.

### 4.4 Create the first admin (super admin)

Admins are **real Supabase Auth users**. Sign-ups start as read-only
`admin` accounts, so the first **super admin** is created directly in the
Dashboard:

1. Dashboard → **Authentication → Users → Add user** — enter your email and a
   temporary password (email confirmation is optional for this first user).
2. Run this SQL in the SQL Editor (replace the email):

```sql
insert into public.admin_users (id, email, full_name, role, is_active, can_edit)
select id, email, 'Platform Administrator', 'super_admin', true, true
from auth.users where email = 'you@yourdomain.com'
on conflict (id) do nothing;
```

3. Sign in on the web app with email + password. From **Settings → Admin
   accounts** you can manage every admin: change roles, disable accounts,
   reset passwords, and toggle **edit access** (every account starts
   read-only; granting edit unlocks create/update/delete actions).

> Anyone can visit **#/signup** to request access. After submitting, an
> 8-digit code is emailed — paste it into the form to verify the address.
> Sign-in works **immediately** (no approval step): the account is active
> right away but **read-only** (`can_edit = false`) until a super admin
> grants edit access.

### 4.5 Deploy to Vercel

1. Push this folder to a Git repository (GitHub/GitLab/Bitbucket).
2. Vercel → **Add New Project** → import the repo.
3. Framework preset: **Other**. Build command: *(leave empty)*. Output
   directory: *(leave empty)*.
4. Deploy. Zero configuration — it is static files only.

The Supabase URL/key are public by design (that is how Supabase works); the
database itself is protected by RLS + the admin RPCs.

## 5. How the Android app stays unaffected

- **No existing table, column, or RPC is renamed, altered, or dropped.**
- New objects are namespaced `admin_*` so they can never collide.
- The app's RPCs (`login_app_user`, `create_class`, `grade_assignment_submission`,
  ...) keep their exact signatures and behavior.
- Admin password resets for **app users** write `app_users.password` using the
  same convention as the app (plaintext compare) and never log the password.
- Join-request decisions **try to reuse the app's own**
  `approve_class_join_request` / `reject_class_join_request` RPCs first, and
  only fall back to a mirrored implementation if the signature differs.
- Admin announcements that the app's schema cannot hold a `NULL` author for use
  a hidden system profile (`ADMIN-SYSTEM`, `is_blocked = true`, can never sign
  in) so the app's joins still resolve an author name.
- Added indexes only (performance); no schema semantics changed.

## 6. Security model

1. **Auth:** admins are real Supabase Auth users (email + password). Sign-in
   is email + password. The **8-digit email code** is used once, when a new
   sign-up verifies their address on the sign-up page. Password-recovery
   links are handled on the login page.
2. **Admin profile:** `admin_users` holds role + access level
   (`id = auth.users.id`). Sign-ups are created **active but read-only**
   (`can_edit = false`) by a trigger on `auth.users`; every admin RPC
   verifies the caller via `auth.uid()` + `admin_require_auth()` (active),
   mutating RPCs additionally require `admin_require_edit()`
   (`can_edit = true`), and super-admin-only actions use
   `admin_require_edit_role(['super_admin'])`. A read-only admin can view
   everything but cannot create, update or delete anything.
3. **Client code** can only call RPCs. `admin_*` tables have RLS enabled and
   zero grants to `anon`/`authenticated`; direct table access is impossible
   from the browser. The publishable key is public by design (Supabase model).
4. **No passwords ever** appear in RPC responses, audit logs, or the UI.
5. **Block, don't delete.** Users are blocked via `app_users.is_blocked`.
   Destructive deletes (class, assignment) require explicit confirmation and
   store a full JSON snapshot in the audit log.
6. **Audit trail:** every block/unblock, password reset, class change, score
   override, attendance fix, announcement moderation, and storage delete
   writes an `admin_audit_logs` row (actor, action, target, before/after).

## 7. Compatibility checklist

- [x] No existing mobile app table, column, or RPC signature is modified.
- [x] Admin identity is stored in a new `admin_users` table — `app_users` is
      untouched and remains the only login source for the mobile app.
- [x] Admin sign-in uses Supabase Auth (email + password + email OTP), fully
      separate from the mobile app's `app_users` login.
- [x] New objects are namespaced `admin_*`.
- [x] The web client reads/writes **only** through `admin_*` SECURITY DEFINER
      RPCs; direct table access is revoked.
- [x] Passwords are never returned, logged, or displayed.
- [x] Users are blocked/unblocked, never deleted.
- [x] Every privileged action writes an audit log entry.
- [x] Existing app RPCs are reused where their validation already applies.
- [x] SQL is delivered as files only — nothing is applied automatically.

> **This does not modify any existing mobile app tables, columns, or RPC
> signatures.**