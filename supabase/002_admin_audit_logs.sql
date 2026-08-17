-- ============================================================
-- 002_admin_audit_logs.sql
-- Panthraa Admin — audit trail for every privileged action.
--
-- Run AFTER 001_admin_users.sql. Idempotent.
--
-- Rules:
--   * actor admin id always recorded
--   * before/after JSON snapshots stored (never passwords)
--   * only SECURITY DEFINER admin RPCs can write to it
-- ============================================================

create table if not exists public.admin_audit_logs (
  id           bigint generated always as identity primary key,
  admin_id     uuid not null,
  action       text not null,
  target_table text,
  target_id    text,
  before_data  jsonb,
  after_data   jsonb,
  details      jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists admin_audit_logs_created_at_idx
  on public.admin_audit_logs (created_at desc);
create index if not exists admin_audit_logs_admin_idx
  on public.admin_audit_logs (admin_id);
create index if not exists admin_audit_logs_action_idx
  on public.admin_audit_logs (action);
create index if not exists admin_audit_logs_target_idx
  on public.admin_audit_logs (target_table, target_id);

alter table public.admin_audit_logs enable row level security;

-- Internal write helper, called by every mutating admin RPC.
-- Passwords must NEVER be placed in p_before / p_after / p_details.
create or replace function public.admin_log_action(
  p_admin_id      uuid,
  p_action        text,
  p_target_table  text default null,
  p_target_id     text default null,
  p_before        jsonb default null,
  p_after         jsonb default null,
  p_details       jsonb default null
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.admin_audit_logs
    (admin_id, action, target_table, target_id, before_data, after_data, details)
  values
    (p_admin_id, p_action, p_target_table, p_target_id, p_before, p_after, p_details);
$$;

revoke all on table public.admin_audit_logs from anon, authenticated;
revoke execute on function public.admin_log_action(uuid, text, text, text, jsonb, jsonb, jsonb)
  from anon, authenticated, public;