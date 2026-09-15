-- Taiwan → Japan AI Representation Benchmark 2026 — full database schema.
-- Idempotent: safe to run repeatedly against the same project.
-- Apply with:
--   supabase db query --linked --project-ref pjqejaxfxjtcujfamyem -f supabase/schema.sql
--
-- Security posture: the browser only ever holds the anon key. Every read the
-- public site does goes through an owner-run view or a security-definer RPC;
-- every write goes through a security-definer RPC that re-checks the phase and
-- the caller. Phase 1 (nominate) never exposes endorsement counts or scores.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.admins (
  email text primary key
);

insert into public.admins (email) values ('ray860408@gmail.com')
on conflict (email) do nothing;

create table if not exists public.settings (
  id int primary key check (id = 1),
  phase text not null default 'nominate'
    check (phase in ('pre', 'nominate', 'vote', 'closed', 'results')),
  nominate_close timestamptz,
  vote_close timestamptz,
  people_offset int default 0,
  companies_offset int default 0
);

-- v2 settings columns (editorial rebuild).
alter table public.settings add column if not exists nominate_open timestamptz;
alter table public.settings add column if not exists vote_open timestamptz;
alter table public.settings add column if not exists results_label text
  not null default '10 月 14–15 日';
alter table public.settings add column if not exists iqlite_url text
  not null default '';
alter table public.settings add column if not exists ximu_url text
  not null default '';
alter table public.settings add column if not exists partners_text text
  not null default 'Partner announcement coming soon';
alter table public.settings add column if not exists contact_email text
  not null default '';

-- v2.1: auto phase switching. 'auto' derives the live phase from the campaign
-- dates via effective_phase(); 'manual' falls back to the phase radio in
-- /admin (except 'results', which always wins regardless of mode).
alter table public.settings add column if not exists phase_mode text
  not null default 'auto' check (phase_mode in ('auto', 'manual'));

-- Widen the phase check to also allow 'pre' and 'closed' (manual mode may set
-- them). Re-running this is a no-op: the constraint is dropped and re-added
-- with the same definition.
alter table public.settings drop constraint if exists settings_phase_check;
alter table public.settings add constraint settings_phase_check
  check (phase in ('pre', 'nominate', 'vote', 'closed', 'results'));

insert into public.settings (id, phase, nominate_close, vote_close)
values (1, 'nominate', now() + interval '14 days', now() + interval '28 days')
on conflict (id) do nothing;

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  company text not null,
  company_key text generated always as (lower(btrim(company))) stored,
  reason text not null,
  user_id uuid not null references auth.users (id),
  email text not null,
  up int default 0,
  down int default 0,
  adjust int default 0,
  hidden boolean default false,
  flagged int default 0,
  created_at timestamptz default now()
);

-- v2 post columns: the nomination form now asks for the English name and the
-- official URL as well.
alter table public.posts add column if not exists company_en text
  not null default '';
alter table public.posts add column if not exists url text
  not null default '';

-- Reason length: RPC enforces 10–50 (2026-09-15; was 60–200). The table check stays
-- a loose 10–200 bound so rows written under the old rule remain valid. NOT VALID so the
-- statement stays a no-op-safe rewrite on a table that already holds rows.
alter table public.posts drop constraint if exists posts_reason_check;
alter table public.posts add constraint posts_reason_check
  check (char_length(reason) between 10 and 200) not valid;

create index if not exists posts_company_key_idx on public.posts (company_key);
create index if not exists posts_user_id_idx on public.posts (user_id);
create index if not exists posts_created_at_idx on public.posts (created_at desc);

create table if not exists public.votes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null,
  dir smallint not null check (dir in (-1, 1)),
  created_at timestamptz default now(),
  primary key (post_id, user_id)
);

create index if not exists votes_user_id_idx on public.votes (user_id);

create table if not exists public.reports (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz default now(),
  primary key (post_id, user_id)
);

create table if not exists public.finalists (
  id uuid primary key default gen_random_uuid(),
  company text not null,
  blurb text default '',
  top_reason text default '',
  sort int default 0,
  adjust int default 0,
  votes int default 0
);

-- v2 finalist columns: the Phase 2 company cards.
alter table public.finalists add column if not exists name_en text
  not null default '';
alter table public.finalists add column if not exists one_liner text
  not null default '';
alter table public.finalists add column if not exists industry text
  not null default '';
alter table public.finalists add column if not exists jp_info text
  not null default '';
alter table public.finalists add column if not exists url text
  not null default '';
alter table public.finalists add column if not exists report_url text
  not null default '';

create table if not exists public.final_votes (
  finalist_id uuid not null references public.finalists (id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz default now(),
  primary key (finalist_id, user_id)
);

create index if not exists final_votes_user_id_idx on public.final_votes (user_id);

-- v3: participant identity (no public OTP). The owner has no SMTP provider
-- and Supabase's built-in mailer only allows ~2 emails/hour, so public OTP
-- verification is not viable. Instead the browser gets one anonymous
-- Supabase session (kept in the session cookie) and the participant's email
-- is a plain, UNVERIFIED form field used only as the de-duplication key.
-- `participants` is the durable record of every email that has been used.
create table if not exists public.participants (
  email_key text primary key,
  email text not null,
  first_user_id uuid,
  created_at timestamptz default now()
);

-- votes / reports / final_votes move from being keyed by user_id (one
-- anonymous session) to being keyed by email_key (one person), so "one
-- person, one vote" survives a cleared cookie as long as the same email is
-- reused. user_id is kept as an informational audit column only.
alter table public.votes add column if not exists email_key text;
update public.votes v set email_key = lower(btrim(p.email))
  from public.posts p
  where v.post_id = p.id and v.email_key is null;
-- Production is empty; any row that still can't be backfilled is dropped so
-- the NOT NULL / new primary key below can always be applied idempotently.
delete from public.votes where email_key is null;
alter table public.votes alter column email_key set not null;
alter table public.votes drop constraint if exists votes_pkey;
alter table public.votes add constraint votes_pkey primary key (post_id, email_key);
create index if not exists votes_email_key_idx on public.votes (email_key);

alter table public.reports add column if not exists email_key text;
update public.reports r set email_key = lower(btrim(p.email))
  from public.posts p
  where r.post_id = p.id and r.email_key is null;
delete from public.reports where email_key is null;
alter table public.reports alter column email_key set not null;
alter table public.reports drop constraint if exists reports_pkey;
alter table public.reports add constraint reports_pkey primary key (post_id, email_key);
create index if not exists reports_email_key_idx on public.reports (email_key);

alter table public.final_votes add column if not exists email_key text;
-- final_votes carries no email of its own to backfill from; empty in prod.
delete from public.final_votes where email_key is null;
alter table public.final_votes alter column email_key set not null;
alter table public.final_votes drop constraint if exists final_votes_pkey;
alter table public.final_votes add constraint final_votes_pkey
  primary key (finalist_id, email_key);
create index if not exists final_votes_email_key_idx on public.final_votes (email_key);

-- DB-side rate limiting (no CAPTCHA, no SMTP to lean on): every write RPC
-- logs one row here and checks recent counts before proceeding.
create table if not exists public.write_events (
  id bigserial primary key,
  kind text not null,
  email_key text,
  user_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists write_events_email_key_idx
  on public.write_events (email_key, created_at);
create index if not exists write_events_user_id_idx
  on public.write_events (user_id, created_at);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins where email = auth.jwt() ->> 'email'
  );
$$;

-- Single source of truth for "what phase is it right now". In auto mode the
-- phase is derived purely from the campaign dates; in manual mode the admin's
-- phase radio wins outright. 'results' always wins regardless of mode -
-- results are only ever announced by hand.
create or replace function public.effective_phase()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when s.phase_mode = 'manual' then s.phase
    when s.phase = 'results' then 'results'
    when now() < s.nominate_open then 'pre'
    when now() <= s.nominate_close then 'nominate'
    when s.vote_open is not null and now() >= s.vote_open and now() <= s.vote_close
      then 'vote'
    else 'closed'
  end
  from public.settings s
  where s.id = 1;
$$;

-- Simple count-based rate limiting: at most 30 writes per email per hour,
-- and (for vote-shaped writes) at most 60 per anonymous session per hour.
-- Called by every write RPC before it does anything else; logs the attempt
-- as a side effect so the next call sees it.
create or replace function public.check_rate_limit(
  p_kind text,
  p_email_key text,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email_count int;
  v_vote_count int;
begin
  if p_email_key is not null then
    select count(*) into v_email_count
    from public.write_events
    where email_key = p_email_key and created_at > now() - interval '1 hour';
    if v_email_count >= 30 then
      raise exception '操作過於頻繁，請稍後再試。';
    end if;
  end if;

  if p_kind in ('vote', 'final_vote') and p_user_id is not null then
    select count(*) into v_vote_count
    from public.write_events
    where user_id = p_user_id
      and kind in ('vote', 'final_vote')
      and created_at > now() - interval '1 hour';
    if v_vote_count >= 60 then
      raise exception '操作過於頻繁，請稍後再試。';
    end if;
  end if;

  insert into public.write_events (kind, email_key, user_id)
  values (p_kind, p_email_key, p_user_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Vote-count triggers
-- ---------------------------------------------------------------------------

create or replace function public.tg_votes_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set
      up = up + (case when new.dir = 1 then 1 else 0 end),
      down = down + (case when new.dir = -1 then 1 else 0 end)
    where id = new.post_id;
  elsif tg_op = 'UPDATE' then
    update public.posts set
      up = up + (case when new.dir = 1 then 1 else 0 end)
              - (case when old.dir = 1 then 1 else 0 end),
      down = down + (case when new.dir = -1 then 1 else 0 end)
                  - (case when old.dir = -1 then 1 else 0 end)
    where id = new.post_id;
  else
    update public.posts set
      up = up - (case when old.dir = 1 then 1 else 0 end),
      down = down - (case when old.dir = -1 then 1 else 0 end)
    where id = old.post_id;
  end if;
  return null;
end;
$$;

drop trigger if exists votes_sync on public.votes;
create trigger votes_sync
after insert or update or delete on public.votes
for each row execute function public.tg_votes_sync();

create or replace function public.tg_reports_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.posts set flagged = flagged + 1 where id = new.post_id;
  return null;
end;
$$;

drop trigger if exists reports_sync on public.reports;
create trigger reports_sync
after insert on public.reports
for each row execute function public.tg_reports_sync();

create or replace function public.tg_final_votes_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.finalists set votes = votes + 1 where id = new.finalist_id;
  else
    update public.finalists set votes = votes - 1 where id = old.finalist_id;
  end if;
  return null;
end;
$$;

drop trigger if exists final_votes_sync on public.final_votes;
create trigger final_votes_sync
after insert or delete on public.final_votes
for each row execute function public.tg_final_votes_sync();

-- ---------------------------------------------------------------------------
-- Public views (owner-run, so they bypass RLS on the base tables on purpose)
--
-- posts_public carries NO score and NO endorsement counts: the campaign
-- governance rule is that Phase 1 never publishes live rankings or per-name
-- vote counts. The viewer's own endorsement state comes from my_state().
-- ---------------------------------------------------------------------------

drop view if exists public.posts_public;
create view public.posts_public
with (security_invoker = false) as
select
  p.id,
  p.company,
  p.company_en,
  p.url,
  p.reason,
  left(split_part(p.email, '@', 1), 1) || '***@' || split_part(p.email, '@', 2)
    as masked_email,
  p.created_at
from public.posts p
where p.hidden = false;

-- finalists_public exposes vote counts only once the effective phase is
-- 'results'.
drop view if exists public.finalists_public;
create view public.finalists_public
with (security_invoker = false) as
select
  f.id,
  f.company,
  f.name_en,
  f.one_liner,
  f.industry,
  f.jp_info,
  f.url,
  f.report_url,
  f.blurb,
  f.top_reason,
  f.sort,
  case when public.effective_phase() = 'results'
    then f.votes + f.adjust else null end as votes
from public.finalists f;

grant select on public.posts_public to anon, authenticated;
grant select on public.finalists_public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.admins enable row level security;
alter table public.settings enable row level security;
alter table public.posts enable row level security;
alter table public.votes enable row level security;
alter table public.reports enable row level security;
alter table public.finalists enable row level security;
alter table public.final_votes enable row level security;
alter table public.participants enable row level security;
alter table public.write_events enable row level security;

-- admins: no policy at all -> nobody can read it through PostgREST.

drop policy if exists participants_admin_read on public.participants;
create policy participants_admin_read on public.participants
for select to authenticated using (public.is_admin());

-- write_events: no policy at all -> nobody can read or write it through
-- PostgREST. Only check_rate_limit() (security definer) touches it.

drop policy if exists settings_read on public.settings;
create policy settings_read on public.settings
for select to anon, authenticated using (true);

drop policy if exists settings_admin_update on public.settings;
create policy settings_admin_update on public.settings
for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists posts_admin_all on public.posts;
create policy posts_admin_all on public.posts
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists votes_own_read on public.votes;
create policy votes_own_read on public.votes
for select to authenticated using (user_id = auth.uid());

drop policy if exists reports_own_read on public.reports;
create policy reports_own_read on public.reports
for select to authenticated using (user_id = auth.uid());

drop policy if exists final_votes_own_read on public.final_votes;
create policy final_votes_own_read on public.final_votes
for select to authenticated using (user_id = auth.uid());

-- Base finalists table is admin-only; the public reads finalists_public.
drop policy if exists finalists_read on public.finalists;
create policy finalists_read on public.finalists
for select to authenticated using (public.is_admin());

drop policy if exists finalists_admin_write on public.finalists;
create policy finalists_admin_write on public.finalists
for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Base-table grants. Supabase hands anon/authenticated ALL on new public
-- tables by default, so start from zero and hand back only what is needed.
revoke all on public.admins from anon, authenticated;
revoke all on public.settings from anon, authenticated;
revoke all on public.posts from anon, authenticated;
revoke all on public.votes from anon, authenticated;
revoke all on public.reports from anon, authenticated;
revoke all on public.finalists from anon, authenticated;
revoke all on public.final_votes from anon, authenticated;
revoke all on public.participants from anon, authenticated;
revoke all on public.write_events from anon, authenticated;

grant select on public.settings to anon, authenticated;
grant update on public.settings to authenticated;
grant select, update, delete on public.posts to authenticated;
grant select on public.votes to authenticated;
grant select on public.reports to authenticated;
grant select, insert, update, delete on public.finalists to authenticated;
grant select on public.final_votes to authenticated;
grant select on public.participants to authenticated;
-- write_events gets no grants at all: only check_rate_limit() touches it.

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- The v1 three-field nomination is gone; v2 took the English name and URL
-- too; v3 drops the JWT email (no OTP any more) for an explicit p_email.
drop function if exists public.nominate(text, text);
drop function if exists public.nominate(text, text, text, text);

create or replace function public.nominate(
  p_company text,
  p_company_en text,
  p_url text,
  p_reason text,
  p_email text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_phase text;
  v_company text := btrim(coalesce(p_company, ''));
  v_company_en text := btrim(coalesce(p_company_en, ''));
  v_url text := btrim(coalesce(p_url, ''));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_email text := btrim(coalesce(p_email, ''));
  v_email_key text;
  v_key text;
  v_others int;
  v_id uuid;
begin
  if v_uid is null then
    raise exception '請重新整理頁面再試一次。';
  end if;

  v_phase := public.effective_phase();
  if v_phase is distinct from 'nominate' then
    raise exception '提名期間已結束。';
  end if;

  if v_company = '' then
    raise exception '請填寫公司中文名稱。';
  end if;
  if char_length(v_company) > 40 then
    raise exception '公司中文名稱過長。';
  end if;
  if char_length(v_company_en) > 80 then
    raise exception '公司英文名稱過長。';
  end if;
  if v_url !~* '^https?://' then
    raise exception '官方網址請以 http:// 或 https:// 開頭。';
  end if;
  if char_length(v_url) > 300 then
    raise exception '官方網址過長。';
  end if;
  if char_length(v_reason) < 10 or char_length(v_reason) > 50 then
    raise exception '理由請寫 10 到 50 字';
  end if;
  if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception '請確認 Email 格式。';
  end if;

  v_email_key := lower(v_email);
  v_key := lower(v_company);

  perform public.check_rate_limit('nominate', v_email_key, v_uid);

  insert into public.participants (email_key, email, first_user_id)
  values (v_email_key, v_email, v_uid)
  on conflict (email_key) do update set email = excluded.email;

  -- The 3-distinct-companies cap is per email, not per anonymous session.
  select count(distinct company_key) into v_others
  from public.posts
  where lower(btrim(email)) = v_email_key and company_key <> v_key;

  if v_others >= 3 then
    raise exception '每人最多提名三家公司。';
  end if;

  insert into public.posts (company, company_en, url, reason, user_id, email)
  values (v_company, v_company_en, v_url, v_reason, v_uid, v_email)
  returning id into v_id;

  insert into public.votes (post_id, user_id, email_key, dir)
  values (v_id, v_uid, v_email_key, 1)
  on conflict (post_id, email_key) do nothing;

  return v_id;
end;
$$;

-- Endorse / doubt. Returns the CALLER'S OWN state only (-1, 0, 1); the public
-- never learns the aggregate. Keyed by email (v3, no OTP) — user_id is kept
-- for audit purposes only.
drop function if exists public.cast_vote(uuid, smallint);

create or replace function public.cast_vote(p_post uuid, p_dir smallint, p_email text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_phase text;
  v_email text := btrim(coalesce(p_email, ''));
  v_email_key text;
  v_prev smallint;
  v_mine int := 0;
begin
  if v_uid is null then
    raise exception '請重新整理頁面再試一次。';
  end if;
  if p_dir is null or p_dir not in (-1, 1) then
    raise exception '這個動作無法完成。';
  end if;
  if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception '請確認 Email 格式。';
  end if;

  v_phase := public.effective_phase();
  if v_phase is distinct from 'nominate' then
    raise exception '提名期間已結束。';
  end if;

  if not exists (select 1 from public.posts where id = p_post and hidden = false) then
    raise exception '這則提名已不存在。';
  end if;

  v_email_key := lower(v_email);

  perform public.check_rate_limit('vote', v_email_key, v_uid);

  insert into public.participants (email_key, email, first_user_id)
  values (v_email_key, v_email, v_uid)
  on conflict (email_key) do update set email = excluded.email;

  select dir into v_prev from public.votes
  where post_id = p_post and email_key = v_email_key;

  if v_prev is null then
    insert into public.votes (post_id, user_id, email_key, dir)
    values (p_post, v_uid, v_email_key, p_dir);
    v_mine := p_dir;
  elsif v_prev = p_dir then
    delete from public.votes where post_id = p_post and email_key = v_email_key;
    v_mine := 0;
  else
    update public.votes set dir = p_dir, user_id = v_uid
    where post_id = p_post and email_key = v_email_key;
    v_mine := p_dir;
  end if;

  return v_mine;
end;
$$;

drop function if exists public.report_post(uuid);

create or replace function public.report_post(p_post uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := btrim(coalesce(p_email, ''));
  v_email_key text;
begin
  if v_uid is null then
    raise exception '請重新整理頁面再試一次。';
  end if;
  if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception '請確認 Email 格式。';
  end if;
  if not exists (select 1 from public.posts where id = p_post) then
    raise exception '這則提名已不存在。';
  end if;

  v_email_key := lower(v_email);
  perform public.check_rate_limit('report', v_email_key, v_uid);

  insert into public.participants (email_key, email, first_user_id)
  values (v_email_key, v_email, v_uid)
  on conflict (email_key) do update set email = excluded.email;

  insert into public.reports (post_id, user_id, email_key)
  values (p_post, v_uid, v_email_key)
  on conflict (post_id, email_key) do nothing;
end;
$$;

drop function if exists public.cast_final_vote(uuid);

create or replace function public.cast_final_vote(p_finalist uuid, p_email text)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_phase text;
  v_email text := btrim(coalesce(p_email, ''));
  v_email_key text;
  v_used int;
  v_picks uuid[];
begin
  if v_uid is null then
    raise exception '請重新整理頁面再試一次。';
  end if;
  if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception '請確認 Email 格式。';
  end if;

  v_phase := public.effective_phase();
  if v_phase is distinct from 'vote' then
    raise exception '現在不是投票期間。';
  end if;

  if not exists (select 1 from public.finalists where id = p_finalist) then
    raise exception '這家公司不在名單上。';
  end if;

  v_email_key := lower(v_email);
  perform public.check_rate_limit('final_vote', v_email_key, v_uid);

  insert into public.participants (email_key, email, first_user_id)
  values (v_email_key, v_email, v_uid)
  on conflict (email_key) do update set email = excluded.email;

  if exists (
    select 1 from public.final_votes
    where finalist_id = p_finalist and email_key = v_email_key
  ) then
    delete from public.final_votes
    where finalist_id = p_finalist and email_key = v_email_key;
  else
    select count(*) into v_used from public.final_votes where email_key = v_email_key;
    if v_used >= 3 then
      raise exception '每個 Email 最多投三家，請先取消一家。';
    end if;
    insert into public.final_votes (finalist_id, user_id, email_key)
    values (p_finalist, v_uid, v_email_key);
  end if;

  select coalesce(array_agg(finalist_id), '{}'::uuid[]) into v_picks
  from public.final_votes where email_key = v_email_key;

  return v_picks;
end;
$$;

drop function if exists public.my_state();

-- The viewer's own votes/picks/reports, by email (v3, no OTP) rather than by
-- anonymous session, so they survive a cleared cookie as long as the same
-- email is reused.
create or replace function public.my_state(p_email text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_email text := btrim(coalesce(p_email, ''));
  v_email_key text;
begin
  if auth.uid() is null or v_email = '' then
    return json_build_object('votes', '{}'::json, 'picks', '[]'::json, 'reports', '[]'::json);
  end if;

  v_email_key := lower(v_email);

  return json_build_object(
    'votes', coalesce(
      (select json_object_agg(post_id::text, dir) from public.votes where email_key = v_email_key),
      '{}'::json),
    'picks', coalesce(
      (select json_agg(finalist_id) from public.final_votes where email_key = v_email_key),
      '[]'::json),
    'reports', coalesce(
      (select json_agg(post_id) from public.reports where email_key = v_email_key),
      '[]'::json)
  );
end;
$$;

create or replace function public.company_suggest(q text)
returns table (company text)
language sql
stable
security definer
set search_path = public
as $$
  select p.company
  from public.posts p
  where p.hidden = false
    and coalesce(btrim(q), '') <> ''
    and p.company_key like '%' || lower(btrim(q)) || '%'
  group by p.company
  order by count(*) desc, p.company
  limit 5;
$$;

-- Participation counters and the campaign schedule. No scores, no rankings.
create or replace function public.stats()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'people', (
      select count(*) from (
        select user_id from public.posts
        union
        select user_id from public.votes
        union
        select user_id from public.final_votes
      ) u
    ) + coalesce((select people_offset from public.settings where id = 1), 0),
    'companies', (
      select count(distinct company_key) from public.posts where hidden = false
    ) + coalesce((select companies_offset from public.settings where id = 1), 0),
    'phase', public.effective_phase(),
    'phase_mode', (select phase_mode from public.settings where id = 1),
    'manual_phase', (select phase from public.settings where id = 1),
    'nominate_open', (select nominate_open from public.settings where id = 1),
    'nominate_close', (select nominate_close from public.settings where id = 1),
    'vote_open', (select vote_open from public.settings where id = 1),
    'vote_close', (select vote_close from public.settings where id = 1),
    'results_label', (select results_label from public.settings where id = 1),
    'iqlite_url', (select iqlite_url from public.settings where id = 1),
    'ximu_url', (select ximu_url from public.settings where id = 1),
    'partners_text', (select partners_text from public.settings where id = 1),
    'contact_email', (select contact_email from public.settings where id = 1)
  );
$$;

-- How many rows posts_public currently holds (for "載入更多" paging).
create or replace function public.posts_public_count()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.posts where hidden = false;
$$;

-- v3: no more one-to-one anonymous-session <-> auth.users email mapping, so
-- people are grouped by email_key across participants / posts / votes /
-- final_votes instead of joining auth.users.
drop function if exists public.admin_people();

create or replace function public.admin_people()
returns table (
  email text,
  email_key text,
  first_seen timestamptz,
  n_posts bigint,
  n_votes bigint,
  n_final_votes bigint,
  companies text[]
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception '這裡沒有東西。';
  end if;

  return query
  with keys as (
    select pt.email_key from public.participants pt
    union
    select lower(btrim(p.email)) from public.posts p
    union
    select v.email_key from public.votes v
    union
    select fv.email_key from public.final_votes fv
  )
  select
    coalesce(
      (select pt.email from public.participants pt where pt.email_key = k.email_key),
      (select p.email from public.posts p
         where lower(btrim(p.email)) = k.email_key
         order by p.created_at limit 1),
      k.email_key
    ) as email,
    k.email_key,
    least(
      coalesce((select min(pt.created_at) from public.participants pt where pt.email_key = k.email_key), 'infinity'::timestamptz),
      coalesce((select min(p.created_at) from public.posts p where lower(btrim(p.email)) = k.email_key), 'infinity'::timestamptz),
      coalesce((select min(v.created_at) from public.votes v where v.email_key = k.email_key), 'infinity'::timestamptz),
      coalesce((select min(fv.created_at) from public.final_votes fv where fv.email_key = k.email_key), 'infinity'::timestamptz)
    ) as first_seen,
    (select count(*) from public.posts p where lower(btrim(p.email)) = k.email_key) as n_posts,
    (select count(*) from public.votes v where v.email_key = k.email_key) as n_votes,
    (select count(*) from public.final_votes fv where fv.email_key = k.email_key) as n_final_votes,
    (select coalesce(array_agg(distinct p.company), '{}'::text[])
       from public.posts p where lower(btrim(p.email)) = k.email_key) as companies
  from keys k
  order by first_seen asc;
end;
$$;

-- Builds the Phase 2 shortlist from the most-endorsed nomination of each
-- company: the English name, URL and representative reason come from that row.
create or replace function public.admin_build_finalists()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception '這裡沒有東西。';
  end if;

  delete from public.final_votes;
  delete from public.finalists;

  with ranked as (
    select
      p.company_key,
      sum(p.up - p.down + p.adjust) as total,
      count(*) as n_posts,
      (array_agg(p.company order by p.created_at))[1] as company,
      (array_agg(p.company_en order by (p.up - p.down + p.adjust) desc, p.created_at))[1]
        as name_en,
      (array_agg(p.url order by (p.up - p.down + p.adjust) desc, p.created_at))[1]
        as url,
      (array_agg(p.reason order by (p.up - p.down + p.adjust) desc, p.created_at))[1]
        as top_reason
    from public.posts p
    where p.hidden = false
    group by p.company_key
    order by total desc, n_posts desc
    limit 10
  )
  insert into public.finalists (company, name_en, url, blurb, top_reason, sort)
  select r.company, coalesce(r.name_en, ''), coalesce(r.url, ''), '', r.top_reason,
         row_number() over (order by r.total desc, r.n_posts desc)
  from ranked r;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function grants
-- ---------------------------------------------------------------------------

revoke all on function public.nominate(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.cast_vote(uuid, smallint, text) from public, anon, authenticated;
revoke all on function public.report_post(uuid, text) from public, anon, authenticated;
revoke all on function public.cast_final_vote(uuid, text) from public, anon, authenticated;
revoke all on function public.my_state(text) from public, anon, authenticated;
revoke all on function public.check_rate_limit(text, text, uuid) from public, anon, authenticated;
revoke all on function public.company_suggest(text) from public, anon, authenticated;
revoke all on function public.stats() from public, anon, authenticated;
revoke all on function public.posts_public_count() from public, anon, authenticated;
revoke all on function public.admin_people() from public, anon, authenticated;
revoke all on function public.admin_build_finalists() from public, anon, authenticated;
revoke all on function public.is_admin() from public, anon, authenticated;
revoke all on function public.effective_phase() from public, anon, authenticated;

grant execute on function public.nominate(text, text, text, text, text) to authenticated;
grant execute on function public.cast_vote(uuid, smallint, text) to authenticated;
grant execute on function public.report_post(uuid, text) to authenticated;
grant execute on function public.cast_final_vote(uuid, text) to authenticated;
grant execute on function public.my_state(text) to authenticated;
-- check_rate_limit() gets no grant: only called internally by the RPCs above.
grant execute on function public.company_suggest(text) to anon, authenticated;
grant execute on function public.stats() to anon, authenticated;
grant execute on function public.posts_public_count() to anon, authenticated;
grant execute on function public.admin_people() to authenticated;
grant execute on function public.admin_build_finalists() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.effective_phase() to anon, authenticated;

-- ===========================================================================
-- v6 — Phase 1 per campaign memo v4.0 (SPEC-v6-phase1.md). BEGIN v6
-- Frictionless nomination: a company name resolved to an official domain,
-- no email / reason / cap. The old posts / votes / participants tables and
-- their RPCs stay in place (unused by the Phase 1 UI); only the old
-- nominate() now rejects. Snapshot mechanism: pg_cron is NOT enabled on this
-- project, so board() takes the hourly rank snapshot lazily.
-- Apply statement by statement:  node scripts/apply-sql.mjs v6
-- ===========================================================================

create extension if not exists pg_trgm with schema extensions;

create table if not exists public.companies (
  domain text primary key,
  display_name text not null,
  aliases text[] not null default '{}',
  status text not null default 'active'
    check (status in ('active', 'pending', 'hidden')),
  is_seed boolean not null default false,
  created_at timestamptz default now(),
  merged_into text references public.companies (domain)
);

create index if not exists companies_display_name_trgm_idx
  on public.companies using gin (lower(display_name) extensions.gin_trgm_ops);

create index if not exists companies_aliases_idx
  on public.companies using gin (aliases);

create table if not exists public.nominations (
  id bigserial primary key,
  domain text not null references public.companies (domain),
  session_id uuid,
  typed_name text,
  created_at timestamptz default now()
);

create index if not exists nominations_domain_idx
  on public.nominations (domain, created_at);

create index if not exists nominations_session_idx
  on public.nominations (session_id, created_at);

create index if not exists nominations_created_at_idx
  on public.nominations (created_at desc);

-- One row per company per hourly snapshot. `n` (raw count at snapshot time)
-- is internal: it only feeds the 0–1 share bar and never leaves board().
create table if not exists public.board_snapshots (
  taken_at timestamptz not null,
  domain text not null,
  rank int not null,
  primary key (taken_at, domain)
);

alter table public.board_snapshots add column if not exists n int not null default 0;

alter table public.companies enable row level security;

alter table public.nominations enable row level security;

alter table public.board_snapshots enable row level security;

drop policy if exists companies_admin_all on public.companies;

create policy companies_admin_all on public.companies
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists nominations_admin_all on public.nominations;

create policy nominations_admin_all on public.nominations
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists board_snapshots_admin_read on public.board_snapshots;

create policy board_snapshots_admin_read on public.board_snapshots
for select to authenticated using (public.is_admin());

revoke all on public.companies from anon, authenticated;

revoke all on public.nominations from anon, authenticated;

revoke all on public.board_snapshots from anon, authenticated;

revoke all on sequence public.nominations_id_seq from anon, authenticated;

grant select, insert, update, delete on public.companies to authenticated;

grant select, update, delete on public.nominations to authenticated;

grant select on public.board_snapshots to authenticated;

-- Official website -> canonical domain: strip scheme, userinfo, path/query,
-- port, `www.` and a trailing dot; lower-case. NULL when nothing is left.
create or replace function public.normalize_domain(p_url text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              lower(btrim(coalesce(p_url, ''))),
              '^[a-z][a-z0-9+.-]*://', ''),
            '[/?#\\].*$', ''),
          '^[^@]*@', ''),
        '(:[0-9]*)?\.?$', ''),
      '^www\.', ''),
    '');
$$;

create or replace function public.valid_domain(p_domain text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(
    char_length(p_domain) <= 253
    and p_domain ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$',
    false);
$$;

-- Name search for the /nominate resolver. Active companies only (seed
-- companies included); merged-away entities never match.
create or replace function public.resolve_company(q text)
returns table (domain text, display_name text, aliases text[])
language sql
stable
security definer
set search_path = public, extensions
as $$
  with t as (
    select lower(btrim(coalesce(q, ''))) as k,
           replace(replace(replace(lower(btrim(coalesce(q, ''))), '\', '\\'), '%', '\%'), '_', '\_') as p
  )
  select c.domain, c.display_name, c.aliases
  from public.companies c, t
  where t.k <> ''
    and char_length(t.k) <= 80
    and c.status <> 'hidden'
    and c.merged_into is null
    and (
      lower(c.display_name) like '%' || t.p || '%'
      or exists (select 1 from unnest(c.aliases) a where lower(a) like '%' || t.p || '%')
      or c.domain like t.p || '%'
      or (char_length(t.k) >= 3 and similarity(lower(c.display_name), t.k) > 0.3)
    )
  order by
    (lower(c.display_name) = t.k
      or exists (select 1 from unnest(c.aliases) a where lower(a) = t.k)) desc,
    (lower(c.display_name) like t.p || '%') desc,
    similarity(lower(c.display_name), t.k) desc,
    c.display_name
  limit 6;
$$;

-- Official website -> existing company (following merges) or a proposal
-- {domain, display_name = the typed name}. Read-only.
create or replace function public.resolve_domain(url text, name text default '')
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_domain text := public.normalize_domain(url);
  v_c public.companies;
  v_hops int := 0;
begin
  if not public.valid_domain(v_domain) then
    raise exception '請輸入正確的官方網站，例如 https://example.com';
  end if;

  select * into v_c from public.companies c where c.domain = v_domain;
  while v_c.merged_into is not null and v_hops < 5 loop
    select * into v_c from public.companies c where c.domain = v_c.merged_into;
    v_hops := v_hops + 1;
  end loop;

  if v_c.domain is not null then
    return json_build_object(
      'domain', v_c.domain,
      'display_name', v_c.display_name,
      'aliases', to_json(v_c.aliases),
      'exists', true
    );
  end if;

  return json_build_object(
    'domain', v_domain,
    'display_name', left(regexp_replace(btrim(coalesce(name, '')), '\s+', ' ', 'g'), 60),
    'aliases', '[]'::json,
    'exists', false
  );
end;
$$;

-- The one Phase 1 write. Phase must be 'nominate'. New domain -> company
-- with status 'pending' and the typed name. Nominating the same company again
-- only means "it has been nominated". Soft rate limit (memo: 不做防弊): past
-- 20/session/hour or 200/domain/hour the call still succeeds but writes nothing.
create or replace function public.nominate_company(p_domain text, p_display_name text)
returns json
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_phase text := public.effective_phase();
  v_domain text := public.normalize_domain(p_domain);
  v_name text := left(regexp_replace(btrim(coalesce(p_display_name, '')), '\s+', ' ', 'g'), 60);
  v_c public.companies;
  v_hops int := 0;
  v_limited boolean := false;
begin
  if v_phase = 'pre' then
    raise exception '提名尚未開放。';
  end if;
  if v_phase is distinct from 'nominate' then
    raise exception '提名期間已結束。';
  end if;
  if not public.valid_domain(v_domain) then
    raise exception '請輸入正確的官方網站，例如 https://example.com';
  end if;

  select * into v_c from public.companies c where c.domain = v_domain;
  while v_c.merged_into is not null and v_hops < 5 loop
    select * into v_c from public.companies c where c.domain = v_c.merged_into;
    v_hops := v_hops + 1;
  end loop;

  if v_c.domain is null and v_name = '' then
    raise exception '請輸入公司名稱。';
  end if;

  if v_uid is not null and (
    select count(*) from public.nominations n
    where n.session_id = v_uid and n.created_at > now() - interval '1 hour'
  ) >= 20 then
    v_limited := true;
  end if;
  if v_c.domain is not null and (
    select count(*) from public.nominations n
    where n.domain = v_c.domain and n.created_at > now() - interval '1 hour'
  ) >= 200 then
    v_limited := true;
  end if;

  if v_limited then
    return json_build_object(
      'domain', coalesce(v_c.domain, v_domain),
      'display_name', coalesce(v_c.display_name, v_name),
      'aliases', to_json(coalesce(v_c.aliases, '{}'::text[])),
      'ok', true
    );
  end if;

  if v_c.domain is null then
    insert into public.companies (domain, display_name, status)
    values (v_domain, v_name, 'pending')
    on conflict (domain) do nothing;
    select * into v_c from public.companies c where c.domain = v_domain;
  end if;

  insert into public.nominations (domain, session_id, typed_name)
  values (v_c.domain, v_uid, nullif(v_name, ''));

  return json_build_object(
    'domain', v_c.domain,
    'display_name', v_c.display_name,
    'aliases', to_json(v_c.aliases),
    'ok', true
  );
end;
$$;

-- Hourly rank snapshot (lazy: called by board()). The advisory lock plus the
-- re-check make concurrent board() calls take at most one snapshot per hour.
create or replace function public.take_board_snapshot()
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('public.take_board_snapshot'));
  if coalesce((select max(taken_at) from public.board_snapshots), '-infinity'::timestamptz)
     >= now() - interval '60 minutes' then
    return;
  end if;

  insert into public.board_snapshots (taken_at, domain, rank, n)
  select clock_timestamp(), x.domain, x.rk, x.n
  from (
    select c.domain,
           count(*)::int as n,
           row_number() over (order by count(*) desc, min(nm.created_at), c.domain)::int as rk
    from public.nominations nm
    join public.companies c on c.domain = nm.domain
    where c.status <> 'hidden' and c.merged_into is null
    group by c.domain
  ) x
  where x.rk <= 100;

  delete from public.board_snapshots where taken_at < now() - interval '14 days';
end;
$$;

-- The public nomination board. Never returns raw nomination counts:
-- total_companies is the only integer; hot[].share is 0–1 of the top count.
create or replace function public.board()
returns json
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_latest timestamptz;
  v_prev timestamptz;
  v_top int;
begin
  if coalesce((select max(taken_at) from public.board_snapshots), '-infinity'::timestamptz)
     < now() - interval '60 minutes' then
    perform public.take_board_snapshot();
  end if;

  select max(taken_at) into v_latest from public.board_snapshots;
  select max(taken_at) into v_prev from public.board_snapshots where taken_at < v_latest;
  select max(s.n) into v_top
  from public.board_snapshots s
  join public.companies c on c.domain = s.domain
  where s.taken_at = v_latest and c.status <> 'hidden' and c.merged_into is null;

  return json_build_object(
    'total_companies', (
      select count(distinct nm.domain)::int
      from public.nominations nm
      join public.companies c on c.domain = nm.domain
      where c.status <> 'hidden' and c.merged_into is null
    ),
    'recent', coalesce((
      select json_agg(json_build_object(
               'domain', r.domain,
               'display_name', r.display_name,
               'first_nominated_at', r.first_nominated_at
             ) order by r.first_nominated_at desc)
      from (
        select c.domain, c.display_name, min(nm.created_at) as first_nominated_at
        from public.nominations nm
        join public.companies c on c.domain = nm.domain
        where c.status <> 'hidden' and c.merged_into is null
        group by c.domain, c.display_name
        order by min(nm.created_at) desc
        limit 8
      ) r
    ), '[]'::json),
    'hot', coalesce((
      select json_agg(json_build_object(
               'domain', h.domain,
               'display_name', h.display_name,
               'share', h.share,
               'movement', h.movement
             ) order by h.rank)
      from (
        select s.domain, c.display_name, s.rank,
               greatest(0.05, round(s.n::numeric * 20 / nullif(v_top, 0)) / 20)::float8 as share,
               case
                 when v_prev is null or p.rank is null then 'new'
                 when p.rank > s.rank then 'up'
                 when p.rank < s.rank then 'down'
                 else 'same'
               end as movement
        from public.board_snapshots s
        join public.companies c on c.domain = s.domain
        left join public.board_snapshots p on p.taken_at = v_prev and p.domain = s.domain
        where s.taken_at = v_latest and c.status <> 'hidden' and c.merged_into is null
        order by s.rank
        limit 8
      ) h
    ), '[]'::json),
    'updated_at', now(),
    'snapshot_at', v_latest
  );
end;
$$;

-- Admin: every company with raw counts.
create or replace function public.admin_company_stats()
returns table (
  domain text,
  display_name text,
  aliases text[],
  status text,
  is_seed boolean,
  created_at timestamptz,
  merged_into text,
  nominations int,
  first_nominated_at timestamptz,
  last_nominated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception '需要管理員權限。';
  end if;
  return query
    select c.domain, c.display_name, c.aliases, c.status, c.is_seed, c.created_at,
           c.merged_into,
           count(nm.id)::int,
           min(nm.created_at),
           max(nm.created_at)
    from public.companies c
    left join public.nominations nm on nm.domain = c.domain
    group by c.domain
    order by count(nm.id) desc, c.display_name;
end;
$$;

-- Admin: fold one company into another (nominations move, the old name
-- becomes an alias, the old entity is hidden and points at the new one).
create or replace function public.admin_merge_company(p_from text, p_into text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_from public.companies;
  v_into public.companies;
begin
  if not public.is_admin() then
    raise exception '需要管理員權限。';
  end if;
  select * into v_from from public.companies c where c.domain = p_from;
  select * into v_into from public.companies c where c.domain = p_into;
  if v_from.domain is null or v_into.domain is null then
    raise exception '找不到公司。';
  end if;
  if v_from.domain = v_into.domain then
    raise exception '不能合併到自己。';
  end if;

  update public.nominations set domain = v_into.domain where domain = v_from.domain;
  update public.companies set merged_into = v_into.domain where merged_into = v_from.domain;
  update public.companies c
  set aliases = coalesce((
        select array_agg(distinct a order by a)
        from unnest(v_into.aliases || v_from.display_name || v_from.aliases) a
        where btrim(a) <> '' and a <> v_into.display_name
      ), '{}'::text[]),
      merged_into = null
  where c.domain = v_into.domain;
  update public.companies set status = 'hidden', merged_into = v_into.domain
  where domain = v_from.domain;
  delete from public.board_snapshots where domain = v_from.domain;
end;
$$;

-- The v5 email-based nomination is retired: stale tabs get a clear message.
create or replace function public.nominate(
  p_company text,
  p_company_en text,
  p_url text,
  p_reason text,
  p_email text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception '提名方式已更新，請重新整理頁面。';
end;
$$;

grant execute on function public.nominate(text, text, text, text, text) to anon, authenticated;

revoke all on function public.normalize_domain(text) from public, anon, authenticated;

revoke all on function public.valid_domain(text) from public, anon, authenticated;

revoke all on function public.resolve_company(text) from public, anon, authenticated;

revoke all on function public.resolve_domain(text, text) from public, anon, authenticated;

revoke all on function public.nominate_company(text, text) from public, anon, authenticated;

revoke all on function public.take_board_snapshot() from public, anon, authenticated;

revoke all on function public.board() from public, anon, authenticated;

revoke all on function public.admin_company_stats() from public, anon, authenticated;

revoke all on function public.admin_merge_company(text, text) from public, anon, authenticated;

grant execute on function public.resolve_company(text) to anon, authenticated;

grant execute on function public.resolve_domain(text, text) to anon, authenticated;

grant execute on function public.nominate_company(text, text) to anon, authenticated;

grant execute on function public.board() to anon, authenticated;

grant execute on function public.admin_company_stats() to authenticated;

grant execute on function public.admin_merge_company(text, text) to authenticated;

-- END v6

-- ===========================================================================
-- v7 — Phase 2 vote and perception per campaign memo v4.0 (SPEC-v7-phase2.md). BEGIN v7
-- Email-keyed daily ballots (1 per Asia/Taipei day, 1-3 companies, one
-- 10-50 char reason each), likes and dislikes on reasons that shift a
-- company by trunc(net / settings.reaction_votes_per) votes, a public
-- leaderboard with hourly lazy snapshots for rank movement. No table is
-- reachable by anon or authenticated directly: everything goes through the
-- security-definer RPCs below. Tester emails may write in any phase.
-- Apply statement by statement:  node scripts/apply-sql.mjs v7
-- ===========================================================================

alter table public.settings add column if not exists reaction_votes_per int
  not null default 10 check (reaction_votes_per > 0);

alter table public.companies add column if not exists vote_adjust int not null default 0;

create table if not exists public.testers (
  email_key text primary key
);

create table if not exists public.ballots (
  id bigserial primary key,
  email_key text not null,
  email text not null,
  ballot_date date not null,
  session_id uuid,
  voided boolean not null default false,
  created_at timestamptz default now(),
  unique (email_key, ballot_date)
);

create index if not exists ballots_session_idx on public.ballots (session_id, created_at);

create index if not exists ballots_date_idx on public.ballots (ballot_date);

create table if not exists public.ballot_picks (
  id bigserial primary key,
  ballot_id bigint not null references public.ballots (id) on delete cascade,
  domain text not null references public.companies (domain),
  reason text not null check (char_length(reason) between 10 and 50),
  hidden boolean not null default false,
  created_at timestamptz default now(),
  unique (ballot_id, domain)
);

create index if not exists ballot_picks_domain_idx on public.ballot_picks (domain, created_at);

create index if not exists ballot_picks_created_at_idx on public.ballot_picks (created_at desc);

create table if not exists public.reason_reactions (
  pick_id bigint not null references public.ballot_picks (id) on delete cascade,
  email_key text not null,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz default now(),
  primary key (pick_id, email_key)
);

create index if not exists reason_reactions_email_idx on public.reason_reactions (email_key);

create table if not exists public.leaderboard_snapshots (
  taken_at timestamptz not null,
  domain text not null,
  rank int not null,
  votes int not null,
  primary key (taken_at, domain)
);

alter table public.testers enable row level security;

alter table public.ballots enable row level security;

alter table public.ballot_picks enable row level security;

alter table public.reason_reactions enable row level security;

alter table public.leaderboard_snapshots enable row level security;

revoke all on public.testers from anon, authenticated;

revoke all on public.ballots from anon, authenticated;

revoke all on public.ballot_picks from anon, authenticated;

revoke all on public.reason_reactions from anon, authenticated;

revoke all on public.leaderboard_snapshots from anon, authenticated;

revoke all on sequence public.ballots_id_seq from anon, authenticated;

revoke all on sequence public.ballot_picks_id_seq from anon, authenticated;

-- Per-company tally (D5, D6). is_candidate implements D1; rank is the public
-- order among candidates (votes, then visible reasons, then earliest pick).
-- A reason is visible when it is not hidden and its ballot is not voided.
create or replace function public.company_votes()
returns table (
  domain text,
  display_name text,
  aliases text[],
  status text,
  is_candidate boolean,
  picks int,
  reasons int,
  reaction_net int,
  bonus int,
  adjust int,
  votes int,
  first_pick_at timestamptz,
  rank int
)
language sql
stable
security definer
set search_path = public
as $$
  with per as (
    select greatest(coalesce((select s.reaction_votes_per from public.settings s where s.id = 1), 10), 1) as n
  ),
  p as (
    select bp.domain,
           count(*)::int as picks,
           (count(*) filter (where not bp.hidden))::int as reasons,
           min(bp.created_at) as first_pick_at
    from public.ballot_picks bp
    join public.ballots b on b.id = bp.ballot_id
    where not b.voided
    group by bp.domain
  ),
  r as (
    select bp.domain, coalesce(sum(rr.value), 0)::int as net
    from public.reason_reactions rr
    join public.ballot_picks bp on bp.id = rr.pick_id
    join public.ballots b on b.id = bp.ballot_id
    where not b.voided and not bp.hidden
    group by bp.domain
  ),
  c as (
    select co.domain, co.display_name, co.aliases, co.status,
           (co.status <> 'hidden' and co.merged_into is null
             and exists (select 1 from public.nominations nm where nm.domain = co.domain)) as is_candidate,
           coalesce(p.picks, 0) as picks,
           coalesce(p.reasons, 0) as reasons,
           coalesce(r.net, 0) as net,
           (coalesce(r.net, 0) / (select per.n from per))::int as bonus,
           co.vote_adjust as adjust,
           p.first_pick_at
    from public.companies co
    left join p on p.domain = co.domain
    left join r on r.domain = co.domain
  )
  select c.domain, c.display_name, c.aliases, c.status, c.is_candidate,
         c.picks, c.reasons, c.net, c.bonus, c.adjust,
         (c.picks + c.bonus + c.adjust)::int,
         c.first_pick_at,
         case when c.is_candidate then
           (row_number() over (
              partition by c.is_candidate
              order by c.picks + c.bonus + c.adjust desc, c.reasons desc,
                       c.first_pick_at asc nulls last, c.display_name, c.domain))::int
         end
  from c;
$$;

-- Visible reasons on public companies, with reaction counts.
create or replace function public.reason_rows()
returns table (
  pick_id bigint,
  domain text,
  display_name text,
  reason text,
  likes int,
  dislikes int,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select bp.id, bp.domain, co.display_name, bp.reason,
         coalesce(x.likes, 0), coalesce(x.dislikes, 0), bp.created_at
  from public.ballot_picks bp
  join public.ballots b on b.id = bp.ballot_id
  join public.companies co on co.domain = bp.domain
  left join (
    select rr.pick_id,
           (count(*) filter (where rr.value = 1))::int as likes,
           (count(*) filter (where rr.value = -1))::int as dislikes
    from public.reason_reactions rr
    group by rr.pick_id
  ) x on x.pick_id = bp.id
  where not bp.hidden and not b.voided
    and co.status <> 'hidden' and co.merged_into is null;
$$;

create or replace function public.is_tester(p_email_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.testers t where t.email_key = p_email_key);
$$;

-- Hourly rank snapshot, taken lazily by vote_board() during phase vote only.
create or replace function public.take_leaderboard_snapshot()
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('public.take_leaderboard_snapshot'));
  if coalesce((select max(ls.taken_at) from public.leaderboard_snapshots ls), '-infinity'::timestamptz)
     >= now() - interval '60 minutes' then
    return;
  end if;

  insert into public.leaderboard_snapshots (taken_at, domain, rank, votes)
  select clock_timestamp(), cv.domain, cv.rank, cv.votes
  from public.company_votes() cv
  where cv.is_candidate and cv.rank <= 200;

  delete from public.leaderboard_snapshots where taken_at < now() - interval '30 days';
end;
$$;

create or replace function public.vote_candidates(q text)
returns table (domain text, display_name text, aliases text[])
language sql
stable
security definer
set search_path = public, extensions
as $$
  with t as (
    select lower(btrim(coalesce(q, ''))) as k,
           replace(replace(replace(lower(btrim(coalesce(q, ''))), '\', '\\'), '%', '\%'), '_', '\_') as p
  )
  select cv.domain, cv.display_name, cv.aliases
  from public.company_votes() cv, t
  where cv.is_candidate
    and char_length(t.k) <= 80
    and (
      t.k = ''
      or lower(cv.display_name) like '%' || t.p || '%'
      or exists (select 1 from unnest(cv.aliases) a where lower(a) like '%' || t.p || '%')
      or cv.domain like t.p || '%'
      or (char_length(t.k) >= 3 and similarity(lower(cv.display_name), t.k) > 0.3)
    )
  order by
    (t.k <> '' and (lower(cv.display_name) = t.k
      or exists (select 1 from unnest(cv.aliases) a where lower(a) = t.k))) desc,
    (t.k <> '' and lower(cv.display_name) like t.p || '%') desc,
    case when t.k <> '' then similarity(lower(cv.display_name), t.k) else 0 end desc,
    cv.rank
  limit 12;
$$;

-- The daily ballot. Phase vote (or a tester email). D2, D3, D4, D1.
create or replace function public.cast_ballot(p_email text, p_picks jsonb)
returns json
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_phase text := public.effective_phase();
  v_email text := btrim(coalesce(p_email, ''));
  v_key text;
  v_today date := (now() at time zone 'Asia/Taipei')::date;
  v_n int;
  v_item jsonb;
  v_domain text;
  v_reason text;
  v_domains text[] := '{}';
  v_reasons text[] := '{}';
  v_ballot_id bigint;
  v_pick_id bigint;
  v_out json[] := '{}';
  i int;
begin
  if char_length(v_email) > 254 or v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception '請確認 Email 格式。';
  end if;
  v_key := lower(v_email);

  if v_phase is distinct from 'vote' and not public.is_tester(v_key) then
    if v_phase in ('pre', 'nominate') then
      raise exception '投票尚未開放。';
    end if;
    raise exception '投票已截止。';
  end if;

  if p_picks is null or jsonb_typeof(p_picks) <> 'array' or jsonb_array_length(p_picks) < 1 then
    raise exception '請至少選擇 1 家公司。';
  end if;
  v_n := jsonb_array_length(p_picks);
  if v_n > 3 then
    raise exception '每張選票最多選 3 家公司。';
  end if;

  for v_item in select e.value from jsonb_array_elements(p_picks) e loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception '這個動作無法完成。';
    end if;
    v_domain := public.normalize_domain(v_item ->> 'domain');
    v_reason := btrim(regexp_replace(coalesce(v_item ->> 'reason', ''), '\s+', ' ', 'g'));
    if v_domain is null then
      raise exception '這家公司不在候選名單中。';
    end if;
    if v_domain = any (v_domains) then
      raise exception '同一家公司只能選一次。';
    end if;
    if char_length(v_reason) < 10 or char_length(v_reason) > 50 then
      raise exception '每家公司的理由需要 10–50 個字。';
    end if;
    if not exists (
      select 1 from public.companies c
      where c.domain = v_domain and c.status <> 'hidden' and c.merged_into is null
        and exists (select 1 from public.nominations nm where nm.domain = c.domain)
    ) then
      raise exception '這家公司不在候選名單中。';
    end if;
    v_domains := v_domains || v_domain;
    v_reasons := v_reasons || v_reason;
  end loop;

  if exists (select 1 from public.ballots b where b.email_key = v_key and b.ballot_date = v_today) then
    raise exception '今天已經投過了，明天可以再投一次。';
  end if;

  if v_uid is not null and (
    select count(*) from public.ballots b
    where b.session_id = v_uid and b.created_at > now() - interval '1 hour'
  ) >= 30 then
    raise exception '操作過於頻繁，請稍後再試。';
  end if;

  begin
    insert into public.ballots (email_key, email, ballot_date, session_id)
    values (v_key, v_email, v_today, v_uid)
    returning id into v_ballot_id;
  exception when unique_violation then
    raise exception '今天已經投過了，明天可以再投一次。';
  end;

  for i in 1 .. v_n loop
    insert into public.ballot_picks (ballot_id, domain, reason)
    values (v_ballot_id, v_domains[i], v_reasons[i])
    returning id into v_pick_id;
    v_out := v_out || json_build_object('pick_id', v_pick_id, 'domain', v_domains[i]);
  end loop;

  return json_build_object(
    'ballot_id', v_ballot_id,
    'ballot_date', to_char(v_today, 'YYYY-MM-DD'),
    'picks', array_to_json(v_out)
  );
end;
$$;

-- Like (1), dislike (-1) or clear (0) a reason. One stance per email per
-- reason. D7: reacting to your own reason is silently ignored.
create or replace function public.react_reason(p_pick_id bigint, p_email text, p_value smallint)
returns json
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_phase text := public.effective_phase();
  v_email text := btrim(coalesce(p_email, ''));
  v_key text;
  v_owner text;
begin
  if p_value is null or p_value not in (-1, 0, 1) then
    raise exception '這個動作無法完成。';
  end if;
  if char_length(v_email) > 254 or v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception '請確認 Email 格式。';
  end if;
  v_key := lower(v_email);

  if v_phase is distinct from 'vote' and not public.is_tester(v_key) then
    if v_phase in ('pre', 'nominate') then
      raise exception '投票尚未開放。';
    end if;
    raise exception '投票已截止。';
  end if;

  select b.email_key into v_owner
  from public.ballot_picks bp
  join public.ballots b on b.id = bp.ballot_id
  join public.companies co on co.domain = bp.domain
  where bp.id = p_pick_id and not bp.hidden and not b.voided
    and co.status <> 'hidden' and co.merged_into is null;
  if v_owner is null then
    raise exception '這則理由已不存在。';
  end if;

  if v_owner <> v_key then
    if p_value = 0 then
      delete from public.reason_reactions rr where rr.pick_id = p_pick_id and rr.email_key = v_key;
    else
      insert into public.reason_reactions (pick_id, email_key, value)
      values (p_pick_id, v_key, p_value)
      on conflict (pick_id, email_key) do update set value = excluded.value, created_at = now();
    end if;
  end if;

  return (
    select json_build_object(
      'likes', (count(*) filter (where rr.value = 1))::int,
      'dislikes', (count(*) filter (where rr.value = -1))::int)
    from public.reason_reactions rr where rr.pick_id = p_pick_id
  );
end;
$$;

create or replace function public.my_vote_state(p_email text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_email text := btrim(coalesce(p_email, ''));
  v_key text;
  v_today date := (now() at time zone 'Asia/Taipei')::date;
begin
  if char_length(v_email) > 254 or v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return json_build_object('voted_today', false, 'today', '[]'::json, 'reactions', '[]'::json);
  end if;
  v_key := lower(v_email);

  return json_build_object(
    'voted_today', exists (
      select 1 from public.ballots b where b.email_key = v_key and b.ballot_date = v_today),
    'today', coalesce((
      select json_agg(json_build_object(
               'domain', bp.domain,
               'display_name', co.display_name,
               'reason', bp.reason) order by bp.id)
      from public.ballots b
      join public.ballot_picks bp on bp.ballot_id = b.id
      join public.companies co on co.domain = bp.domain
      where b.email_key = v_key and b.ballot_date = v_today
    ), '[]'::json),
    'reactions', coalesce((
      select json_agg(json_build_object('pick_id', x.pick_id, 'value', x.value))
      from (
        select rr.pick_id, rr.value from public.reason_reactions rr
        where rr.email_key = v_key
        order by rr.created_at desc
        limit 2000
      ) x
    ), '[]'::json)
  );
end;
$$;

-- The public Community Intelligence board. Movement compares the live rank
-- with the newest snapshot that is at least 60 minutes old.
create or replace function public.vote_board()
returns json
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_base timestamptz;
  v_today date := (now() at time zone 'Asia/Taipei')::date;
  v_open date;
  v_close date;
begin
  if public.effective_phase() = 'vote'
     and coalesce((select max(ls.taken_at) from public.leaderboard_snapshots ls), '-infinity'::timestamptz)
         < now() - interval '60 minutes' then
    perform public.take_leaderboard_snapshot();
  end if;

  select max(ls.taken_at) into v_base
  from public.leaderboard_snapshots ls
  where ls.taken_at <= now() - interval '60 minutes';

  select (s.vote_open at time zone 'Asia/Taipei')::date,
         (s.vote_close at time zone 'Asia/Taipei')::date
  into v_open, v_close
  from public.settings s where s.id = 1;

  return (
    with cv as (
      select * from public.company_votes() x where x.is_candidate
    ),
    rr as (
      select * from public.reason_rows()
    )
    select json_build_object(
      'total_votes', coalesce((select sum(cv.votes) from cv), 0)::int,
      'total_reasons', coalesce((select sum(cv.reasons) from cv), 0)::int,
      'total_voters', (select count(distinct b.email_key) from public.ballots b where not b.voided)::int,
      'updated_at', now(),
      'leaderboard', coalesce((
        select json_agg(json_build_object(
                 'rank', l.rank,
                 'domain', l.domain,
                 'display_name', l.display_name,
                 'votes', l.votes,
                 'reasons', l.reasons,
                 'movement', l.movement) order by l.rank)
        from (
          select cv.rank, cv.domain, cv.display_name, cv.votes, cv.reasons,
                 case
                   when v_base is null or ls.rank is null then 'new'
                   when ls.rank > cv.rank then 'up'
                   when ls.rank < cv.rank then 'down'
                   else 'same'
                 end as movement
          from cv
          left join public.leaderboard_snapshots ls on ls.taken_at = v_base and ls.domain = cv.domain
          order by cv.rank
          limit 30
        ) l
      ), '[]'::json),
      'hot_reasons', coalesce((
        select json_agg(json_build_object(
                 'pick_id', h.pick_id, 'domain', h.domain, 'display_name', h.display_name,
                 'reason', h.reason, 'likes', h.likes, 'dislikes', h.dislikes)
                 order by h.likes - h.dislikes desc, h.created_at desc, h.pick_id desc)
        from (
          select * from rr
          order by rr.likes - rr.dislikes desc, rr.created_at desc, rr.pick_id desc
          limit 12
        ) h
      ), '[]'::json),
      'latest_reasons', coalesce((
        select json_agg(json_build_object(
                 'pick_id', h.pick_id, 'domain', h.domain, 'display_name', h.display_name,
                 'reason', h.reason, 'likes', h.likes, 'dislikes', h.dislikes)
                 order by h.created_at desc, h.pick_id desc)
        from (
          select * from rr order by rr.created_at desc, rr.pick_id desc limit 12
        ) h
      ), '[]'::json),
      'trend', coalesce((
        select json_agg(json_build_object(
                 'day', to_char(d.day, 'YYYY-MM-DD'),
                 'ballots', (select count(*) from public.ballots b
                             where b.ballot_date = d.day and not b.voided)::int,
                 'reasons', (select count(*) from public.ballot_picks bp
                             join public.ballots b on b.id = bp.ballot_id
                             join public.companies co on co.domain = bp.domain
                             where b.ballot_date = d.day and not b.voided and not bp.hidden
                               and co.status <> 'hidden' and co.merged_into is null)::int)
                 order by d.day)
        from (
          select g::date as day
          from generate_series(v_open::timestamp, least(v_close, v_today)::timestamp, interval '1 day') g
          where v_open is not null and v_close is not null
        ) d
      ), '[]'::json)
    )
  );
end;
$$;

create or replace function public.company_detail(p_domain text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_domain text := public.normalize_domain(p_domain);
  v_next text;
  v_hops int := 0;
  v_row record;
begin
  loop
    select c.merged_into into v_next from public.companies c where c.domain = v_domain;
    exit when v_next is null or v_hops >= 5;
    v_domain := v_next;
    v_hops := v_hops + 1;
  end loop;

  select * into v_row from public.company_votes() cv
  where cv.domain = v_domain and cv.is_candidate;
  if not found then
    return null;
  end if;

  return json_build_object(
    'domain', v_row.domain,
    'display_name', v_row.display_name,
    'aliases', to_json(v_row.aliases),
    'rank', v_row.rank,
    'votes', v_row.votes,
    'reasons_count', v_row.reasons,
    'reasons', coalesce((
      select json_agg(json_build_object(
               'pick_id', x.pick_id, 'reason', x.reason, 'likes', x.likes,
               'dislikes', x.dislikes, 'created_at', x.created_at)
               order by x.created_at desc, x.pick_id desc)
      from (
        select * from public.reason_rows() r
        where r.domain = v_row.domain
        order by r.created_at desc, r.pick_id desc
        limit 200
      ) x
    ), '[]'::json)
  );
end;
$$;

create or replace function public.reason_corpus(p_domain text default null)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array(
    select r.reason from public.reason_rows() r
    where p_domain is null or r.domain = public.normalize_domain(p_domain)
    order by r.created_at desc, r.pick_id desc
    limit 5000
  ), '{}'::text[]);
$$;

create or replace function public.admin_ballots(p_limit int, p_offset int)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception '需要管理員權限。';
  end if;
  return json_build_object(
    'total', (select count(*) from public.ballots)::int,
    'ballots', coalesce((
      select json_agg(json_build_object(
               'id', b.id,
               'email', b.email,
               'email_key', b.email_key,
               'ballot_date', to_char(b.ballot_date, 'YYYY-MM-DD'),
               'session_id', b.session_id,
               'voided', b.voided,
               'created_at', b.created_at,
               'picks', coalesce((
                 select json_agg(json_build_object(
                          'pick_id', bp.id,
                          'domain', bp.domain,
                          'display_name', co.display_name,
                          'reason', bp.reason,
                          'hidden', bp.hidden,
                          'likes', (select count(*) from public.reason_reactions rr
                                    where rr.pick_id = bp.id and rr.value = 1)::int,
                          'dislikes', (select count(*) from public.reason_reactions rr
                                       where rr.pick_id = bp.id and rr.value = -1)::int
                        ) order by bp.id)
                 from public.ballot_picks bp
                 join public.companies co on co.domain = bp.domain
                 where bp.ballot_id = b.id
               ), '[]'::json)
             ) order by b.created_at desc, b.id desc)
      from (
        select * from public.ballots
        order by created_at desc, id desc
        limit least(greatest(coalesce(p_limit, 50), 1), 500)
        offset greatest(coalesce(p_offset, 0), 0)
      ) b
    ), '[]'::json)
  );
end;
$$;

create or replace function public.admin_set_ballot_void(p_id bigint, p_voided boolean)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception '需要管理員權限。';
  end if;
  update public.ballots set voided = coalesce(p_voided, false) where id = p_id;
  if not found then
    raise exception '找不到選票。';
  end if;
end;
$$;

create or replace function public.admin_set_reason_hidden(p_pick_id bigint, p_hidden boolean)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception '需要管理員權限。';
  end if;
  update public.ballot_picks set hidden = coalesce(p_hidden, false) where id = p_pick_id;
  if not found then
    raise exception '找不到理由。';
  end if;
end;
$$;

create or replace function public.admin_set_vote_adjust(p_domain text, p_adjust int)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception '需要管理員權限。';
  end if;
  update public.companies set vote_adjust = coalesce(p_adjust, 0) where domain = p_domain;
  if not found then
    raise exception '找不到公司。';
  end if;
end;
$$;

-- Adds or removes a tester email; returns the full tester list.
create or replace function public.admin_testers_set(p_email text, p_on boolean)
returns json
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_key text := lower(btrim(coalesce(p_email, '')));
begin
  if not public.is_admin() then
    raise exception '需要管理員權限。';
  end if;
  if v_key <> '' then
    if v_key !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception '請確認 Email 格式。';
    end if;
    if coalesce(p_on, false) then
      insert into public.testers (email_key) values (v_key) on conflict (email_key) do nothing;
    else
      delete from public.testers t where t.email_key = v_key;
    end if;
  end if;
  return coalesce((select json_agg(t.email_key order by t.email_key) from public.testers t), '[]'::json);
end;
$$;

create or replace function public.admin_vote_stats()
returns table (
  domain text,
  display_name text,
  status text,
  is_candidate boolean,
  rank int,
  picks int,
  reasons int,
  reaction_net int,
  bonus int,
  adjust int,
  votes int
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception '需要管理員權限。';
  end if;
  return query
    select cv.domain, cv.display_name, cv.status, cv.is_candidate, cv.rank,
           cv.picks, cv.reasons, cv.reaction_net, cv.bonus, cv.adjust, cv.votes
    from public.company_votes() cv
    where cv.is_candidate or cv.picks > 0 or cv.adjust <> 0
    order by cv.rank asc nulls last, cv.votes desc, cv.display_name;
end;
$$;

revoke all on function public.company_votes() from public, anon, authenticated;

revoke all on function public.reason_rows() from public, anon, authenticated;

revoke all on function public.is_tester(text) from public, anon, authenticated;

revoke all on function public.take_leaderboard_snapshot() from public, anon, authenticated;

revoke all on function public.vote_candidates(text) from public, anon, authenticated;

revoke all on function public.cast_ballot(text, jsonb) from public, anon, authenticated;

revoke all on function public.react_reason(bigint, text, smallint) from public, anon, authenticated;

revoke all on function public.my_vote_state(text) from public, anon, authenticated;

revoke all on function public.vote_board() from public, anon, authenticated;

revoke all on function public.company_detail(text) from public, anon, authenticated;

revoke all on function public.reason_corpus(text) from public, anon, authenticated;

revoke all on function public.admin_ballots(int, int) from public, anon, authenticated;

revoke all on function public.admin_set_ballot_void(bigint, boolean) from public, anon, authenticated;

revoke all on function public.admin_set_reason_hidden(bigint, boolean) from public, anon, authenticated;

revoke all on function public.admin_set_vote_adjust(text, int) from public, anon, authenticated;

revoke all on function public.admin_testers_set(text, boolean) from public, anon, authenticated;

revoke all on function public.admin_vote_stats() from public, anon, authenticated;

grant execute on function public.vote_candidates(text) to anon, authenticated;

grant execute on function public.cast_ballot(text, jsonb) to anon, authenticated;

grant execute on function public.react_reason(bigint, text, smallint) to anon, authenticated;

grant execute on function public.my_vote_state(text) to anon, authenticated;

grant execute on function public.vote_board() to anon, authenticated;

grant execute on function public.company_detail(text) to anon, authenticated;

grant execute on function public.reason_corpus(text) to anon, authenticated;

grant execute on function public.admin_ballots(int, int) to authenticated;

grant execute on function public.admin_set_ballot_void(bigint, boolean) to authenticated;

grant execute on function public.admin_set_reason_hidden(bigint, boolean) to authenticated;

grant execute on function public.admin_set_vote_adjust(text, int) to authenticated;

grant execute on function public.admin_testers_set(text, boolean) to authenticated;

grant execute on function public.admin_vote_stats() to authenticated;

-- END v7


-- v7b — Phase 2 UI stage (SPEC-v7b-ui.md §6): merge fix. BEGIN v7b
-- admin_merge_company now also moves ballot picks. When one ballot picked
-- both companies, the earlier pick (created_at, then id) is kept, the later
-- pick's reactions move onto it where that email has no stance yet, and the
-- later pick is deleted. Apply statement by statement:  node scripts/apply-sql.mjs v7b
-- ===========================================================================

create or replace function public.admin_merge_company(p_from text, p_into text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_from public.companies;
  v_into public.companies;
  v_pair record;
  v_keep bigint;
  v_drop bigint;
begin
  if not public.is_admin() then
    raise exception '需要管理員權限。';
  end if;
  select * into v_from from public.companies c where c.domain = p_from;
  select * into v_into from public.companies c where c.domain = p_into;
  if v_from.domain is null or v_into.domain is null then
    raise exception '找不到公司。';
  end if;
  if v_from.domain = v_into.domain then
    raise exception '不能合併到自己。';
  end if;

  update public.nominations set domain = v_into.domain where domain = v_from.domain;

  -- Ballots that picked both companies: keep the earlier pick.
  for v_pair in
    select pf.id as from_id, pi.id as into_id,
           (pf.created_at, pf.id) < (pi.created_at, pi.id) as from_first
    from public.ballot_picks pf
    join public.ballot_picks pi on pi.ballot_id = pf.ballot_id and pi.domain = v_into.domain
    where pf.domain = v_from.domain
  loop
    if v_pair.from_first then
      v_keep := v_pair.from_id;
      v_drop := v_pair.into_id;
    else
      v_keep := v_pair.into_id;
      v_drop := v_pair.from_id;
    end if;
    insert into public.reason_reactions (pick_id, email_key, value, created_at)
    select v_keep, rr.email_key, rr.value, rr.created_at
    from public.reason_reactions rr
    where rr.pick_id = v_drop
    on conflict (pick_id, email_key) do nothing;
    delete from public.ballot_picks bp where bp.id = v_drop;
  end loop;
  update public.ballot_picks set domain = v_into.domain where domain = v_from.domain;

  update public.companies set merged_into = v_into.domain where merged_into = v_from.domain;
  update public.companies c
  set aliases = coalesce((
        select array_agg(distinct a order by a)
        from unnest(v_into.aliases || v_from.display_name || v_from.aliases) a
        where btrim(a) <> '' and a <> v_into.display_name
      ), '{}'::text[]),
      merged_into = null
  where c.domain = v_into.domain;
  update public.companies set status = 'hidden', merged_into = v_into.domain
  where domain = v_from.domain;
  delete from public.board_snapshots where domain = v_from.domain;
  delete from public.leaderboard_snapshots where domain = v_from.domain;
end;
$$;

revoke all on function public.admin_merge_company(text, text) from public, anon, authenticated;

grant execute on function public.admin_merge_company(text, text) to authenticated;

-- END v7b


-- v6r — Phase 1 nomination reason (owner request, overrides memo v4.0's
-- 「不要求理由」): every new nomination carries a 10–50 character reason.
-- Existing nominations keep reason = null (the check is NOT VALID and allows
-- null). The 2-arg nominate_company now only tells stale tabs to reload.
-- BEGIN v6r
alter table public.nominations add column if not exists reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'nominations_reason_len'
      and conrelid = 'public.nominations'::regclass
  ) then
    alter table public.nominations
      add constraint nominations_reason_len
      check (reason is null or char_length(btrim(reason)) between 10 and 50)
      not valid;
  end if;
end;
$$;

-- The one Phase 1 write, now with a reason. Same rules as v6 otherwise:
-- phase must be 'nominate'; new domain -> pending company with the typed
-- name; soft rate limit (20/session/hour, 200/domain/hour) returns ok but
-- writes nothing.
create or replace function public.nominate_company(
  p_domain text,
  p_display_name text,
  p_reason text
)
returns json
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_phase text := public.effective_phase();
  v_domain text := public.normalize_domain(p_domain);
  v_name text := left(regexp_replace(btrim(coalesce(p_display_name, '')), '\s+', ' ', 'g'), 60);
  v_reason text := btrim(regexp_replace(coalesce(p_reason, ''), '\s+', ' ', 'g'));
  v_c public.companies;
  v_hops int := 0;
  v_limited boolean := false;
begin
  if v_phase = 'pre' then
    raise exception '提名尚未開放。';
  end if;
  if v_phase is distinct from 'nominate' then
    raise exception '提名期間已結束。';
  end if;
  if char_length(v_reason) not between 10 and 50 then
    raise exception '提名理由請寫 10 到 50 字。';
  end if;
  if not public.valid_domain(v_domain) then
    raise exception '請輸入正確的官方網站，例如 https://example.com';
  end if;

  select * into v_c from public.companies c where c.domain = v_domain;
  while v_c.merged_into is not null and v_hops < 5 loop
    select * into v_c from public.companies c where c.domain = v_c.merged_into;
    v_hops := v_hops + 1;
  end loop;

  if v_c.domain is null and v_name = '' then
    raise exception '請輸入公司名稱。';
  end if;

  if v_uid is not null and (
    select count(*) from public.nominations n
    where n.session_id = v_uid and n.created_at > now() - interval '1 hour'
  ) >= 20 then
    v_limited := true;
  end if;
  if v_c.domain is not null and (
    select count(*) from public.nominations n
    where n.domain = v_c.domain and n.created_at > now() - interval '1 hour'
  ) >= 200 then
    v_limited := true;
  end if;

  if v_limited then
    return json_build_object(
      'domain', coalesce(v_c.domain, v_domain),
      'display_name', coalesce(v_c.display_name, v_name),
      'aliases', to_json(coalesce(v_c.aliases, '{}'::text[])),
      'ok', true
    );
  end if;

  if v_c.domain is null then
    insert into public.companies (domain, display_name, status)
    values (v_domain, v_name, 'pending')
    on conflict (domain) do nothing;
    select * into v_c from public.companies c where c.domain = v_domain;
  end if;

  insert into public.nominations (domain, session_id, typed_name, reason)
  values (v_c.domain, v_uid, nullif(v_name, ''), v_reason);

  return json_build_object(
    'domain', v_c.domain,
    'display_name', v_c.display_name,
    'aliases', to_json(v_c.aliases),
    'ok', true
  );
end;
$$;

-- Stale tabs still call the 2-arg version: tell them to reload.
create or replace function public.nominate_company(p_domain text, p_display_name text)
returns json
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  raise exception '提名方式已更新，請重新整理頁面。';
end;
$$;

-- Admin: individual nominations with their reasons, newest first.
create or replace function public.admin_nominations(p_domain text default null)
returns table (
  id bigint,
  domain text,
  display_name text,
  reason text,
  typed_name text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception '需要管理員權限。';
  end if;
  return query
    select nm.id, nm.domain, c.display_name, nm.reason, nm.typed_name, nm.created_at
    from public.nominations nm
    left join public.companies c on c.domain = nm.domain
    where p_domain is null or nm.domain = p_domain
    order by nm.created_at desc, nm.id desc;
end;
$$;

revoke all on function public.nominate_company(text, text, text) from public, anon, authenticated;

revoke all on function public.nominate_company(text, text) from public, anon, authenticated;

revoke all on function public.admin_nominations(text) from public, anon, authenticated;

grant execute on function public.nominate_company(text, text, text) to anon, authenticated;

grant execute on function public.nominate_company(text, text) to anon, authenticated;

grant execute on function public.admin_nominations(text) to authenticated;

-- END v6r
