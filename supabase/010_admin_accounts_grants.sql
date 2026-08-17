-- ============================================================
-- 010_admin_accounts_grants.sql
-- ADMIN ACCOUNTS management (super_admin gated) + the FINAL
-- grant block for every admin RPC.
--
-- Run LAST. Idempotent.
-- ============================================================

-- ------------------------------------------------------------
-- GET current admin + super-admin flag
-- ------------------------------------------------------------
create or replace function public.admin_get_me()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin jsonb := public.admin_require_auth();
begin
  return jsonb_build_object(
    'admin', v_admin,
    'is_super_admin', (v_admin->>'role') = 'super_admin'
  );
end $$;

-- ------------------------------------------------------------
-- LIST admin accounts (super_admin only)
-- Filters: search, admin_id, status (active|disabled),
--          can_edit (true|false)
-- ------------------------------------------------------------
create or replace function public.admin_list_admin_users(p_filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin  jsonb := public.admin_require_role(array['super_admin']);
  v_page   int  := greatest(coalesce(nullif(p_filters->>'page','')::int, 1), 1);
  v_size   int  := greatest(least(coalesce(nullif(p_filters->>'page_size','')::int, 50), 200), 1);
  v_search text := nullif(p_filters->>'search','');
  v_aid    text := nullif(p_filters->>'admin_id','');
  v_status text := nullif(p_filters->>'status','');
  v_edit   text := nullif(p_filters->>'can_edit','');
  v_where  text := 'true';
  v_total  int;
  v_rows   jsonb;
begin
  if v_search is not null then
    v_where := v_where || format(' and (email ilike %L or full_name ilike %L)', '%'||v_search||'%', '%'||v_search||'%');
  end if;
  if v_aid is not null then v_where := v_where || format(' and id = %L::uuid', v_aid); end if;
  if v_status = 'disabled' then
    v_where := v_where || ' and not is_active';
  elsif v_status = 'active' then
    v_where := v_where || ' and is_active';
  end if;
  if v_edit = 'true' then
    v_where := v_where || ' and can_edit';
  elsif v_edit = 'false' then
    v_where := v_where || ' and not can_edit';
  end if;

  execute format('select count(*) from public.admin_users where %s', v_where) into v_total;
  execute format(
    'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (
       select id, email, full_name, role, is_active, can_edit, created_at
       from public.admin_users where %s
       order by created_at
       limit %s offset %s
     ) t',
    v_where, v_size, (v_page - 1) * v_size
  ) into v_rows;

  return jsonb_build_object('rows', v_rows, 'total', v_total, 'page', v_page, 'page_size', v_size);
end $$;

-- ------------------------------------------------------------
-- INVITE a new admin (super_admin only).
-- Creates the Supabase Auth user (email confirmed, random temp
-- password) + the admin_users profile: active + READ-ONLY.
-- NOTE: raw_user_meta_data deliberately does NOT carry the
-- admin_signup flag — that flag is for self-service sign-ups
-- and would make the trigger insert a conflicting row here.
-- The invitee uses "Forgot password" to set their own password.
-- ------------------------------------------------------------
create or replace function public.admin_invite_admin(p_email text, p_full_name text, p_role text default 'admin')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin  jsonb := public.admin_require_edit_role(array['super_admin']);
  v_uid    uuid;
begin
  if p_email is null or not (p_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'A valid email is required.';
  end if;
  if p_role not in ('admin','super_admin') then
    raise exception 'Role must be admin or super_admin.';
  end if;
  if exists (select 1 from public.admin_users where lower(email) = lower(p_email)) then
    raise exception 'An admin with this email already exists.';
  end if;

  v_uid := gen_random_uuid();

  begin
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token
    ) values (
      '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
      lower(p_email), crypt(encode(gen_random_bytes(16), 'hex'), gen_salt('bf')), now(),
      jsonb_build_object('provider', 'email', 'providers', array['email']),
      jsonb_build_object('full_name', coalesce(p_full_name, '')),
      now(), now(), ''
    );
  exception when unique_violation then
    raise exception 'A Supabase Auth user with this email already exists.';
  end;

  insert into public.admin_users (id, email, full_name, role, is_active, can_edit)
  values (v_uid, lower(p_email), coalesce(p_full_name, ''), p_role, true, false);

  perform public.admin_log_action(
    (v_admin->>'id')::uuid, 'admin_invite_admin', 'admin_users', v_uid::text,
    null, jsonb_build_object('email', p_email, 'role', p_role)
  );
  return jsonb_build_object('id', v_uid, 'ok', true);
end $$;

-- ------------------------------------------------------------
-- UPDATE an admin's profile/role/status/edit access.
-- Self-edits are limited to toggling can_edit (the recovery
-- path for a read-only super admin).
-- ------------------------------------------------------------
create or replace function public.admin_update_admin(p_admin_id uuid, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin  jsonb := public.admin_require_edit_role(array['super_admin']);
  v_before jsonb;
  v_after  jsonb;
begin
  if p_admin_id = (v_admin->>'id')::uuid then
    if not (p_data ? 'can_edit') then
      raise exception 'You cannot modify your own admin account here.';
    end if;
  end if;

  select to_jsonb(t) into v_before from (
    select id, email, full_name, role, is_active, can_edit from public.admin_users where id = p_admin_id
  ) t;
  if v_before is null then raise exception 'Admin not found.'; end if;

  if p_data ? 'role' and nullif(p_data->>'role','') is not null
     and (p_data->>'role') not in ('admin','super_admin') then
    raise exception 'Role must be admin or super_admin.';
  end if;
  if p_data ? 'can_edit' and nullif(p_data->>'can_edit','') is not null
     and (p_data->>'can_edit') not in ('true','false') then
    raise exception 'can_edit must be true or false.';
  end if;

  update public.admin_users set
    full_name = case when p_data ? 'full_name' then coalesce(nullif(p_data->>'full_name',''), full_name) else full_name end,
    role      = case when p_data ? 'role' and nullif(p_data->>'role','') is not null then p_data->>'role' else role end,
    is_active = case when p_data ? 'is_active' then (p_data->>'is_active')::boolean else is_active end,
    can_edit  = case when p_data ? 'can_edit' and nullif(p_data->>'can_edit','') is not null
                     then (p_data->>'can_edit')::boolean else can_edit end
  where id = p_admin_id;

  select to_jsonb(t) into v_after from (
    select id, email, full_name, role, is_active, can_edit from public.admin_users where id = p_admin_id
  ) t;

  perform public.admin_log_action(
    (v_admin->>'id')::uuid, 'admin_update_admin', 'admin_users', p_admin_id::text, v_before, v_after
  );
  return v_after;
end $$;

-- ------------------------------------------------------------
-- RESET another admin's password (super_admin only)
-- ------------------------------------------------------------
create or replace function public.admin_reset_admin_password(p_admin_id uuid, p_new_password text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin jsonb := public.admin_require_edit_role(array['super_admin']);
begin
  if p_new_password is null or length(p_new_password) < 8 then
    raise exception 'Password must be at least 8 characters.';
  end if;
  if p_admin_id = (v_admin->>'id')::uuid then
    raise exception 'Use "change my password" for your own account.';
  end if;
  if not exists (select 1 from public.admin_users where id = p_admin_id) then
    raise exception 'Admin not found.';
  end if;

  update auth.users set encrypted_password = crypt(p_new_password, gen_salt('bf'))
  where id = p_admin_id;

  perform public.admin_log_action(
    (v_admin->>'id')::uuid, 'admin_reset_admin_password', 'admin_users', p_admin_id::text,
    null, null, jsonb_build_object('password_reset', true)
  );
  return jsonb_build_object('ok', true);
end $$;

-- ------------------------------------------------------------
-- Log a client-side event (e.g. password/email changes handled
-- by Supabase Auth directly) under the current admin's id.
-- ------------------------------------------------------------
create or replace function public.admin_log_self_action(p_action text, p_target_table text default null, p_target_id text default null, p_details jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin jsonb := public.admin_require_auth();
begin
  perform public.admin_log_action(
    (v_admin->>'id')::uuid, p_action, p_target_table, p_target_id, null, null, p_details
  );
  return jsonb_build_object('ok', true);
end $$;

-- ============================================================
-- FINAL GRANTS — the admin web app (anon key + Auth session)
-- can ONLY call these RPCs, never touch tables.
-- ============================================================
revoke execute on function public.admin_require_auth() from anon, authenticated, public;
revoke execute on function public.admin_require_role(text[]) from anon, authenticated, public;
revoke execute on function public.admin_require_edit() from anon, authenticated, public;
revoke execute on function public.admin_require_edit_role(text[]) from anon, authenticated, public;
revoke execute on function public.admin_system_profile_id() from anon, authenticated, public;
revoke execute on function public.admin_to_text_array(jsonb) from anon, authenticated, public;
revoke execute on function public.handle_admin_signup() from anon, authenticated, public;

grant execute on function
  -- users
  public.admin_list_users(jsonb),
  public.admin_get_user(uuid),
  public.admin_create_user(jsonb),
  public.admin_update_user(uuid, jsonb),
  public.admin_block_user(uuid),
  public.admin_unblock_user(uuid),
  public.admin_reset_user_password(uuid, text),
  public.admin_delete_user(uuid, boolean),
  -- classes
  public.admin_list_classes(jsonb),
  public.admin_create_class(jsonb),
  public.admin_archive_class(uuid),
  public.admin_unarchive_class(uuid),
  public.admin_update_class(uuid, jsonb),
  public.admin_delete_class(uuid, boolean),
  public.admin_enroll_student(uuid, uuid),
  public.admin_remove_student(uuid, uuid),
  public.admin_list_join_requests(jsonb),
  public.admin_decide_join_request(uuid, text),
  -- assignments & submissions
  public.admin_list_assignments(jsonb),
  public.admin_create_assignment(jsonb),
  public.admin_update_assignment(uuid, jsonb),
  public.admin_delete_assignment(uuid, boolean),
  public.admin_list_submissions(jsonb),
  public.admin_set_score(uuid, numeric),
  public.admin_list_ungraded(jsonb),
  -- attendance
  public.admin_list_attendance(jsonb),
  public.admin_fix_attendance(uuid, text),
  public.admin_add_attendance(uuid, uuid, uuid, date, text),
  -- announcements & comments
  public.admin_list_announcements(jsonb),
  public.admin_create_announcement(jsonb),
  public.admin_update_announcement(uuid, jsonb),
  public.admin_delete_announcement(uuid),
  public.admin_list_comments(jsonb),
  public.admin_hide_comment(uuid),
  public.admin_show_comment(uuid),
  public.admin_delete_comment(uuid),
  -- overview / audit / storage
  public.admin_get_overview(jsonb),
  public.admin_list_audit_logs(jsonb),
  public.admin_list_storage_orphans(text, jsonb),
  public.admin_delete_storage_file(text, text),
  -- admin accounts
  public.admin_get_me(),
  public.admin_list_admin_users(jsonb),
  public.admin_invite_admin(text, text, text),
  public.admin_update_admin(uuid, jsonb),
  public.admin_reset_admin_password(uuid, text),
  public.admin_log_self_action(text, text, text, jsonb)
to authenticated;

-- Sanity: nothing on the app tables is granted to anon or
-- authenticated by this migration. The app's own RLS policies
-- continue to govern mobile access exactly as before.