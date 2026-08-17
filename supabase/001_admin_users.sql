-- ============================================================
-- 001_admin_users.sql
-- Panthraa Admin — admin identity built on Supabase Auth.
--
-- Admins are REAL Supabase Auth users. admin_users is the
-- profile/role table (id = auth.users.id). Everyone signs up
-- active + READ-ONLY (can_edit = false) until a super admin
-- grants edit access. Nothing here touches the mobile app's
-- tables, columns or RPCs.
--
-- Idempotent. Run first in the Supabase SQL Editor.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1. Admin profile table (auth-linked).
--    is_active = enable/disable switch
--    can_edit  = write-access switch (read-only admins can
--                view everything but cannot mutate anything)
-- ------------------------------------------------------------
create table if not exists public.admin_users (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text not null default '',
  role        text not null default 'admin' check (role in ('admin','super_admin')),
  is_active   boolean not null default true,
  can_edit    boolean not null default false,
  created_at  timestamptz not null default now()
);

alter table public.admin_users add column if not exists email text;
alter table public.admin_users alter column id drop default;

-- ------------------------------------------------------------
-- 2. Sign-up trigger: when a Supabase Auth user registers from
--    the admin sign-up page (metadata flag admin_signup), create
--    their admin profile row — ACTIVE immediately, READ-ONLY.
-- ------------------------------------------------------------
create or replace function public.handle_admin_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.raw_user_meta_data ->> 'admin_signup' = 'true' then
    insert into public.admin_users (id, email, full_name, role, is_active, can_edit)
    values (
      new.id,
      new.email,
      coalesce(new.raw_user_meta_data ->> 'full_name', ''),
      'admin',
      true,
      false
    )
    on conflict (id) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists on_admin_auth_user_created on auth.users;
create trigger on_admin_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_admin_signup();

-- ------------------------------------------------------------
-- 3. Session verification. auth.uid() comes from the JWT, so
--    every admin RPC verifies the caller with zero parameters.
-- ------------------------------------------------------------
create or replace function public.admin_require_auth()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_admin record;
begin
  if v_uid is null then
    raise exception 'Sign in required.';
  end if;
  select id, email, full_name, role, is_active, can_edit into v_admin
  from public.admin_users
  where id = v_uid;
  if not found then
    raise exception 'This account is not registered as an admin.';
  end if;
  if not v_admin.is_active then
    raise exception 'Your admin account is disabled. A super admin must reactivate it.';
  end if;
  return jsonb_build_object(
    'id', v_admin.id, 'email', v_admin.email,
    'full_name', v_admin.full_name, 'role', v_admin.role,
    'can_edit', v_admin.can_edit
  );
end $$;

create or replace function public.admin_require_role(p_roles text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin jsonb := public.admin_require_auth();
begin
  if not (v_admin->>'role') = any (p_roles) then
    raise exception 'This action requires role: %', array_to_string(p_roles, ', ');
  end if;
  return v_admin;
end $$;

-- Write-access gate: signed in, active, AND can_edit = true.
create or replace function public.admin_require_edit()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin jsonb := public.admin_require_auth();
begin
  if not (v_admin->>'can_edit')::boolean then
    raise exception 'This action requires edit access. Your account is read-only — ask a super admin to grant it.';
  end if;
  return v_admin;
end $$;

-- Edit access + role check (super-admin mutating actions).
create or replace function public.admin_require_edit_role(p_roles text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin jsonb := public.admin_require_edit();
begin
  if not (v_admin->>'role') = any (p_roles) then
    raise exception 'This action requires role: %', array_to_string(p_roles, ', ');
  end if;
  return v_admin;
end $$;

-- ------------------------------------------------------------
-- 4. Privileges. RLS on + zero grants → direct table access
--    from the client is impossible; only the SECURITY DEFINER
--    admin RPCs (called with a valid Auth session) touch them.
-- ------------------------------------------------------------
alter table public.admin_users enable row level security;
revoke all on table public.admin_users from anon, authenticated;

revoke execute on function public.admin_require_auth() from anon, authenticated, public;
revoke execute on function public.admin_require_role(text[]) from anon, authenticated, public;
revoke execute on function public.admin_require_edit() from anon, authenticated, public;
revoke execute on function public.admin_require_edit_role(text[]) from anon, authenticated, public;
revoke execute on function public.handle_admin_signup() from anon, authenticated, public;

-- ------------------------------------------------------------
-- 5. CREATE THE FIRST SUPER ADMIN (run ONCE).
--    Step 1 — Supabase Dashboard → Authentication → Users →
--             "Add user" (enter the email + a temporary
--             password). The confirmation email is optional
--             for this first user.
--    Step 2 — run this SQL (replace the email):
--
--    insert into public.admin_users (id, email, full_name, role, is_active, can_edit)
--    select id, email, 'Platform Administrator', 'super_admin', true, true
--    from auth.users where email = 'you@yourdomain.com'
--    on conflict (id) do nothing;
--
--    Step 3 — sign in on the web app. From Settings → Admin
--             accounts you can grant/revoke edit access for
--             every admin (everyone starts read-only).
-- ------------------------------------------------------------