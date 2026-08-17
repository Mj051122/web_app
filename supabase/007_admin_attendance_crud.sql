-- ============================================================
-- 007_admin_attendance_crud.sql
-- ATTENDANCE — the app stores PRESENT scans only (status is
-- constrained to 'present'); an "absent" record is simply the
-- absence of a scan. The admin RPCs below follow that model:
-- fixing to absent = deleting the present record.
--
-- Run AFTER 006. Idempotent.
-- ============================================================

-- ------------------------------------------------------------
-- LIST attendance (filtered, sorted, paginated)
-- Filters: search, class_id, assignment_id, student_id,
--          attendance_date, status:
--            'absent'  -> enrolled students WITHOUT a scan
--                         (requires class_id)
--            'present' -> actual scan records (default)
--          duplicates_only (true) -> only duplicate scans
-- Returns rows, total, duplicate_count.
-- ------------------------------------------------------------
create or replace function public.admin_list_attendance(p_filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin  jsonb := public.admin_require_auth();
  v_page   int  := greatest(coalesce(nullif(p_filters->>'page','')::int, 1), 1);
  v_size   int  := greatest(least(coalesce(nullif(p_filters->>'page_size','')::int, 50), 200), 1);
  v_search text := nullif(p_filters->>'search','');
  v_cid    text := nullif(p_filters->>'class_id','');
  v_aid    text := nullif(p_filters->>'assignment_id','');
  v_student text := nullif(p_filters->>'student_id','');
  v_date   text := nullif(p_filters->>'attendance_date','');
  v_status text := nullif(p_filters->>'status','');
  v_dups   text := nullif(p_filters->>'duplicates_only','');
  v_sort   text := lower(coalesce(nullif(p_filters->>'sort_by',''), 'attendance_date'));
  v_dir    text := case when lower(coalesce(nullif(p_filters->>'sort_dir',''), 'desc')) = 'asc' then 'asc' else 'desc' end;
  v_where  text := 'true';
  v_sort_sql text;
  v_total  int;
  v_rows   jsonb;
  v_dup_total int;
begin
  if v_status = 'absent' then
    if v_cid is null then
      raise exception 'Pick a class (and optionally an assignment/date) to view absences.';
    end if;
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (
         select s.id as student_id, s.full_name as student_name, s.id_number,
                null as attendance_id, %L::uuid as class_id,
                (select c.class_name from public.classes c where c.id = %L::uuid) as class_name,
                (select a.title from public.class_assignments a where a.id = %L::uuid) as assignment_title,
                %L::date as attendance_date, ''absent'' as status, null as created_at
         from public.class_enrollments e
         join public.app_users s on s.id = e.student_id
         where e.class_id = %L::uuid
           and not exists (
             select 1 from public.attendance x
             where x.student_id = s.id and x.class_id = e.class_id
               and (%L::uuid is null or x.assignment_id = %L::uuid)
               and (%L::date is null or x.attendance_date = %L::date)
           )
           and (%L is null or s.full_name ilike %L or s.id_number ilike %L)
         order by s.full_name
         limit %s offset %s
       ) t',
      v_cid, v_cid, v_aid, v_date, v_cid,
      v_aid, v_aid, v_date, v_date,
      v_search, '%'||coalesce(v_search,'')||'%', '%'||coalesce(v_search,'')||'%',
      v_size, (v_page - 1) * v_size
    ) into v_rows;
    execute format(
      'select count(*) from public.class_enrollments e join public.app_users s on s.id = e.student_id
       where e.class_id = %L::uuid
         and not exists (
           select 1 from public.attendance x where x.student_id = s.id and x.class_id = e.class_id
             and (%L::uuid is null or x.assignment_id = %L::uuid)
             and (%L::date is null or x.attendance_date = %L::date)
         )',
      v_cid, v_aid, v_aid, v_date, v_date
    ) into v_total;
    return jsonb_build_object('rows', v_rows, 'total', v_total, 'page', v_page, 'page_size', v_size, 'duplicate_count', 0);
  end if;

  if v_search is not null then
    v_where := v_where || format(' and (s.full_name ilike %L or s.id_number ilike %L)',
      '%'||v_search||'%', '%'||v_search||'%');
  end if;
  if v_cid    is not null then v_where := v_where || format(' and at.class_id = %L::uuid', v_cid); end if;
  if v_aid    is not null then v_where := v_where || format(' and at.assignment_id = %L::uuid', v_aid); end if;
  if v_student is not null then v_where := v_where || format(' and at.student_id = %L::uuid', v_student); end if;
  if v_date   is not null then v_where := v_where || format(' and at.attendance_date = %L::date', v_date); end if;

  v_sort_sql := case v_sort
    when 'student_name' then 's.full_name'
    when 'attendance_date' then 'at.attendance_date'
    else 'at.attendance_date'
  end;

  execute format('select count(*) from public.attendance at
    join public.app_users s on s.id = at.student_id
    where %s', v_where) into v_total;

  if v_dups = 'true' then
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (
         select d.id, d.assignment_id, d.class_id, d.student_id, d.attendance_date, d.status, d.created_at,
                s.full_name as student_name, s.id_number, c.class_name,
                (select a.title from public.class_assignments a where a.id = d.assignment_id) as assignment_title,
                true as is_duplicate, d.dup_count
         from (
           select at.*, count(*) over (partition by at.assignment_id, at.student_id, at.attendance_date) as dup_count
           from public.attendance at where %s
         ) d
         join public.app_users s on s.id = d.student_id
         join public.classes c on c.id = d.class_id
         where d.dup_count > 1
         order by d.attendance_date desc, d.student_id
         limit %s offset %s
       ) t',
      v_where, v_size, (v_page - 1) * v_size
    ) into v_rows;
    execute format(
      'select coalesce(sum(x.cnt), 0) from (
         select count(*) as cnt from public.attendance at where %s
         group by at.assignment_id, at.student_id, at.attendance_date having count(*) > 1
       ) x', v_where
    ) into v_dup_total;
  else
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (
         select at.id, at.assignment_id, at.class_id, at.student_id, at.attendance_date, at.status, at.created_at,
                s.full_name as student_name, s.id_number, c.class_name,
                (select a.title from public.class_assignments a where a.id = at.assignment_id) as assignment_title,
                false as is_duplicate, 1 as dup_count
         from public.attendance at
         join public.app_users s on s.id = at.student_id
         join public.classes c on c.id = at.class_id
         where %s
         order by %s %s, at.created_at desc
         limit %s offset %s
       ) t',
      v_where, v_sort_sql, v_dir, v_size, (v_page - 1) * v_size
    ) into v_rows;
    execute format(
      'select coalesce(sum(x.cnt), 0) from (
         select count(*) as cnt from public.attendance at where %s
         group by at.assignment_id, at.student_id, at.attendance_date having count(*) > 1
       ) x', v_where
    ) into v_dup_total;
  end if;

  return jsonb_build_object('rows', v_rows, 'total', v_total, 'page', v_page, 'page_size', v_size,
                            'duplicate_count', v_dup_total);
end $$;

-- ------------------------------------------------------------
-- FIX a record. 'absent' removes the present scan (the app's
-- model of absence); 'present' ensures the record exists.
-- ------------------------------------------------------------
create or replace function public.admin_fix_attendance(p_attendance_id uuid, p_new_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin  jsonb := public.admin_require_edit();
  v_before jsonb;
begin
  select to_jsonb(t) into v_before from (
    select id, assignment_id, class_id, student_id, attendance_date, status, created_at
    from public.attendance where id = p_attendance_id
  ) t;
  if v_before is null then raise exception 'Attendance record not found.'; end if;

  if p_new_status = 'absent' then
    delete from public.attendance where id = p_attendance_id;
  elsif p_new_status = 'present' then
    update public.attendance set status = 'present' where id = p_attendance_id;
  else
    raise exception 'p_new_status must be present or absent.';
  end if;

  perform public.admin_log_action(
    (v_admin->>'id')::uuid, 'admin_fix_attendance', 'attendance', p_attendance_id::text,
    v_before, jsonb_build_object('status', p_new_status)
  );
  return jsonb_build_object('ok', true);
end $$;

-- ------------------------------------------------------------
-- ADD a present scan (manual check-in).
-- Rejects duplicates for the same assignment/student/date.
-- ------------------------------------------------------------
create or replace function public.admin_add_attendance(
  p_class_id uuid, p_assignment_id uuid, p_student_id uuid, p_date date,
  p_status text default 'present'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin jsonb := public.admin_require_edit();
  v_id    uuid;
begin
  if not exists (select 1 from public.classes where id = p_class_id) then
    raise exception 'Class not found.';
  end if;
  if not exists (select 1 from public.app_users where id = p_student_id and role = 'student') then
    raise exception 'Student not found.';
  end if;
  if p_assignment_id is not null and not exists (select 1 from public.class_assignments where id = p_assignment_id) then
    raise exception 'Assignment not found.';
  end if;
  if not exists (select 1 from public.class_enrollments where class_id = p_class_id and student_id = p_student_id) then
    raise exception 'Student is not enrolled in this class.';
  end if;

  if exists (
    select 1 from public.attendance
    where assignment_id is not distinct from p_assignment_id
      and student_id = p_student_id and attendance_date = p_date
  ) then
    raise exception 'Duplicate scan detected: this student already has a present record for this assignment/date.';
  end if;

  insert into public.attendance (assignment_id, class_id, student_id, id_number, attendance_date, status)
  values (p_assignment_id, p_class_id, p_student_id,
          (select id_number from public.app_users where id = p_student_id), p_date, p_status)
  returning id into v_id;

  perform public.admin_log_action(
    (v_admin->>'id')::uuid, 'admin_add_attendance', 'attendance', v_id::text,
    null, jsonb_build_object('class_id', p_class_id, 'student_id', p_student_id, 'date', p_date)
  );
  return jsonb_build_object('id', v_id, 'ok', true);
end $$;