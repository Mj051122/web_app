-- ============================================================
-- 008_admin_announcements_crud.sql
-- ANNOUNCEMENTS — full CRUD on class_announcements, authored
-- by the hidden admin system profile.
-- ASSIGNMENT COMMENTS — moderation (new in this version):
-- hide / show / delete.
--
-- Run AFTER 007. Idempotent.
-- ============================================================

-- ------------------------------------------------------------
-- LIST announcements (filtered, sorted, paginated)
-- Filters: search, author (admin|professor), target_year,
--          announcement_id
-- ------------------------------------------------------------
create or replace function public.admin_list_announcements(p_filters jsonb default '{}'::jsonb)
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
  v_author text := nullif(p_filters->>'author','');
  v_year   text := nullif(p_filters->>'target_year','');
  v_aid    text := nullif(p_filters->>'announcement_id','');
  v_sort   text := lower(coalesce(nullif(p_filters->>'sort_by',''), 'created_at'));
  v_dir    text := case when lower(coalesce(nullif(p_filters->>'sort_dir',''), 'desc')) = 'asc' then 'asc' else 'desc' end;
  v_where  text := 'true';
  v_sort_sql text;
  v_total  int;
  v_rows   jsonb;
  v_sys    uuid;
begin
  v_sys := public.admin_system_profile_id();
  if v_search is not null then
    v_where := v_where || format(' and (a.title ilike %L or a.subtitle ilike %L or a.content ilike %L)',
      '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%');
  end if;
  if v_author = 'admin' then
    v_where := v_where || format(' and (a.professor_id is null or a.professor_id = %L::uuid)', v_sys::text);
  elsif v_author = 'professor' then
    v_where := v_where || format(' and a.professor_id is not null and a.professor_id <> %L::uuid', v_sys::text);
  end if;
  if v_year is not null then
    v_where := v_where || format(' and (cardinality(a.target_years) = 0 or %L = any(a.target_years))', v_year);
  end if;
  if v_aid is not null then v_where := v_where || format(' and a.id = %L::uuid', v_aid); end if;

  v_sort_sql := case v_sort
    when 'title' then 'a.title'
    when 'created_at' then 'a.created_at'
    else 'a.created_at'
  end;

  execute format('select count(*) from public.class_announcements a where %s', v_where) into v_total;

  execute format(
    'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (
       select a.id, a.professor_id, a.target_years, a.title, a.subtitle, a.content,
              a.image_url, a.created_at, a.updated_at,
              coalesce(p.full_name, ''Panthraa Admin'') as author_name,
              (a.professor_id is null or a.professor_id = %L::uuid) as author_is_admin,
              (select count(*) from public.announcement_reads r where r.announcement_id = a.id) as read_count
       from public.class_announcements a
       left join public.app_users p on p.id = a.professor_id
       where %s
       order by %s %s, a.created_at desc
       limit %s offset %s
     ) t',
    v_sys::text, v_where, v_sort_sql, v_dir, v_size, (v_page - 1) * v_size
  ) into v_rows;

  return jsonb_build_object('rows', v_rows, 'total', v_total, 'page', v_page, 'page_size', v_size);
end $$;

-- ------------------------------------------------------------
-- CREATE announcement (authored by the admin system profile;
-- target_years accepts a JSON array or a "first,second" string)
-- ------------------------------------------------------------
create or replace function public.admin_create_announcement(p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin  jsonb := public.admin_require_edit();
  v_title  text  := nullif(p_data->>'title','');
  v_target text[];
  v_id     uuid;
begin
  if v_title is null then raise exception 'Title is required.'; end if;
  v_target := public.admin_to_text_array(p_data->'target_years');

  insert into public.class_announcements (professor_id, target_years, title, subtitle, content, image_url)
  values (
    public.admin_system_profile_id(),
    v_target,
    v_title,
    coalesce(nullif(p_data->>'subtitle',''), ''),
    coalesce(nullif(p_data->>'content',''), ''),
    nullif(p_data->>'image_url','')
  )
  returning id into v_id;

  perform public.admin_log_action(
    (v_admin->>'id')::uuid, 'admin_create_announcement', 'class_announcements', v_id::text,
    null, jsonb_build_object('title', v_title, 'target_years', to_jsonb(v_target))
  );
  return jsonb_build_object('id', v_id, 'ok', true);
end $$;

-- ------------------------------------------------------------
-- UPDATE announcement
-- ------------------------------------------------------------
create or replace function public.admin_update_announcement(p_announcement_id uuid, p_data jsonb)
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
    select id, target_years, title, subtitle, content, image_url from public.class_announcements where id = p_announcement_id
  ) t;
  if v_before is null then raise exception 'Announcement not found.'; end if;

  update public.class_announcements set
    title        = coalesce(nullif(p_data->>'title',''), title),
    subtitle     = case when p_data ? 'subtitle' then nullif(p_data->>'subtitle','') else subtitle end,
    content      = case when p_data ? 'content' then nullif(p_data->>'content','') else content end,
    image_url    = case when p_data ? 'image_url' then nullif(p_data->>'image_url','') else image_url end,
    target_years = case when p_data ? 'target_years'
                        then public.admin_to_text_array(p_data->'target_years')
                        else target_years end,
    updated_at   = now()
  where id = p_announcement_id;

  select to_jsonb(t) into v_after from (
    select id, target_years, title, subtitle, content, image_url from public.class_announcements where id = p_announcement_id
  ) t;

  perform public.admin_log_action(
    (v_admin->>'id')::uuid, 'admin_update_announcement', 'class_announcements', p_announcement_id::text, v_before, v_after
  );
  return v_after;
end $$;

-- ------------------------------------------------------------
-- DELETE announcement (also clears its read receipts)
-- ------------------------------------------------------------
create or replace function public.admin_delete_announcement(p_announcement_id uuid)
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
    select id, target_years, title, subtitle, content, image_url from public.class_announcements where id = p_announcement_id
  ) t;
  if v_before is null then raise exception 'Announcement not found.'; end if;

  delete from public.announcement_reads where announcement_id = p_announcement_id;
  delete from public.announcement_read_receipts where announcement_id = p_announcement_id;
  delete from public.class_announcements where id = p_announcement_id;

  perform public.admin_log_action(
    (v_admin->>'id')::uuid, 'admin_delete_announcement', 'class_announcements', p_announcement_id::text, v_before, null
  );
  return jsonb_build_object('ok', true);
end $$;

-- ============================================================
-- ASSIGNMENT COMMENTS (moderation)
-- ============================================================

-- ------------------------------------------------------------
-- LIST comments (filtered, sorted, paginated)
-- Filters: search (author name / id / content), assignment_id,
--          class_id, author_role (student|professor),
--          hidden (true|false|all — default visible only)
-- ------------------------------------------------------------
create or replace function public.admin_list_comments(p_filters jsonb default '{}'::jsonb)
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
  v_cid    text := nullif(p_filters->>'class_id','');
  v_role   text := nullif(p_filters->>'author_role','');
  v_hidden text := coalesce(nullif(p_filters->>'hidden',''), 'false');
  v_sort   text := lower(coalesce(nullif(p_filters->>'sort_by',''), 'created_at'));
  v_dir    text := case when lower(coalesce(nullif(p_filters->>'sort_dir',''), 'desc')) = 'asc' then 'asc' else 'desc' end;
  v_where  text := 'true';
  v_sort_sql text;
  v_total  int;
  v_rows   jsonb;
begin
  if v_search is not null then
    v_where := v_where || format(' and (u.full_name ilike %L or u.id_number ilike %L or co.content ilike %L)',
      '%'||v_search||'%', '%'||v_search||'%', '%'||v_search||'%');
  end if;
  if v_aid  is not null then v_where := v_where || format(' and co.assignment_id = %L::uuid', v_aid); end if;
  if v_cid  is not null then v_where := v_where || format(' and co.class_id = %L::uuid', v_cid); end if;
  if v_role is not null then v_where := v_where || format(' and co.author_role = %L', v_role); end if;
  if v_hidden = 'true' then
    v_where := v_where || ' and co.is_hidden';
  elsif v_hidden = 'false' then
    v_where := v_where || ' and not co.is_hidden';
  end if;

  v_sort_sql := case v_sort
    when 'author_name' then 'u.full_name'
    when 'created_at' then 'co.created_at'
    else 'co.created_at'
  end;

  execute format('select count(*) from public.assignment_comments co
    join public.app_users u on u.id = co.author_id
    where %s', v_where) into v_total;

  execute format(
    'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (
       select co.id, co.assignment_id, a.title as assignment_title, a.target_points,
              co.class_id, c.class_name,
              co.author_id, u.full_name as author_name, u.id_number as author_id_number,
              co.author_role, co.visibility, co.content, co.created_at, co.is_hidden
       from public.assignment_comments co
       join public.app_users u on u.id = co.author_id
       join public.class_assignments a on a.id = co.assignment_id
       join public.classes c on c.id = co.class_id
       where %s
       order by %s %s, co.created_at desc
       limit %s offset %s
     ) t',
    v_where, v_sort_sql, v_dir, v_size, (v_page - 1) * v_size
  ) into v_rows;

  return jsonb_build_object('rows', v_rows, 'total', v_total, 'page', v_page, 'page_size', v_size);
end $$;

-- ------------------------------------------------------------
-- HIDE / SHOW / DELETE comment
-- ------------------------------------------------------------
create or replace function public.admin_hide_comment(p_comment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin  jsonb := public.admin_require_edit();
  v_before jsonb;
begin
  select to_jsonb(t) into v_before from (select id, content, is_hidden from public.assignment_comments where id = p_comment_id) t;
  if v_before is null then raise exception 'Comment not found.'; end if;
  update public.assignment_comments set is_hidden = true where id = p_comment_id;
  perform public.admin_log_action(
    (v_admin->>'id')::uuid, 'admin_hide_comment', 'assignment_comments', p_comment_id::text,
    v_before, jsonb_build_object('is_hidden', true)
  );
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_show_comment(p_comment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin  jsonb := public.admin_require_edit();
  v_before jsonb;
begin
  select to_jsonb(t) into v_before from (select id, content, is_hidden from public.assignment_comments where id = p_comment_id) t;
  if v_before is null then raise exception 'Comment not found.'; end if;
  update public.assignment_comments set is_hidden = false where id = p_comment_id;
  perform public.admin_log_action(
    (v_admin->>'id')::uuid, 'admin_show_comment', 'assignment_comments', p_comment_id::text,
    v_before, jsonb_build_object('is_hidden', false)
  );
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_delete_comment(p_comment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin  jsonb := public.admin_require_edit();
  v_before jsonb;
begin
  select to_jsonb(t) into v_before from (select id, content, is_hidden from public.assignment_comments where id = p_comment_id) t;
  if v_before is null then raise exception 'Comment not found.'; end if;
  delete from public.assignment_comments where id = p_comment_id;
  perform public.admin_log_action(
    (v_admin->>'id')::uuid, 'admin_delete_comment', 'assignment_comments', p_comment_id::text, v_before, null
  );
  return jsonb_build_object('ok', true);
end $$;