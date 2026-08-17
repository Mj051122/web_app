-- ============================================================
-- 004_admin_users_crud.sql
-- USERS — full CRUD on app_users.
--
-- Run AFTER 003. Idempotent.
-- EVERY function is SECURITY DEFINER, verifies the caller via
-- auth.uid(), writes an audit row, and is the only way the
-- admin web app can touch app_users.
-- ============================================================

-- ------------------------------------------------------------
-- LIST users (filtered, sorted, paginated)
-- Filters: search, role, year_level, course, section, track,
--          is_blocked (true|false), class_id
-- ------------------------------------------------------------
create or replace function public.admin_list_users(p_filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin   jsonb := public.admin_require_auth();
  v_page    int   := greatest(coalesce(nullif(p_filters->>'page','')::int, 1), 1);
  v_size    int   := greatest(least(coalesce(nullif(p_filters->>'page_size','')::int, 25), 200), 1);
  v_search  text  := nullif(p_filters->>'search','');
  v_role    text  := nullif(p_filters->>'role','');
  v_year    text  := nullif(p_filters->>'year_level','');
  v_course  text  := nullif(p_filters->>'course','');
  v_section text  := nullif(p_filters->>'section','');
  v_track   text  := nullif(p_filters->>'track','');
  v_blocked text  := nullif(p_filters->>'is_blocked','');
  v_class   text  := nullif(p_filters->>'class_id','');
  v_sort    text  := lower(coalesce(nullif(p_filters->>'sort_by',''), 'created_at'));
  v_dir     text  := case when lower(coalesce(nullif(p_filters->>'sort_dir',''), 'desc')) = 'asc' then 'asc' else 'desc' end;
  v_where   text  := 'true';
  v_sort_sql text;
  v_total   int;
  v_rows    jsonb;
begin
  if v_search is not null then
    v_where := v_where || format(' and (u.full_name ilike %L or u.id_number ilike %L or u.email ilike %L or u.phone_number ilike %L)',
      '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%');
  end if;
  if v_role    is not null then v_where := v_where || format(' and u.role = %L', v_role); end if;
  if v_year    is not null then v_where := v_where || format(' and u.year_level = %L', v_year); end if;
  if v_course  is not null then v_where := v_where || format(' and u.course ilike %L', v_course); end if;
  if v_section is not null then v_where := v_where || format(' and u.section = %L', v_section); end if;
  if v_track   is not null then v_where := v_where || format(' and u.track = %L', v_track); end if;
  if v_blocked in ('true','false') then
    v_where := v_where || format(' and u.is_blocked = %s', v_blocked);
  end if;
  if v_class is not null then
    v_where := v_where || format(' and exists (select 1 from public.class_enrollments e where e.student_id = u.id and e.class_id = %L::uuid)', v_class);
  end if;

  v_sort_sql := case v_sort
    when 'full_name' then 'u.full_name'
    when 'id_number' then 'u.id_number'
    when 'email'     then 'u.email'
    when 'role'      then 'u.role'
    when 'is_blocked' then 'u.is_blocked'
    else 'u.created_at'
  end;

  execute format('select count(*) from public.app_users u where %s', v_where) into v_total;

  execute format(
    'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (
       select u.id, u.id_number, u.full_name, u.email, u.role, u.course, u.year_level,
              u.section, u.track, u.bio, u.phone_number, u.profile_picture_url,
              u.is_blocked, u.created_at
       from public.app_users u
       where %s
       order by %s %s, u.created_at desc
       limit %s offset %s
     ) t',
    v_where, v_sort_sql, v_dir, v_size, (v_page - 1) * v_size
  ) into v_rows;

  return jsonb_build_object('rows', v_rows, 'total', v_total, 'page', v_page, 'page_size', v_size);
end $$;

-- ------------------------------------------------------------
-- GET one user + activity counters
-- ------------------------------------------------------------
create or replace function public.admin_get_user(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin jsonb := public.admin_require_auth();
  v_user  jsonb;
begin
  select to_jsonb(t) into v_user from (
    select id, id_number, full_name, email, role, course, year_level, section, track,
           bio, phone_number, profile_picture_url, is_blocked, created_at
    from public.app_users where id = p_user_id
  ) t;

  if v_user is null then
    raise exception 'User not found.';
  end if;

  return jsonb_build_object(
    'user', v_user,
    'enrollment_count', (select count(*) from public.class_enrollments e where e.student_id = p_user_id),
    'submission_count', (select count(*) from public.assignment_submissions s where s.student_id = p_user_id),
    'attendance_count', (select count(*) from public.attendance a where a.student_id = p_user_id),
    'class_count',      (select count(*) from public.classes c where c.professor_id = p_user_id)
  );
end $$;

-- ------------------------------------------------------------
-- CREATE user (same password storage convention as the app —
-- the app stores plain text; see README §password)
-- ------------------------------------------------------------
create or replace function public.admin_create_user(p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin     jsonb := public.admin_require_edit();
  v_id_number text  := nullif(p_data->>'id_number','');
  v_role      text  := nullif(p_data->>'role','');
  v_full_name text  := nullif(p_data->>'full_name','');
  v_password  text  := p_data->>'password';
  v_id        uuid;
begin
  if v_id_number is null or v_id_number = '' then raise exception 'ID number is required.'; end if;
  if v_full_name is null or v_full_name = '' then raise exception 'Full name is required.'; end if;
  if v_role not in ('student','professor') then raise exception 'Role must be student or professor.'; end if;
  if v_password is null or length(v_password) < 6 then
    raise exception 'Password must be at least 6 characters.';
  end if;

  begin
    insert into public.app_users
      (id_number, password, full_name, email, role, course, year_level, section, track,
       bio, phone_number, profile_picture_url)
    values
      (v_id_number,
       v_password,
       v_full_name,
       nullif(p_data->>'email',''),
       v_role,
       nullif(p_data->>'course',''),
       nullif(p_data->>'year_level',''),
       nullif(p_data->>'section',''),
       nullif(p_data->>'track',''),
       nullif(p_data->>'bio',''),
       nullif(p_data->>'phone_number',''),
       nullif(p_data->>'profile_picture_url',''))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'An account with this ID number already exists.';
  end;

  perform public.admin_log_action(
    (v_admin->>'id')::uuid, 'admin_create_user', 'app_users', v_id::text,
    null, jsonb_build_object('id_number', v_id_number, 'role', v_role)
  );

  return jsonb_build_object('id', v_id);
end $$;

-- ------------------------------------------------------------
-- UPDATE user profile (role is NOT editable here)
-- ------------------------------------------------------------
create or replace function public.admin_update_user(p_user_id uuid, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin  jsonb := public.admin_require_edit();
  v_before jsonb;
  v_after  jsonb;
begin
  select to_jsonb(t) into v_before from (
    select id, id_number, full_name, email, role, course, year_level, section, track,
           bio, phone_number, profile_picture_url, is_blocked
    from public.app_users where id = p_user_id
  ) t;
  if v_before is null then raise exception 'User not found.'; end if;

  update public.app_users set
    full_name          = coalesce(nullif(p_data->>'full_name',''), full_name),
    email              = case when p_data ? 'email' then nullif(p_data->>'email','') else email end,
    course             = case when p_data ? 'course' then nullif(p_data->>'course','') else course end,
    year_level         = case when p_data ? 'year_level' then nullif(p_data->>'year_level','') else year_level end,
    section            = case when p_data ? 'section' then nullif(p_data->>'section','') else section end,
    track              = case when p_data ? 'track' then nullif(p_data->>'track','') else track end,
    bio                = case when p_data ? 'bio' then nullif(p_data->>'bio','') else bio end,
    phone_number       = case when p_data ? 'phone_number' then nullif(p_data->>'phone_number','') else phone_number end,
    profile_picture_url = case when p_data ? 'profile_picture_url' then nullif(p_data->>'profile_picture_url','') else profile_picture_url end
  where id = p_user_id;

  select to_jsonb(t) into v_after from (
    select id, id_number, full_name, email, role, course, year_level, section, track,
           bio, phone_number, profile_picture_url, is_blocked
    from public.app_users where id = p_user_id
  ) t;

  perform public.admin_log_action(
    (v_admin->>'id')::uuid, 'admin_update_user', 'app_users', p_user_id::text, v_before, v_after
  );
  return v_after;
end $$;

-- ------------------------------------------------------------
-- BLOCK / UNBLOCK
-- ------------------------------------------------------------
create or replace function public.admin_block_user(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin  jsonb := public.admin_require_edit();
  v_before jsonb;
  v_after  jsonb;
begin
  select to_jsonb(t) into v_before from (select id, is_blocked from public.app_users where id = p_user_id) t;
  if v_before is null then raise exception 'User not found.'; end if;
  update public.app_users set is_blocked = true where id = p_user_id;
  select to_jsonb(t) into v_after from (select id, is_blocked from public.app_users where id = p_user_id) t;
  perform public.admin_log_action((v_admin->>'id')::uuid, 'admin_block_user', 'app_users', p_user_id::text, v_before, v_after);
  return v_after;
end $$;

create or replace function public.admin_unblock_user(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin  jsonb := public.admin_require_edit();
  v_before jsonb;
  v_after  jsonb;
begin
  select to_jsonb(t) into v_before from (select id, is_blocked from public.app_users where id = p_user_id) t;
  if v_before is null then raise exception 'User not found.'; end if;
  update public.app_users set is_blocked = false where id = p_user_id;
  select to_jsonb(t) into v_after from (select id, is_blocked from public.app_users where id = p_user_id) t;
  perform public.admin_log_action((v_admin->>'id')::uuid, 'admin_unblock_user', 'app_users', p_user_id::text, v_before, v_after);
  return v_after;
end $$;

-- ------------------------------------------------------------
-- RESET password (audited WITHOUT the password value)
-- ------------------------------------------------------------
create or replace function public.admin_reset_user_password(p_user_id uuid, p_new_password text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin  jsonb := public.admin_require_edit();
  v_before jsonb;
begin
  if p_new_password is null or length(p_new_password) < 6 then
    raise exception 'Password must be at least 6 characters.';
  end if;
  select to_jsonb(t) into v_before from (select id, full_name from public.app_users where id = p_user_id) t;
  if v_before is null then raise exception 'User not found.'; end if;

  update public.app_users set password = p_new_password where id = p_user_id;

  perform public.admin_log_action(
    (v_admin->>'id')::uuid, 'admin_reset_user_password', 'app_users', p_user_id::text,
    v_before, null, jsonb_build_object('password_reset', true)
  );
  return jsonb_build_object('ok', true);
end $$;

-- ------------------------------------------------------------
-- DELETE user (hard delete — new in this version).
-- DB-level FKs cascade enrollments, join requests, submissions,
-- attendance, comments, announcements and (for professors)
-- their classes + assignments. Guards:
--   * cannot delete the admin system profile
--   * deleting a professor who owns classes requires p_force
--     = true (their classes and everything under them go too)
-- ------------------------------------------------------------
create or replace function public.admin_delete_user(p_user_id uuid, p_force boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin    jsonb := public.admin_require_edit();
  v_user     record;
  v_classes  int := 0;
  v_subs     int := 0;
begin
  select id, id_number, full_name, role into v_user
  from public.app_users where id = p_user_id;
  if not found then raise exception 'User not found.'; end if;

  if v_user.id_number = 'ADMIN-SYSTEM' then
    raise exception 'The admin system profile cannot be deleted.';
  end if;

  select count(*) into v_classes from public.classes where professor_id = p_user_id;
  if v_classes > 0 and not p_force then
    raise exception 'This professor owns % class(es). Confirm with p_force = true to delete them together with all enrollments, assignments, submissions and attendance.', v_classes;
  end if;

  -- Cascade cleanup happens via FK ON DELETE CASCADE, but we
  -- count first so the audit row is informative.
  select count(*) into v_subs from public.assignment_submissions s
  where s.student_id = p_user_id
     or s.assignment_id in (select a.id from public.class_assignments a where a.professor_id = p_user_id);

  delete from public.app_users where id = p_user_id;

  perform public.admin_log_action(
    (v_admin->>'id')::uuid, 'admin_delete_user', 'app_users', p_user_id::text,
    jsonb_build_object('id_number', v_user.id_number, 'full_name', v_user.full_name, 'role', v_user.role),
    null,
    jsonb_build_object('classes_deleted', v_classes, 'submissions_deleted', v_subs)
  );
  return jsonb_build_object('ok', true);
end $$;