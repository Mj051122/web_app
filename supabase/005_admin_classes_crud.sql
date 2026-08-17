-- ============================================================
-- 005_admin_classes_crud.sql
-- CLASSES — full CRUD on classes + enrollments + join requests.
--
-- Run AFTER 004. Idempotent.
-- ============================================================

-- ------------------------------------------------------------
-- LIST classes (filtered, sorted, paginated)
-- Filters: search, year_level, department, section, track,
--          status (active|archived), professor_id, student_id,
--          class_id
-- ------------------------------------------------------------
create or replace function public.admin_list_classes(p_filters jsonb default '{}'::jsonb)
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
  v_year    text  := nullif(p_filters->>'year_level','');
  v_dept    text  := nullif(p_filters->>'department','');
  v_sec     text  := nullif(p_filters->>'section','');
  v_track   text  := nullif(p_filters->>'track','');
  v_status  text  := nullif(p_filters->>'status','');
  v_prof    text  := nullif(p_filters->>'professor_id','');
  v_student text  := nullif(p_filters->>'student_id','');
  v_cid     text  := nullif(p_filters->>'class_id','');
  v_sort    text  := lower(coalesce(nullif(p_filters->>'sort_by',''), 'created_at'));
  v_dir     text  := case when lower(coalesce(nullif(p_filters->>'sort_dir',''), 'desc')) = 'asc' then 'asc' else 'desc' end;
  v_where   text  := 'true';
  v_sort_sql text;
  v_total   int;
  v_rows    jsonb;
begin
  if v_search is not null then
    v_where := v_where || format(' and (c.class_name ilike %L or c.subject_name ilike %L or c.class_code ilike %L or c.subject_code ilike %L or c.join_code ilike %L)',
      '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%');
  end if;
  if v_year   is not null then v_where := v_where || format(' and c.year_level = %L', v_year); end if;
  if v_dept   is not null then v_where := v_where || format(' and c.department = %L', v_dept); end if;
  if v_sec    is not null then v_where := v_where || format(' and c.section = %L', v_sec); end if;
  if v_track  is not null then v_where := v_where || format(' and c.track = %L', v_track); end if;
  if v_status = 'archived' then
    v_where := v_where || ' and exists (select 1 from public.admin_archived_classes a where a.class_id = c.id)';
  elsif v_status = 'active' then
    v_where := v_where || ' and not exists (select 1 from public.admin_archived_classes a where a.class_id = c.id)';
  end if;
  if v_prof   is not null then v_where := v_where || format(' and c.professor_id = %L::uuid', v_prof); end if;
  if v_student is not null then
    v_where := v_where || format(' and exists (select 1 from public.class_enrollments e where e.class_id = c.id and e.student_id = %L::uuid)', v_student);
  end if;
  if v_cid    is not null then v_where := v_where || format(' and c.id = %L::uuid', v_cid); end if;

  v_sort_sql := case v_sort
    when 'class_name' then 'c.class_name'
    when 'subject_name' then 'c.subject_name'
    when 'created_at' then 'c.created_at'
    else 'c.created_at'
  end;

  execute format('select count(*) from public.classes c where %s', v_where) into v_total;

  execute format(
    'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (
       select c.id, c.professor_id, p.full_name as professor_name, c.class_code, c.subject_name,
              c.class_name, c.subject_code, c.join_code, c.year_level, c.department, c.section,
              c.track, c.schedule_days, c.schedule_start_time, c.schedule_end_time,
              c.cover_image_url, c.theme_color, c.created_at,
              (select count(*) from public.class_enrollments e where e.class_id = c.id) as enrollment_count,
              (select count(*) from public.class_assignments a where a.class_id = c.id) as assignment_count,
              exists (select 1 from public.admin_archived_classes a where a.class_id = c.id) as is_archived
       from public.classes c
       left join public.app_users p on p.id = c.professor_id
       where %s
       order by %s %s, c.created_at desc
       limit %s offset %s
     ) t',
    v_where, v_sort_sql, v_dir, v_size, (v_page - 1) * v_size
  ) into v_rows;

  return jsonb_build_object('rows', v_rows, 'total', v_total, 'page', v_page, 'page_size', v_size);
end $$;

-- ------------------------------------------------------------
-- CREATE class (new in this version).
-- Required: professor_id (must be a professor), class_name,
--           subject_code. join_code auto-generates a unique
--           6-digit code when omitted.
-- schedule_days accepts a JSON array OR a "Mon, Wed" string
-- (both normalized by admin_to_text_array).
-- ------------------------------------------------------------
create or replace function public.admin_create_class(p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin      jsonb := public.admin_require_edit();
  v_professor  uuid  := nullif(p_data->>'professor_id','')::uuid;
  v_class_name text  := nullif(p_data->>'class_name','');
  v_subject    text  := nullif(p_data->>'subject_code','');
  v_join_code  text  := nullif(p_data->>'join_code','');
  v_year       text  := nullif(p_data->>'year_level','');
  v_id         uuid;
  v_attempt    int   := 0;
begin
  if v_professor is null then raise exception 'Professor is required.'; end if;
  if v_class_name is null or v_class_name = '' then raise exception 'Class name is required.'; end if;
  if v_subject is null or v_subject = '' then raise exception 'Subject code is required.'; end if;

  if not exists (select 1 from public.app_users where id = v_professor and role = 'professor') then
    raise exception 'Selected professor does not exist.';
  end if;

  if v_year is not null and v_year not in ('first','second','third','fourth') then
    raise exception 'year_level must be first, second, third or fourth.';
  end if;

  -- Resolve / generate a unique 6-digit join code.
  if v_join_code is not null then
    if not (v_join_code ~ '^[0-9]{6}$') then
      raise exception 'join_code must be exactly 6 digits.';
    end if;
    if exists (select 1 from public.classes where join_code = v_join_code) then
      raise exception 'That join code is already taken.';
    end if;
  else
    loop
      v_attempt := v_attempt + 1;
      v_join_code := lpad(floor(random() * 1000000)::int::text, 6, '0');
      exit when not exists (select 1 from public.classes where join_code = v_join_code);
      if v_attempt > 20 then
        raise exception 'Could not generate a free join code. Try again.';
      end if;
    end loop;
  end if;

  insert into public.classes (
    professor_id, class_code, subject_name, class_name, subject_code, join_code,
    year_level, department, section, track, schedule_days,
    schedule_start_time, schedule_end_time, cover_image_url, theme_color
  )
  values (
    v_professor,
    nullif(p_data->>'class_code',''),
    nullif(p_data->>'subject_name',''),
    v_class_name,
    v_subject,
    v_join_code,
    v_year,
    coalesce(nullif(p_data->>'department',''), 'Unassigned'),
    coalesce(nullif(p_data->>'section',''), 'Unassigned'),
    nullif(p_data->>'track',''),
    public.admin_to_text_array(p_data->'schedule_days'),
    case when nullif(p_data->>'schedule_start_time','') is not null
         then (p_data->>'schedule_start_time')::time else null end,
    case when nullif(p_data->>'schedule_end_time','') is not null
         then (p_data->>'schedule_end_time')::time else null end,
    nullif(p_data->>'cover_image_url',''),
    coalesce(nullif(p_data->>'theme_color',''), 'blue')
  )
  returning id into v_id;

  perform public.admin_log_action(
    (v_admin->>'id')::uuid, 'admin_create_class', 'classes', v_id::text,
    null, jsonb_build_object('class_name', v_class_name, 'subject_code', v_subject, 'join_code', v_join_code)
  );
  return jsonb_build_object('id', v_id, 'join_code', v_join_code);
end $$;

-- ------------------------------------------------------------
-- ARCHIVE / UNARCHIVE (soft)
-- ------------------------------------------------------------
create or replace function public.admin_archive_class(p_class_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin jsonb := public.admin_require_edit();
begin
  if not exists (select 1 from public.classes where id = p_class_id) then
    raise exception 'Class not found.';
  end if;
  insert into public.admin_archived_classes (class_id, archived_by)
  values (p_class_id, (v_admin->>'id')::uuid)
  on conflict (class_id) do nothing;
  perform public.admin_log_action(
    (v_admin->>'id')::uuid, 'admin_archive_class', 'classes', p_class_id::text
  );
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_unarchive_class(p_class_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin jsonb := public.admin_require_edit();
begin
  delete from public.admin_archived_classes where class_id = p_class_id;
  perform public.admin_log_action(
    (v_admin->>'id')::uuid, 'admin_unarchive_class', 'classes', p_class_id::text
  );
  return jsonb_build_object('ok', true);
end $$;

-- ------------------------------------------------------------
-- UPDATE class
-- ------------------------------------------------------------
create or replace function public.admin_update_class(p_class_id uuid, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin  jsonb := public.admin_require_edit();
  v_before jsonb;
  v_after  jsonb;
  v_prof   uuid;
begin
  select to_jsonb(t) into v_before from (
    select id, professor_id, class_code, subject_name, class_name, subject_code, join_code,
           year_level, department, section, track, schedule_days, schedule_start_time,
           schedule_end_time, cover_image_url, theme_color
    from public.classes where id = p_class_id
  ) t;
  if v_before is null then raise exception 'Class not found.'; end if;

  if p_data ? 'professor_id' and nullif(p_data->>'professor_id','') is not null then
    v_prof := (p_data->>'professor_id')::uuid;
    if not exists (select 1 from public.app_users where id = v_prof and role = 'professor') then
      raise exception 'Selected professor does not exist.';
    end if;
  end if;

  if p_data ? 'join_code' and nullif(p_data->>'join_code','') is not null
     and (p_data->>'join_code') !~ '^[0-9]{6}$' then
    raise exception 'join_code must be exactly 6 digits.';
  end if;

  update public.classes set
    class_name          = coalesce(nullif(p_data->>'class_name',''), class_name),
    subject_name        = case when p_data ? 'subject_name' then nullif(p_data->>'subject_name','') else subject_name end,
    class_code          = case when p_data ? 'class_code' then nullif(p_data->>'class_code','') else class_code end,
    subject_code        = case when p_data ? 'subject_code' then nullif(p_data->>'subject_code','') else subject_code end,
    join_code           = case when p_data ? 'join_code' then nullif(p_data->>'join_code','') else join_code end,
    professor_id        = case when v_prof is not null then v_prof else professor_id end,
    year_level          = case when p_data ? 'year_level' then nullif(p_data->>'year_level','') else year_level end,
    department          = case when p_data ? 'department' then nullif(p_data->>'department','') else department end,
    section             = case when p_data ? 'section' then nullif(p_data->>'section','') else section end,
    track               = case when p_data ? 'track' then nullif(p_data->>'track','') else track end,
    schedule_days       = case when p_data ? 'schedule_days'
                               then public.admin_to_text_array(p_data->'schedule_days') else schedule_days end,
    schedule_start_time = case when p_data ? 'schedule_start_time' and nullif(p_data->>'schedule_start_time','') is not null
                               then (p_data->>'schedule_start_time')::time else schedule_start_time end,
    schedule_end_time   = case when p_data ? 'schedule_end_time' and nullif(p_data->>'schedule_end_time','') is not null
                               then (p_data->>'schedule_end_time')::time else schedule_end_time end,
    cover_image_url     = case when p_data ? 'cover_image_url' then nullif(p_data->>'cover_image_url','') else cover_image_url end,
    theme_color         = case when p_data ? 'theme_color' then nullif(p_data->>'theme_color','') else theme_color end
  where id = p_class_id;

  select to_jsonb(t) into v_after from (
    select id, professor_id, class_code, subject_name, class_name, subject_code, join_code,
           year_level, department, section, track, schedule_days, schedule_start_time,
           schedule_end_time, cover_image_url, theme_color
    from public.classes where id = p_class_id
  ) t;

  perform public.admin_log_action(
    (v_admin->>'id')::uuid, 'admin_update_class', 'classes', p_class_id::text, v_before, v_after
  );
  return v_after;
end $$;

-- ------------------------------------------------------------
-- DELETE class (hard). Requires p_force = true when the class
-- has submissions or attendance records. Cleans up every
-- dependent row explicitly (the DB FKs cascade, but explicit
-- deletes keep the audit row informative and order clear).
-- ------------------------------------------------------------
create or replace function public.admin_delete_class(p_class_id uuid, p_force boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin     jsonb := public.admin_require_edit();
  v_before    jsonb;
  v_sub_count int;
  v_att_count int;
begin
  select to_jsonb(t) into v_before from (
    select c.*,
      (select jsonb_agg(to_jsonb(e)) from public.class_enrollments e where e.class_id = c.id) as enrollments,
      (select jsonb_agg(to_jsonb(a)) from public.class_assignments a where a.class_id = c.id) as assignments,
      (select jsonb_agg(to_jsonb(s)) from public.assignment_submissions s
        where s.assignment_id in (select a.id from public.class_assignments a where a.class_id = c.id)) as submissions,
      (select jsonb_agg(to_jsonb(x)) from public.attendance x where x.class_id = c.id) as attendance,
      (select jsonb_agg(to_jsonb(r)) from public.class_join_requests r where r.class_id = c.id) as join_requests
    from public.classes c where c.id = p_class_id
  ) t;

  if v_before is null then raise exception 'Class not found.'; end if;

  select count(*) into v_sub_count from public.assignment_submissions s
  where s.assignment_id in (select a.id from public.class_assignments a where a.class_id = p_class_id);
  select count(*) into v_att_count from public.attendance where class_id = p_class_id;

  if (v_sub_count > 0 or v_att_count > 0) and not p_force then
    raise exception 'Class has % submissions and % attendance records. Confirm with p_force = true to delete.', v_sub_count, v_att_count;
  end if;

  delete from public.attendance where class_id = p_class_id;
  delete from public.assignment_comments where class_id = p_class_id;
  delete from public.assignment_submissions where assignment_id in (select id from public.class_assignments where class_id = p_class_id);
  delete from public.class_assignments where class_id = p_class_id;
  delete from public.class_enrollments where class_id = p_class_id;
  delete from public.class_join_requests where class_id = p_class_id;
  delete from public.admin_archived_classes where class_id = p_class_id;
  delete from public.classes where id = p_class_id;

  perform public.admin_log_action(
    (v_admin->>'id')::uuid, 'admin_delete_class', 'classes', p_class_id::text,
    v_before, null, jsonb_build_object('submissions_deleted', v_sub_count, 'attendance_deleted', v_att_count)
  );
  return jsonb_build_object('ok', true);
end $$;

-- ------------------------------------------------------------
-- ENROLL / REMOVE student
-- ------------------------------------------------------------
create or replace function public.admin_enroll_student(p_class_id uuid, p_student_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin jsonb := public.admin_require_edit();
begin
  if not exists (select 1 from public.classes where id = p_class_id) then
    raise exception 'Class not found.';
  end if;
  if not exists (select 1 from public.app_users where id = p_student_id and role = 'student') then
    raise exception 'Student not found.';
  end if;
  insert into public.class_enrollments (class_id, student_id)
  values (p_class_id, p_student_id)
  on conflict do nothing;
  perform public.admin_log_action(
    (v_admin->>'id')::uuid, 'admin_enroll_student', 'class_enrollments', p_class_id::text || ':' || p_student_id::text
  );
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_remove_student(p_class_id uuid, p_student_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin  jsonb := public.admin_require_edit();
  v_before jsonb;
begin
  select to_jsonb(t) into v_before from public.class_enrollments t
  where class_id = p_class_id and student_id = p_student_id;
  if v_before is null then raise exception 'Enrollment not found.'; end if;
  delete from public.class_enrollments where class_id = p_class_id and student_id = p_student_id;
  perform public.admin_log_action(
    (v_admin->>'id')::uuid, 'admin_remove_student', 'class_enrollments', p_class_id::text || ':' || p_student_id::text,
    v_before, null
  );
  return jsonb_build_object('ok', true);
end $$;

-- ------------------------------------------------------------
-- JOIN REQUESTS
-- ------------------------------------------------------------
create or replace function public.admin_list_join_requests(p_filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin  jsonb := public.admin_require_auth();
  v_page   int  := greatest(coalesce(nullif(p_filters->>'page','')::int, 1), 1);
  v_size   int  := greatest(least(coalesce(nullif(p_filters->>'page_size','')::int, 25), 200), 1);
  v_status text := nullif(p_filters->>'status','');
  v_cid    text := nullif(p_filters->>'class_id','');
  v_search text := nullif(p_filters->>'search','');
  v_sort   text := lower(coalesce(nullif(p_filters->>'sort_by',''), 'requested_at'));
  v_dir    text := case when lower(coalesce(nullif(p_filters->>'sort_dir',''), 'desc')) = 'asc' then 'asc' else 'desc' end;
  v_where  text := 'true';
  v_sort_sql text;
  v_total  int;
  v_rows   jsonb;
begin
  if v_status is not null then v_where := v_where || format(' and r.status = %L', v_status); end if;
  if v_cid is not null then v_where := v_where || format(' and r.class_id = %L::uuid', v_cid); end if;
  if v_search is not null then
    v_where := v_where || format(' and (s.full_name ilike %L or s.id_number ilike %L or c.class_name ilike %L or c.class_code ilike %L)',
      '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%');
  end if;
  v_sort_sql := case v_sort
    when 'student_name' then 's.full_name'
    when 'class_name' then 'c.class_name'
    when 'requested_at' then 'r.requested_at'
    else 'r.requested_at'
  end;

  execute format('select count(*) from public.class_join_requests r
    join public.app_users s on s.id = r.student_id
    join public.classes c on c.id = r.class_id
    where %s', v_where) into v_total;

  execute format(
    'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (
       select r.id, r.class_id, c.class_name, c.subject_name, c.class_code, c.year_level as class_year_level,
              r.student_id, s.full_name as student_name, s.id_number as student_id_number,
              s.year_level as student_year_level, r.status, r.requested_at, r.decided_at, r.decided_by
       from public.class_join_requests r
       join public.app_users s on s.id = r.student_id
       join public.classes c on c.id = r.class_id
       where %s
       order by %s %s, r.requested_at desc
       limit %s offset %s
     ) t',
    v_where, v_sort_sql, v_dir, v_size, (v_page - 1) * v_size
  ) into v_rows;

  return jsonb_build_object('rows', v_rows, 'total', v_total, 'page', v_page, 'page_size', v_size);
end $$;

-- Decide a join request. Mirrors the app's own flow directly
-- (update the request + create the enrollment on approval) so
-- it never depends on the mobile app's RPC signatures.
create or replace function public.admin_decide_join_request(p_request_id uuid, p_decision text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin jsonb := public.admin_require_edit();
  v_req   record;
begin
  if p_decision not in ('approve','reject') then
    raise exception 'p_decision must be approve or reject.';
  end if;

  select r.id, r.class_id, r.student_id, r.status into v_req
  from public.class_join_requests r where r.id = p_request_id;
  if not found then raise exception 'Join request not found.'; end if;
  if v_req.status <> 'pending' then
    raise exception 'This request was already decided (%).', v_req.status;
  end if;

  update public.class_join_requests
  set status = p_decision, decided_at = now(), decided_by = (v_admin->>'id')::uuid
  where id = p_request_id;

  if p_decision = 'approve' then
    insert into public.class_enrollments (class_id, student_id)
    values (v_req.class_id, v_req.student_id)
    on conflict do nothing;
  end if;

  perform public.admin_log_action(
    (v_admin->>'id')::uuid,
    'admin_decide_join_request_' || p_decision,
    'class_join_requests', p_request_id::text,
    jsonb_build_object('status', v_req.status),
    jsonb_build_object('status', p_decision)
  );
  return jsonb_build_object('ok', true);
end $$;