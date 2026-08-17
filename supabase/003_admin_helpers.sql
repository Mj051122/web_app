-- ============================================================
-- 003_admin_helpers.sql
-- Shared helpers used by every admin CRUD file below.
-- Run AFTER 002. Idempotent.
-- ============================================================

-- ------------------------------------------------------------
-- 1. jsonb -> text[] converter. Accepts BOTH:
--      * a JSON array  -> ["monday","wednesday"]
--      * a plain string -> "Mon, Wed" or "Mon Wed"
--    Normalizes day names to lowercase (Mon -> monday).
--    Used for classes.schedule_days and announcements.target_years.
-- ------------------------------------------------------------
create or replace function public.admin_to_text_array(p_val jsonb)
returns text[]
language plpgsql
immutable
set search_path = public
as $$
declare
  v_result text[] := '{}'::text[];
  v_item   text;
begin
  if p_val is null then
    return '{}'::text[];
  end if;

  if jsonb_typeof(p_val) = 'array' then
    select coalesce(array_agg(trim(v)), '{}'::text[])
      into v_result
      from jsonb_array_elements_text(p_val) v
      where trim(v) <> '';
  else
    select coalesce(array_agg(trim(v)), '{}'::text[])
      into v_result
      from unnest(string_to_array(p_val #>> '{}', ',')) v
      where trim(v) <> '';
  end if;

  -- lowercase + normalize short day names (Mon -> monday)
  v_result := array(
    select case lower(x)
             when 'mon' then 'monday'
             when 'tue' then 'tuesday'
             when 'wed' then 'wednesday'
             when 'thu' then 'thursday'
             when 'fri' then 'friday'
             when 'sat' then 'saturday'
             when 'sun' then 'sunday'
             else lower(x)
           end
    from unnest(v_result) x
  );
  return v_result;
end $$;

-- ------------------------------------------------------------
-- 2. Hidden system profile used as the author of admin
--    announcements. is_blocked = true so it can never sign in.
-- ------------------------------------------------------------
create or replace function public.admin_system_profile_id()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.app_users where id_number = 'ADMIN-SYSTEM' limit 1;
  if v_id is null then
    insert into public.app_users (id_number, password, full_name, role, email, is_blocked)
    values (
      'ADMIN-SYSTEM',
      encode(gen_random_bytes(24), 'hex'),   -- unrecoverable; the app login can never match it
      'Panthraa Admin',
      'professor',
      'admin-system@panthraa.local',
      true
    )
    returning id into v_id;
  end if;
  return v_id;
end $$;
revoke execute on function public.admin_system_profile_id() from anon, authenticated, public;
revoke execute on function public.admin_to_text_array(jsonb) from anon, authenticated, public;

-- ------------------------------------------------------------
-- 2b. pgcrypto wrappers. pgcrypto lives in the extensions schema;
--     every admin function runs with search_path = public, so
--     gen_random_bytes / crypt / gen_salt are re-exposed here.
-- ------------------------------------------------------------
create or replace function public.gen_random_bytes(p_len integer) returns bytea
language sql
security definer
set search_path = extensions
as $$ select extensions.gen_random_bytes(p_len) $$;

create or replace function public.gen_salt(p_type text) returns text
language sql
security definer
set search_path = extensions
as $$ select extensions.gen_salt(p_type) $$;

create or replace function public.crypt(p_password text, p_salt text) returns text
language sql
security definer
set search_path = extensions
as $$ select extensions.crypt(p_password, p_salt) $$;

-- ------------------------------------------------------------
-- 3. Soft-archive marker for classes. Does NOT alter the
--    mobile app's classes table.
-- ------------------------------------------------------------
create table if not exists public.admin_archived_classes (
  class_id    uuid primary key references public.classes(id) on delete cascade,
  archived_by uuid not null references public.admin_users(id),
  archived_at timestamptz not null default now()
);
alter table public.admin_archived_classes enable row level security;
revoke all on table public.admin_archived_classes from anon, authenticated;

-- ------------------------------------------------------------
-- 4. Perf indexes (new indexes only — no schema changes).
-- ------------------------------------------------------------
create index if not exists class_enrollments_student_idx on public.class_enrollments (student_id);
create index if not exists class_assignments_class_idx on public.class_assignments (class_id);
create index if not exists assignment_submissions_student_idx on public.assignment_submissions (student_id);
create index if not exists assignment_submissions_assignment_idx on public.assignment_submissions (assignment_id);
create index if not exists attendance_class_idx on public.attendance (class_id);
create index if not exists attendance_student_idx on public.attendance (student_id);
create index if not exists class_join_requests_status_idx on public.class_join_requests (status);
create index if not exists class_announcements_created_idx on public.class_announcements (created_at desc);