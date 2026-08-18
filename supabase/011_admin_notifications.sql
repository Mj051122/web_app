-- ============================================================
-- 011_admin_notifications.sql
-- ADMIN NOTIFICATIONS — push a message to students, faculties,
-- or everyone. The mobile app reads these and tracks read state.
--
-- Review schema here before applying. Run AFTER 010. Idempotent.
--
-- Design notes (borrowed from school-portal / announcement
-- patterns in other web apps):
--   * audience is role-based: 'students' | 'faculties' | 'all'
--     (no individual targeting yet — keeps the app side simple)
--   * notification_reads is a per-user read tracker so the app
--     can show unread counts without deleting history
--   * admin writes go through SECURITY DEFINER RPCs + audit log,
--     exactly like every other admin action in this project
-- ============================================================

-- ------------------------------------------------------------
-- 1. TABLES
-- ------------------------------------------------------------
create table if not exists public.admin_notifications (
  id         bigint generated always as identity primary key,
  admin_id   uuid    not null references public.admin_users(id) on delete cascade,
  audience   text    not null check (audience in ('students', 'faculties', 'all')),
  title      text    not null,
  message    text    not null default '',
  created_at timestamptz not null default now()
);

create index if not exists admin_notifications_audience_idx
  on public.admin_notifications (audience);
create index if not exists admin_notifications_created_idx
  on public.admin_notifications (created_at desc);

create table if not exists public.notification_reads (
  user_id         uuid   not null references public.app_users(id) on delete cascade,
  notification_id bigint not null references public.admin_notifications(id) on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (user_id, notification_id)
);

create index if not exists notification_reads_user_idx
  on public.notification_reads (user_id);

-- ------------------------------------------------------------
-- 2. ROW LEVEL SECURITY
-- ------------------------------------------------------------
-- Admin tables stay locked: the web panel only ever touches
-- them through the SECURITY DEFINER RPCs below.
alter table public.admin_notifications enable row level security;
alter table public.notification_reads enable row level security;

-- The mobile app may only see notifications aimed at its
-- audience (role comes from the logged-in app user).
create policy "app users read their audience"
on public.admin_notifications for select
to authenticated
using (
  audience = 'all'
  or (audience = 'students' and exists (
      select 1 from public.app_users u
      where u.id = auth.uid() and u.role = 'student'))
  or (audience = 'faculties' and exists (
      select 1 from public.app_users u
      where u.id = auth.uid() and u.role = 'professor'))
);

-- Each user marks their own notifications as read (upsert).
create policy "users manage their own read marks"
on public.notification_reads for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- ------------------------------------------------------------
-- 3. SEND notification (admin, audit-logged)
-- ------------------------------------------------------------
create or replace function public.admin_send_notification(p_data jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin   jsonb := public.admin_require_edit();
  v_title   text  := btrim(nullif(p_data->>'title',''));
  v_message text  := btrim(nullif(p_data->>'message',''));
  v_aud     text  := coalesce(nullif(p_data->>'audience',''), 'all');
  v_id      bigint;
begin
  if v_title is null or v_title = '' then
    raise exception 'Title is required.';
  end if;
  if v_aud not in ('students', 'faculties', 'all') then
    raise exception 'Audience must be students, faculties or all.';
  end if;

  insert into public.admin_notifications (admin_id, audience, title, message)
  values ((v_admin->>'id')::uuid, v_aud, v_title, v_message)
  returning id into v_id;

  perform public.admin_log_action(
    (v_admin->>'id')::uuid, 'admin_send_notification', 'admin_notifications', v_id::text,
    null, jsonb_build_object('audience', v_aud, 'title', v_title)
  );

  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- ------------------------------------------------------------
-- 4. LIST notifications (admin panel)
-- Filters: search (title/message), audience
-- Includes read/recipient counts so the panel can show
-- "3 of 120 read" per notification.
-- ------------------------------------------------------------
create or replace function public.admin_list_notifications(p_filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin  jsonb := public.admin_require_auth();
  v_page   int   := greatest(coalesce(nullif(p_filters->>'page','')::int, 1), 1);
  v_size   int   := greatest(least(coalesce(nullif(p_filters->>'page_size','')::int, 25), 200), 1);
  v_search text  := nullif(p_filters->>'search','');
  v_aud    text  := nullif(p_filters->>'audience','');
  v_where  text  := 'true';
  v_total  int;
  v_rows   jsonb;
begin
  if v_search is not null then
    v_where := v_where || format(' and (n.title ilike %L or n.message ilike %L)',
      '%'||v_search||'%', '%'||v_search||'%');
  end if;
  if v_aud is not null then
    v_where := v_where || format(' and n.audience = %L', v_aud);
  end if;

  execute format('select count(*) from public.admin_notifications n where %s', v_where)
    into v_total;

  execute format(
    'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (
       select n.id, n.audience, n.title, n.message, n.created_at,
              coalesce(au.full_name, au.email) as sent_by,
              (select count(*) from public.notification_reads r
                where r.notification_id = n.id) as read_count,
              (case n.audience
                 when ''students''  then (select count(*) from public.app_users where role = ''student'')
                 when ''faculties'' then (select count(*) from public.app_users where role = ''professor'')
                 else (select count(*) from public.app_users)
               end) as recipient_count
       from public.admin_notifications n
       left join public.admin_users au on au.id = n.admin_id
       where %s
       order by n.created_at desc, n.id desc
       limit %s offset %s
     ) t',
    v_where, v_size, (v_page - 1) * v_size
  ) into v_rows;

  return jsonb_build_object('rows', v_rows, 'total', v_total, 'page', v_page, 'page_size', v_size);
end $$;

-- ------------------------------------------------------------
-- 5. GRANTS — exactly the same posture as 010: only
--    authenticated callers, nothing exposed to anon/public.
-- ------------------------------------------------------------
grant execute on function public.admin_send_notification(jsonb) to authenticated;
grant execute on function public.admin_list_notifications(jsonb) to authenticated;
