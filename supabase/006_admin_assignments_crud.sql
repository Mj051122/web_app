-- ============================================================
-- 006_admin_assignments_crud.sql
-- ASSIGNMENTS — full CRUD + submissions + grading.
--
-- Run AFTER 005. Idempotent.
-- ============================================================

-- ------------------------------------------------------------
-- LIST assignments (filtered, sorted, paginated)
-- Filters: search, class_id, assignment_id, professor_id,
--          category, assignment_type, status (open|upcoming|closed)
-- ------------------------------------------------------------
create or replace function public.admin_list_assignments(p_filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin  jsonb := public.admin_require_auth();
  v_page   int  := greatest(coalesce(nullif(p_filters->>'page','')::int, 1), 1);
  v_size   int  := greatest(least(coalesce(nullif(p_filters->>'page_size','')::int, 25), 200), 1);
  v_search text := nullif(p_filters->>'search','');
  v_cid    text := nullif(p_filters->>'class_id','');
  v_aid    text := nullif(p_filters->>'assignment_id','');
  v_prof   text := nullif(p_filters->>'professor_id','');
  v_cat    text := nullif(p_filters->>'category','');
  v_type   text := nullif(p_filters->>'assignment_type','');
  v_status text := nullif(p_filters->>'status','');
  v_sort   text := lower(coalesce(nullif(p_filters->>'sort_by',''), 'created_at'));
  v_dir    text := case when lower(coalesce(nullif(p_filters->>'sort_dir',''), 'desc')) = 'asc' then 'asc' else 'desc' end;
  v_where  text := 'true';
  v_sort_sql text;
  v_total  int;
  v_rows   jsonb;
begin
  if v_search is not null then
    v_where := v_where || format(' and (a.title ilike %L or a.instructions ilike %L or c.class_name ilike %L or c.class_code ilike %L)',
      '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%');
  end if;
  if v_cid  is not null then v_where := v_where || format(' and a.class_id = %L::uuid', v_cid); end if;
  if v_aid  is not null then v_where := v_where || format(' and a.id = %L::uuid', v_aid); end if;
  if v_prof is not null then v_where := v_where || format(' and a.professor_id = %L::uuid', v_prof); end if;
  if v_cat  is not null then v_where := v_where || format(' and a.category = %L', v_cat); end if;
  if v_type is not null then v_where := v_where || format(' and a.assignment_type = %L', v_type); end if;
  if v_status = 'closed' then
    v_where := v_where || ' and coalesce(a.end_date, a.start_date) < current_date';
  elsif v_status = 'open' then
    v_where := v_where || ' and coalesce(a.end_date, a.start_date) >= current_date and a.start_date <= current_date';
  elsif v_status = 'upcoming' then
    v_where := v_where || ' and a.start_date > current_date';
  end if;

  v_sort_sql := case v_sort
    when 'title' then 'a.title'
    when 'submission_count' then 'submitted'
    when 'created_at' then 'a.created_at'
    else 'a.created_at'
  end;

  execute format('select count(*) from public.class_assignments a
    join public.classes c on c.id = a.class_id
    where %s', v_where) into v_total;

  execute format(
    'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (
       select a.id, a.class_id, c.class_name, c.class_code, c.subject_code,
              a.professor_id, p.full_name as professor_name,
              a.title, a.instructions, a.category, a.target_points,
              a.start_date, a.end_date, a.start_time, a.end_time,
              a.assignment_type, a.submission_format, a.file_url, a.created_at,
              (select count(*) from public.assignment_submissions s where s.assignment_id = a.id) as submission_count,
              (select count(*) from public.assignment_submissions s where s.assignment_id = a.id and s.score is not null) as graded_count,
              (select count(*) from public.assignment_submissions s where s.assignment_id = a.id and s.score is null) as ungraded_count,
              (select count(*) from public.class_enrollments e where e.class_id = c.id) as enrolled_student_count,
              (select count(*) from public.class_enrollments e where e.class_id = c.id)
                - (select count(*) from public.assignment_submissions s where s.assignment_id = a.id) as missing_count,
              coalesce(a.end_date, a.start_date) < current_date as is_closed,
              a.start_date > current_date as is_upcoming
       from public.class_assignments a
       join public.classes c on c.id = a.class_id
       left join public.app_users p on p.id = a.professor_id
       where %s
       order by %s %s, a.created_at desc
       limit %s offset %s
     ) t',
    v_where, v_sort_sql, v_dir, v_size, (v_page - 1) * v_size
  ) into v_rows;

  return jsonb_build_object('rows', v_rows, 'total', v_total, 'page', v_page, 'page_size', v_size);
end $$;

-- ------------------------------------------------------------
-- CREATE assignment (new in this version).
-- Required: class_id, title. The class's professor is used as
-- the author unless professor_id is explicitly provided.
-- ------------------------------------------------------------
create or replace function public.admin_create_assignment(p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin     jsonb := public.admin_require_edit();
  v_class_id  uuid  := nullif(p_data->>'class_id','')::uuid;
  v_prof_id   uuid  := nullif(p_data->>'professor_id','')::uuid;
  v_title     text  := nullif(p_data->>'title','');
  v_type      text  := coalesce(nullif(p_data->>'assignment_type',''), 'task');
  v_cat       text  := coalesce(nullif(p_data->>'category',''), 'lecture');
  v_fmt       text  := coalesce(nullif(p_data->>'submission_format',''), 'pdf');
  v_pts       numeric;
  v_id        uuid;
begin
  if v_class_id is null then raise exception 'Class is required.'; end if;
  if v_title is null or v_title = '' then raise exception 'Title is required.'; end if;
  if not exists (select 1 from public.classes where id = v_class_id) then
    raise exception 'Class not found.';
  end if;
  if v_type not in ('material','task','quiz','exam') then raise exception 'Invalid assignment_type.'; end if;
  if v_cat not in ('lecture','laboratory') then raise exception 'Invalid category.'; end if;
  if v_fmt not in ('pdf','docx','pptx','xlsx','image','zip') then raise exception 'Invalid submission_format.'; end if;

  if v_prof_id is null then
    select professor_id into v_prof_id from public.classes where id = v_class_id;
  end if;
  if not exists (select 1 from public.app_users where id = v_prof_id and role = 'professor') then
    raise exception 'Professor not found.';
  end if;

  v_pts := coalesce(nullif(p_data->>'target_points','')::numeric, 100);
  if v_pts <= 0 then raise exception 'target_points must be greater than 0.'; end if;

  insert into public.class_assignments (
    class_id, professor_id, title, instructions, category, target_points,
    start_date, end_date, start_time, end_time, assignment_type, file_url,
    submission_format, requires_file, allow_comments
  )
  values (
    v_class_id, v_prof_id, v_title,
    coalesce(nullif(p_data->>'instructions',''), ''),
    v_cat, v_pts,
    case when nullif(p_data->>'start_date','') is not null then (p_data->>'start_date')::date else null end,
    case when nullif(p_data->>'end_date','') is not null then (p_data->>'end_date')::date else null end,
    case when nullif(p_data->>'start_time','') is not null then (p_data->>'start_time')::time else null end,
    case when nullif(p_data->>'end_time','') is not null then (p_data->>'end_time')::time else null end,
    v_type,
    nullif(p_data->>'file_url',''),
    v_fmt,
    case when p_data ? 'requires_file' then (p_data->>'requires_file')::boolean else true end,
    case when p_data ? 'allow_comments' then (p_data->>'allow_comments')::boolean else true end
  )
  returning id into v_id;

  perform public.admin_log_action(
    (v_admin->>'id')::uuid, 'admin_create_assignment', 'class_assignments', v_id::text,
    null, jsonb_build_object('class_id', v_class_id, 'title', v_title)
  );
  return jsonb_build_object('id', v_id);
end $$;

-- ------------------------------------------------------------
-- UPDATE assignment
-- ------------------------------------------------------------
create or replace function public.admin_update_assignment(p_assignment_id uuid, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin  jsonb := public.admin_require_edit();
  v_before jsonb;
  v_after  jsonb;
  v_type   text := nullif(p_data->>'assignment_type','');
  v_cat    text := nullif(p_data->>'category','');
  v_fmt    text := nullif(p_data->>'submission_format','');
  v_pts    numeric;
begin
  if v_type is not null and v_type not in ('material','task','quiz','exam') then
    raise exception 'Invalid assignment_type.';
  end if;
  if v_cat is not null and v_cat not in ('lecture','laboratory') then
    raise exception 'Invalid category.';
  end if;
  if v_fmt is not null and v_fmt not in ('pdf','docx','pptx','xlsx','image','zip') then
    raise exception 'Invalid submission_format.';
  end if;
  if p_data ? 'target_points' and nullif(p_data->>'target_points','') is not null then
    v_pts := (p_data->>'target_points')::numeric;
    if v_pts <= 0 then raise exception 'target_points must be greater than 0.'; end if;
  end if;

  select to_jsonb(t) into v_before from (
    select id, class_id, title, instructions, category, target_points, start_date, end_date,
           start_time, end_time, assignment_type, submission_format, file_url,
           requires_file, allow_comments
    from public.class_assignments where id = p_assignment_id
  ) t;
  if v_before is null then raise exception 'Assignment not found.'; end if;

  update public.class_assignments set
    title             = coalesce(nullif(p_data->>'title',''), title),
    instructions      = case when p_data ? 'instructions' then nullif(p_data->>'instructions','') else instructions end,
    category          = case when v_cat is not null then v_cat else category end,
    target_points     = case when v_pts is not null then v_pts else target_points end,
    start_date        = case when p_data ? 'start_date' and nullif(p_data->>'start_date','') is not null then (p_data->>'start_date')::date else start_date end,
    end_date          = case when p_data ? 'end_date' and nullif(p_data->>'end_date','') is not null then (p_data->>'end_date')::date else end_date end,
    start_time        = case when p_data ? 'start_time' and nullif(p_data->>'start_time','') is not null then (p_data->>'start_time')::time else start_time end,
    end_time          = case when p_data ? 'end_time' and nullif(p_data->>'end_time','') is not null then (p_data->>'end_time')::time else end_time end,
    assignment_type   = case when v_type is not null then v_type else assignment_type end,
    submission_format = case when v_fmt is not null then v_fmt else submission_format end,
    file_url          = case when p_data ? 'file_url' then nullif(p_data->>'file_url','') else file_url end,
    requires_file     = case when p_data ? 'requires_file' then (p_data->>'requires_file')::boolean else requires_file end,
    allow_comments    = case when p_data ? 'allow_comments' then (p_data->>'allow_comments')::boolean else allow_comments end
  where id = p_assignment_id;

  select to_jsonb(t) into v_after from (
    select id, class_id, title, instructions, category, target_points, start_date, end_date,
           start_time, end_time, assignment_type, submission_format, file_url,
           requires_file, allow_comments
    from public.class_assignments where id = p_assignment_id
  ) t;

  perform public.admin_log_action(
    (v_admin->>'id')::uuid, 'admin_update_assignment', 'class_assignments', p_assignment_id::text, v_before, v_after
  );
  return v_after;
end $$;

-- ------------------------------------------------------------
-- DELETE assignment (hard). Requires p_force = true when it
-- already has submissions.
-- ------------------------------------------------------------
create or replace function public.admin_delete_assignment(p_assignment_id uuid, p_force boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin  jsonb := public.admin_require_edit();
  v_before jsonb;
  v_count  int;
begin
  select to_jsonb(t) into v_before from (
    select a.*,
      (select jsonb_agg(to_jsonb(s)) from public.assignment_submissions s where s.assignment_id = a.id) as submissions
    from public.class_assignments a where a.id = p_assignment_id
  ) t;
  if v_before is null then raise exception 'Assignment not found.'; end if;

  select count(*) into v_count from public.assignment_submissions where assignment_id = p_assignment_id;
  if v_count > 0 and not p_force then
    raise exception 'This assignment has % submissions. Confirm with p_force = true to delete.', v_count;
  end if;

  delete from public.assignment_submissions where assignment_id = p_assignment_id;
  delete from public.assignment_comments where assignment_id = p_assignment_id;
  delete from public.attendance where assignment_id = p_assignment_id;
  delete from public.class_assignments where id = p_assignment_id;

  perform public.admin_log_action(
    (v_admin->>'id')::uuid, 'admin_delete_assignment', 'class_assignments', p_assignment_id::text,
    v_before, null, jsonb_build_object('submissions_deleted', v_count)
  );
  return jsonb_build_object('ok', true);
end $$;

-- ============================================================
-- SUBMISSIONS & GRADES
-- ============================================================

-- ------------------------------------------------------------
-- LIST submissions (filtered, sorted, paginated)
-- Filters: search, assignment_id, submission_id, class_id,
--          student_id, status (graded|ungraded)
-- ------------------------------------------------------------
create or replace function public.admin_list_submissions(p_filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin  jsonb := public.admin_require_auth();
  v_page   int  := greatest(coalesce(nullif(p_filters->>'page','')::int, 1), 1);
  v_size   int  := greatest(least(coalesce(nullif(p_filters->>'page_size','')::int, 25), 200), 1);
  v_search text := nullif(p_filters->>'search','');
  v_aid    text := nullif(p_filters->>'assignment_id','');
  v_sid    text := nullif(p_filters->>'submission_id','');
  v_cid    text := nullif(p_filters->>'class_id','');
  v_student text := nullif(p_filters->>'student_id','');
  v_status text := nullif(p_filters->>'status','');
  v_sort   text := lower(coalesce(nullif(p_filters->>'sort_by',''), 'submitted_at'));
  v_dir    text := case when lower(coalesce(nullif(p_filters->>'sort_dir',''), 'desc')) = 'asc' then 'asc' else 'desc' end;
  v_where  text := 'true';
  v_sort_sql text;
  v_total  int;
  v_rows   jsonb;
begin
  if v_search is not null then
    v_where := v_where || format(' and (s.full_name ilike %L or s.id_number ilike %L or a.title ilike %L)',
      '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%');
  end if;
  if v_aid    is not null then v_where := v_where || format(' and sub.assignment_id = %L::uuid', v_aid); end if;
  if v_sid    is not null then v_where := v_where || format(' and sub.id = %L::uuid', v_sid); end if;
  if v_cid    is not null then v_where := v_where || format(' and a.class_id = %L::uuid', v_cid); end if;
  if v_student is not null then v_where := v_where || format(' and sub.student_id = %L::uuid', v_student); end if;
  if v_status = 'graded' then
    v_where := v_where || ' and sub.score is not null';
  elsif v_status = 'ungraded' then
    v_where := v_where || ' and sub.score is null';
  end if;

  v_sort_sql := case v_sort
    when 'student_name' then 's.full_name'
    when 'submitted_at' then 'sub.submitted_at'
    when 'score' then 'sub.score'
    else 'sub.submitted_at'
  end;

  execute format('select count(*) from public.assignment_submissions sub
    join public.app_users s on s.id = sub.student_id
    join public.class_assignments a on a.id = sub.assignment_id
    join public.classes c on c.id = a.class_id
    where %s', v_where) into v_total;

  execute format(
    'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (
       select sub.id, sub.assignment_id, a.title as assignment_title, a.target_points,
              c.id as class_id, c.class_name,
              sub.student_id, s.full_name as student_name, s.id_number as student_id_number,
              sub.response_text, sub.submitted_at, sub.edit_attempts, sub.score,
              sub.submission_file_url
       from public.assignment_submissions sub
       join public.app_users s on s.id = sub.student_id
       join public.class_assignments a on a.id = sub.assignment_id
       join public.classes c on c.id = a.class_id
       where %s
       order by %s %s, sub.submitted_at desc
       limit %s offset %s
     ) t',
    v_where, v_sort_sql, v_dir, v_size, (v_page - 1) * v_size
  ) into v_rows;

  return jsonb_build_object('rows', v_rows, 'total', v_total, 'page', v_page, 'page_size', v_size);
end $$;

-- ------------------------------------------------------------
-- SET score (p_score null clears it). The DB column is int4;
-- a fractional score is rounded.
-- ------------------------------------------------------------
create or replace function public.admin_set_score(p_submission_id uuid, p_score numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin  jsonb := public.admin_require_edit();
  v_before jsonb;
  v_after  jsonb;
  v_max    numeric;
begin
  select to_jsonb(t) into v_before from (
    select id, assignment_id, score from public.assignment_submissions where id = p_submission_id
  ) t;
  if v_before is null then raise exception 'Submission not found.'; end if;

  if p_score is not null then
    select coalesce(a.target_points, 1000000) into v_max
    from public.class_assignments a where a.id = (v_before->>'assignment_id')::uuid;
    if p_score < 0 then raise exception 'Score cannot be negative.'; end if;
    if p_score > v_max then raise exception 'Score % exceeds the assignment target (%).', p_score, v_max; end if;
    p_score := round(p_score);
  end if;

  update public.assignment_submissions set score = p_score::int where id = p_submission_id;

  select to_jsonb(t) into v_after from (
    select id, assignment_id, score from public.assignment_submissions where id = p_submission_id
  ) t;

  perform public.admin_log_action(
    (v_admin->>'id')::uuid, 'admin_set_score', 'assignment_submissions', p_submission_id::text, v_before, v_after
  );
  return v_after;
end $$;

-- ------------------------------------------------------------
-- UNGRADED / MISSING overview.
-- scope = 'assignments': per-assignment grading status.
-- scope = 'students'   : per-student status for one assignment
--   (requires assignment_id).
-- ------------------------------------------------------------
create or replace function public.admin_list_ungraded(p_filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin  jsonb := public.admin_require_auth();
  v_page   int  := greatest(coalesce(nullif(p_filters->>'page','')::int, 1), 1);
  v_size   int  := greatest(least(coalesce(nullif(p_filters->>'page_size','')::int, 50), 200), 1);
  v_scope  text := coalesce(nullif(p_filters->>'scope',''), 'assignments');
  v_cid    text := nullif(p_filters->>'class_id','');
  v_cat    text := nullif(p_filters->>'category','');
  v_search text := nullif(p_filters->>'search','');
  v_aid    text := nullif(p_filters->>'assignment_id','');
  v_where  text := 'true';
  v_total  int;
  v_rows   jsonb;
begin
  if v_scope = 'assignments' then
    if v_cid is not null then v_where := v_where || format(' and a.class_id = %L::uuid', v_cid); end if;
    if v_cat is not null then v_where := v_where || format(' and a.category = %L', v_cat); end if;
    if v_search is not null then
      v_where := v_where || format(' and (a.title ilike %L or c.class_name ilike %L)', '%'||v_search||'%', '%'||v_search||'%');
    end if;

    execute format('select count(*) from public.class_assignments a
      join public.classes c on c.id = a.class_id where %s', v_where) into v_total;

    execute format(
      'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (
         select a.id as assignment_id, a.title, c.id as class_id, c.class_name,
                (select count(*) from public.class_enrollments e where e.class_id = c.id) as enrolled_count,
                (select count(*) from public.assignment_submissions s where s.assignment_id = a.id) as submitted_count,
                (select count(*) from public.assignment_submissions s where s.assignment_id = a.id and s.score is not null) as graded_count,
                (select count(*) from public.assignment_submissions s where s.assignment_id = a.id and s.score is null) as ungraded_count,
                (select count(*) from public.class_enrollments e where e.class_id = c.id)
                  - (select count(*) from public.assignment_submissions s where s.assignment_id = a.id) as missing_count
         from public.class_assignments a
         join public.classes c on c.id = a.class_id
         where %s
         order by ungraded_count desc, a.created_at desc
         limit %s offset %s
       ) t',
      v_where, v_size, (v_page - 1) * v_size
    ) into v_rows;
  else
    if v_aid is null then
      raise exception 'scope=students requires an assignment_id filter.';
    end if;
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (
         select s.id as student_id, s.full_name as student_name, s.id_number,
                sub.id as submission_id, sub.submitted_at, sub.score,
                (sub.id is not null) as submitted,
                case when sub.score is null and sub.id is not null then true else false end as ungraded
         from public.class_enrollments e
         join public.app_users s on s.id = e.student_id
         left join public.assignment_submissions sub
           on sub.assignment_id = %L::uuid and sub.student_id = s.id
         where e.class_id = (select class_id from public.class_assignments where id = %L::uuid)
         order by s.full_name
         limit %s offset %s
       ) t',
      v_aid, v_aid, v_size, (v_page - 1) * v_size
    ) into v_rows;
    execute format(
      'select count(*) from public.class_enrollments e
       where e.class_id = (select class_id from public.class_assignments where id = %L::uuid)',
      v_aid
    ) into v_total;
  end if;

  return jsonb_build_object('rows', v_rows, 'total', v_total, 'page', v_page, 'page_size', v_size, 'scope', v_scope);
end $$;