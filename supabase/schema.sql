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
  v_live_top int;
begin
  if coalesce((select max(taken_at) from public.board_snapshots), '-infinity'::timestamptz)
     < now() - interval '60 minutes' then
    perform public.take_board_snapshot();
  end if;

  select max(taken_at) into v_latest from public.board_snapshots;
  select max(n) into v_live_top from (
    select count(*) as n
    from public.nominations nm
    join public.companies c on c.domain = nm.domain
    where c.status <> 'hidden' and c.merged_into is null
    group by c.domain
  ) t;
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
        select l.domain, l.display_name, l.rank,
               greatest(0.05, round(l.n::numeric * 20 / nullif(v_live_top, 0)) / 20)::float8 as share,
               case
                 when v_latest is null or p.rank is null then 'new'
                 when p.rank > l.rank then 'up'
                 when p.rank < l.rank then 'down'
                 else 'same'
               end as movement
        from (
          select c.domain, c.display_name, count(*)::int as n,
                 (row_number() over (order by count(*) desc, min(nm.created_at) asc, c.domain))::int as rank
          from public.nominations nm
          join public.companies c on c.domain = nm.domain
          where c.status <> 'hidden' and c.merged_into is null
          group by c.domain, c.display_name
        ) l
        left join public.board_snapshots p on p.taken_at = v_latest and p.domain = l.domain
        order by l.rank
        limit 12
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
      -- v7e: Community Resonance — how much the crowd pushed back on the reasons.
      'total_likes', (select count(*) from public.reason_reactions rx
                        join public.ballot_picks bp on bp.id = rx.pick_id
                        join public.ballots bl on bl.id = bp.ballot_id
                       where rx.value = 1 and not bp.hidden and not bl.voided)::int,
      'total_dislikes', (select count(*) from public.reason_reactions rx
                        join public.ballot_picks bp on bp.id = rx.pick_id
                        join public.ballots bl on bl.id = bp.ballot_id
                       where rx.value = -1 and not bp.hidden and not bl.voided)::int,
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

-- v6e — optional participant email on /nominate, additive only. The 3-arg
-- nominate_company(domain, name, reason) keeps working unchanged; a new
-- 4-arg overload adds a required, unverified, non-public email. The
-- commander retires the 3-arg overload later via the v6e-retire block below
-- (NOT applied by this migration). BEGIN v6e
-- Apply statement by statement:  node scripts/apply-sql.mjs v6e
-- ===========================================================================

alter table public.nominations add column if not exists email text;

-- Same rules as the 3-arg nominate_company(), plus a required email: trimmed,
-- lower-cased, format-checked. Never verified, never returned to the client.
create or replace function public.nominate_company(
  p_domain text,
  p_display_name text,
  p_reason text,
  p_email text
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
  v_email text := lower(btrim(coalesce(p_email, '')));
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
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception '請填寫正確的 Email。';
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

  insert into public.nominations (domain, session_id, typed_name, reason, email)
  values (v_c.domain, v_uid, nullif(v_name, ''), v_reason, v_email);

  return json_build_object(
    'domain', v_c.domain,
    'display_name', v_c.display_name,
    'aliases', to_json(v_c.aliases),
    'ok', true
  );
end;
$$;

-- Admin: nominations with reasons and email, newest first. Dropped and
-- recreated because CREATE OR REPLACE FUNCTION cannot append a column to an
-- existing RETURNS TABLE signature.
drop function if exists public.admin_nominations(text);

create function public.admin_nominations(p_domain text default null)
returns table (
  id bigint,
  domain text,
  display_name text,
  reason text,
  typed_name text,
  email text,
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
    select nm.id, nm.domain, c.display_name, nm.reason, nm.typed_name, nm.email, nm.created_at
    from public.nominations nm
    left join public.companies c on c.domain = nm.domain
    where p_domain is null or nm.domain = p_domain
    order by nm.created_at desc, nm.id desc;
end;
$$;

revoke all on function public.nominate_company(text, text, text, text) from public, anon, authenticated;

revoke all on function public.admin_nominations(text) from public, anon, authenticated;

grant execute on function public.nominate_company(text, text, text, text) to anon, authenticated;

grant execute on function public.admin_nominations(text) to authenticated;

-- END v6e

-- v6e-retire — retires the 3-arg nominate_company(domain, name, reason) once
-- the new frontend (which always calls the 4-arg overload) is deployed. NOT
-- applied by this migration; the commander runs it separately. BEGIN v6e-retire
--   node scripts/apply-sql.mjs v6e-retire
-- ===========================================================================

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
begin
  raise exception '提名方式已更新，請重新整理頁面。';
end;
$$;

revoke all on function public.nominate_company(text, text, text) from public, anon, authenticated;

grant execute on function public.nominate_company(text, text, text) to anon, authenticated;

-- END v6e-retire

-- v6n — nominate by name when the website is unknown, additive only.
-- The 4-arg nominate_company(domain, name, reason, email) now accepts a
-- null/blank p_domain: the company key becomes 'name:' || the lower-cased,
-- whitespace-collapsed display name (status 'pending'). A given p_domain
-- behaves exactly as in v6e. `name:` companies are ordinary companies
-- everywhere else (resolver, board, vote, merge); admin merges them into a
-- real domain once the official website is known. BEGIN v6n
-- Apply statement by statement:  node scripts/apply-sql.mjs v6n
-- ===========================================================================

-- Name key for a company nominated without a website. NULL when the name is
-- shorter than 2 or longer than 60 characters after trim + collapse.
create or replace function public.company_name_key(p_name text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when char_length(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'))) between 2 and 60
      then 'name:' || lower(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')))
  end;
$$;

-- Same as v6 for every real website. A `name:` key passes through (lower-cased,
-- whitespace-collapsed) so company_detail / cast_ballot / reason_corpus accept
-- it; valid_domain() still rejects it, so resolve_domain() and the domain
-- path of nominate_company() are unchanged.
create or replace function public.normalize_domain(p_url text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when lower(btrim(coalesce(p_url, ''))) like 'name:%' then
      nullif('name:' || lower(btrim(regexp_replace(substr(btrim(p_url), 6), '\s+', ' ', 'g'))), 'name:')
    else nullif(
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
      '')
  end;
$$;

-- companies.domain is either a valid domain (the valid_domain() pattern) or
-- a `name:` key (lower-case, trimmed, single spaces, 2–60 chars after the
-- prefix). Inlined rather than calling the helpers, because a CHECK runs with
-- the caller's privileges and admins update companies as `authenticated`.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'companies_domain_key_check'
      and conrelid = 'public.companies'::regclass
  ) then
    alter table public.companies
      add constraint companies_domain_key_check
      check (
        (char_length(domain) <= 253
          and domain ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$')
        or (domain ~ '^name:\S'
          and domain !~ '\s$'
          and domain !~ '\s\s'
          and domain !~ '[\t\n\r]'
          and domain = lower(domain)
          and char_length(domain) between 7 and 65)
      );
  end if;
end;
$$;

-- Resolver: unchanged except that the domain-prefix match skips `name:` keys
-- (typing "name" must not list every name-only company). `name:` companies
-- are pending, so they are returned like any other company.
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
      or (c.domain not like 'name:%' and c.domain like t.p || '%')
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

-- v6e rules plus the name path. p_domain null/blank -> key from the name
-- (2–60 chars, else 請填寫公司名稱。); merges are followed so a name that the
-- admin already attached to a real domain lands on that company.
create or replace function public.nominate_company(
  p_domain text,
  p_display_name text,
  p_reason text,
  p_email text
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
  v_by_name boolean := btrim(coalesce(p_domain, '')) = '';
  v_domain text;
  v_name text := left(regexp_replace(btrim(coalesce(p_display_name, '')), '\s+', ' ', 'g'), 60);
  v_reason text := btrim(regexp_replace(coalesce(p_reason, ''), '\s+', ' ', 'g'));
  v_email text := lower(btrim(coalesce(p_email, '')));
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
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception '請填寫正確的 Email。';
  end if;
  if v_by_name then
    v_domain := public.company_name_key(p_display_name);
    if v_domain is null then
      raise exception '請填寫公司名稱。';
    end if;
    v_name := btrim(regexp_replace(coalesce(p_display_name, ''), '\s+', ' ', 'g'));
  else
    v_domain := public.normalize_domain(p_domain);
    if not public.valid_domain(v_domain) then
      raise exception '請輸入正確的官方網站，例如 https://example.com';
    end if;
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

  insert into public.nominations (domain, session_id, typed_name, reason, email)
  values (v_c.domain, v_uid, nullif(v_name, ''), v_reason, v_email);

  return json_build_object(
    'domain', v_c.domain,
    'display_name', v_c.display_name,
    'aliases', to_json(v_c.aliases),
    'ok', true
  );
end;
$$;

revoke all on function public.company_name_key(text) from public, anon, authenticated;

revoke all on function public.normalize_domain(text) from public, anon, authenticated;

revoke all on function public.resolve_company(text) from public, anon, authenticated;

revoke all on function public.nominate_company(text, text, text, text) from public, anon, authenticated;

grant execute on function public.resolve_company(text) to anon, authenticated;

grant execute on function public.nominate_company(text, text, text, text) to anon, authenticated;

-- END v6n

-- ===========================================================================
-- v6s — nomination strength decides the Phase 2 shortlist. The owner has
-- overridden campaign memo v4.0: being nominated by MORE PEOPLE now matters,
-- and only the top 10 companies advance to Phase 2 voting.
--
-- Ranking metric is the number of DISTINCT NOMINATOR EMAILS, not raw
-- nomination rows, so one enthusiast cannot spam a company up the list; ties
-- break on the earliest nomination. Raw counts stay visible in /admin.
--
-- The shortlist can be LOCKED (rows in public.shortlist) or LIVE (the table is
-- empty, in which case the top 10 of nomination_rank() is used). That
-- fallback is deliberate: if nobody locks the list before 9/28 the site still
-- opens with a sane ballot instead of an empty one.
-- BEGIN v6s
-- Apply statement by statement:  node scripts/apply-sql.mjs v6s
-- Idempotent: safe to run twice.
-- ===========================================================================

create table if not exists public.shortlist (
  domain text primary key references public.companies (domain),
  rank int not null,
  locked_at timestamptz not null default now()
);

alter table public.shortlist enable row level security;

-- No policy and no grant: the table is reachable only through the
-- security-definer admin RPCs below, never through PostgREST.
revoke all on public.shortlist from anon, authenticated;

-- The ranking. DISTINCT nominators per company, then earliest nomination.
-- A nomination with no email (pre-v6e rows) falls back to its session and
-- then to its own id, so it counts as exactly one voter and never as zero.
-- Internal: no grant, called only by the functions below.
create or replace function public.nomination_rank()
returns table (
  domain text,
  display_name text,
  voters int,
  noms int,
  first_at timestamptz,
  rank int
)
language sql
stable
security definer
set search_path = public
as $$
  with n as (
    select nm.domain,
           count(distinct coalesce(
             nullif(lower(btrim(nm.email)), ''),
             'cid:' || nullif(btrim(nm.client_id), ''),
             'sid:' || nm.session_id::text,
             'row:' || nm.id::text
           ))::int as voters,
           count(*)::int as noms,
           min(nm.created_at) as first_at
    from public.nominations nm
    group by nm.domain
  )
  select c.domain, c.display_name, n.voters, n.noms, n.first_at,
         (row_number() over (
            order by n.noms desc, n.voters desc, n.first_at asc nulls last, c.domain
          ))::int
  from n
  join public.companies c on c.domain = n.domain
  where c.status <> 'hidden';
$$;

-- The domains a Phase 2 ballot may name: the locked shortlist when one
-- exists, otherwise the live top 10. Internal; no grant.
create or replace function public.shortlist_domains()
returns table (domain text)
language sql
stable
security definer
set search_path = public
as $$
  select s.domain
  from public.shortlist s
  join public.companies c on c.domain = s.domain
  where c.status <> 'hidden' and c.merged_into is null
  union all
  select r.domain from public.nomination_rank() r
  where r.rank <= 10 and not exists (select 1 from public.shortlist);
$$;

-- Freeze the current ranking into public.shortlist. Clears first, so running
-- it twice simply re-locks against the ranking as it stands now.
create or replace function public.admin_lock_shortlist(p_limit int default 10)
returns table (
  domain text,
  display_name text,
  voters int,
  noms int,
  first_at timestamptz,
  rank int
)
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception '需要管理員權限。';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception '名單數量請介於 1 到 100。';
  end if;
  delete from public.shortlist;
  insert into public.shortlist (domain, rank)
  select r.domain, r.rank from public.nomination_rank() r where r.rank <= p_limit;
  return query
    select s.domain, c.display_name, nr.voters, nr.noms, nr.first_at, s.rank
    from public.shortlist s
    join public.companies c on c.domain = s.domain
    left join public.nomination_rank() nr on nr.domain = s.domain
    order by s.rank;
end;
$$;

-- The whole picture for /admin: every nominated company in ranking order,
-- flagged with whether it is in the shortlist, so the owner can see who just
-- missed out. `locked` is false while the shortlist is still live-computed.
create or replace function public.admin_shortlist()
returns table (
  domain text,
  display_name text,
  voters int,
  noms int,
  first_at timestamptz,
  rank int,
  in_shortlist boolean,
  shortlist_rank int,
  locked boolean,
  locked_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_locked boolean;
begin
  if not public.is_admin() then
    raise exception '需要管理員權限。';
  end if;
  v_locked := exists (select 1 from public.shortlist);
  return query
    with nr as (select * from public.nomination_rank()),
    live as (
      select d.domain from public.shortlist_domains() d
    ),
    r0 as (
      select nr.domain, nr.display_name, nr.voters, nr.noms, nr.first_at, nr.rank from nr
      union all
      -- a manually added company that currently has no nomination at all
      select s.domain, c.display_name, 0, 0, null::timestamptz, null::int
      from public.shortlist s
      join public.companies c on c.domain = s.domain
      where not exists (select 1 from nr where nr.domain = s.domain)
    )
    select r0.domain, r0.display_name, r0.voters, r0.noms, r0.first_at, r0.rank,
           exists (select 1 from live l where l.domain = r0.domain),
           sl.rank,
           v_locked,
           sl.locked_at
    from r0
    left join public.shortlist sl on sl.domain = r0.domain
    order by (sl.rank is null), sl.rank, r0.rank nulls last, r0.domain;
end;
$$;

-- Manual override. Ranks follow the array order; duplicates collapse to their
-- first position. An empty array clears the lock and hands Phase 2 back to
-- the live top 10.
create or replace function public.admin_set_shortlist(p_domains text[])
returns table (
  domain text,
  display_name text,
  voters int,
  noms int,
  first_at timestamptz,
  rank int
)
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception '需要管理員權限。';
  end if;
  if p_domains is null then
    raise exception '請提供名單。';
  end if;
  if coalesce(array_length(p_domains, 1), 0) > 100 then
    raise exception '名單最多 100 家公司。';
  end if;
  if exists (
    select 1 from unnest(p_domains) d
    where not exists (select 1 from public.companies c where c.domain = d)
  ) then
    raise exception '名單裡有不存在的公司。';
  end if;
  -- cast_ballot() and vote_candidates() both require a live, nominated
  -- company, so putting anything else on the list would show 入選 in /admin
  -- and then refuse the ballot with a confusing message.
  if exists (
    select 1 from unnest(p_domains) d
    where not exists (
      select 1 from public.companies c
      where c.domain = d and c.status <> 'hidden' and c.merged_into is null
        and exists (select 1 from public.nominations nm where nm.domain = c.domain)
    )
  ) then
    raise exception '名單裡有尚未被提名、已隱藏或已合併的公司。';
  end if;
  delete from public.shortlist;
  insert into public.shortlist (domain, rank)
  select u.d, (row_number() over (order by u.ord))::int
  from (
    select x.d, min(x.ord) as ord
    from unnest(p_domains) with ordinality as x(d, ord)
    group by x.d
  ) u;
  return query
    select s.domain, c.display_name, nr.voters, nr.noms, nr.first_at, s.rank
    from public.shortlist s
    join public.companies c on c.domain = s.domain
    left join public.nomination_rank() nr on nr.domain = s.domain
    order by s.rank;
end;
$$;

-- v6s: the Phase 2 suggestion box now only offers shortlisted companies.
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
    and exists (select 1 from public.shortlist_domains() sd where sd.domain = cv.domain)
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

-- v6s: a ballot may only name a shortlisted company.
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
    -- v6s: Phase 2 is fought over the shortlist only — the locked top 10, or
    -- (while nobody has locked one) the live top 10 by distinct nominators.
    if not exists (
      select 1 from public.shortlist_domains() sd where sd.domain = v_domain
    ) then
      raise exception '這家公司不在第二階段的前 10 名名單中。';
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

revoke all on function public.nomination_rank() from public, anon, authenticated;

revoke all on function public.shortlist_domains() from public, anon, authenticated;

revoke all on function public.admin_lock_shortlist(int) from public, anon, authenticated;

revoke all on function public.admin_shortlist() from public, anon, authenticated;

revoke all on function public.admin_set_shortlist(text[]) from public, anon, authenticated;

revoke all on function public.vote_candidates(text) from public, anon, authenticated;

revoke all on function public.cast_ballot(text, jsonb) from public, anon, authenticated;

grant execute on function public.admin_lock_shortlist(int) to authenticated;

grant execute on function public.admin_shortlist() to authenticated;

grant execute on function public.admin_set_shortlist(text[]) to authenticated;

grant execute on function public.vote_candidates(text) to anon, authenticated;

grant execute on function public.cast_ballot(text, jsonb) to anon, authenticated;

-- v6s: merging a company frees its shortlist slot. Same function as v7b
-- otherwise; re-stated here so this block stands on its own.
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
  -- v6s: the source company is now hidden, so a locked shortlist slot
  -- pointing at it would silently shrink Phase 2 to nine votable companies.
  delete from public.shortlist where domain = v_from.domain;
end;
$$;


-- END v6s

-- ===========================================================================
-- v6f — Phase 1 back to campaign memo v4.0: nominating needs nothing but a
-- company name. The owner reverted the v6r reason requirement and the v6e
-- email requirement: 「第一階段不用寫理由 也不用留信箱 直接提名就好」.
--
-- ADDITIVE ONLY. The currently deployed client still calls the 4-arg
-- nominate_company(domain, name, reason, email) with real values, so that
-- overload keeps validating a non-blank reason (10–50) and a non-blank email
-- exactly as before; it now also accepts null/blank for either and stores
-- null. A new 5-arg overload adds p_client_id, a per-browser id the new
-- client keeps in localStorage, so 「提名的人越多排名越前面」 still means
-- people rather than clicks when nobody leaves an email.
--
-- nomination_rank() therefore counts DISTINCT
-- coalesce(email, client_id, row id) instead of DISTINCT email; `noms` (the
-- raw row count) stays admin-only and unchanged.
-- BEGIN v6f
-- Apply statement by statement:  node scripts/apply-sql.mjs v6f
-- Idempotent: safe to run twice.
-- ===========================================================================

alter table public.nominations add column if not exists client_id text;

create index if not exists nominations_client_idx
  on public.nominations (client_id, created_at);

-- The full nomination path, now with an optional per-browser id. Identical to
-- v6n except that reason and email are optional (null/blank -> stored null,
-- checks skipped) and client_id is recorded when given.
create or replace function public.nominate_company(
  p_domain text,
  p_display_name text,
  p_reason text,
  p_email text,
  p_client_id text
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
  v_by_name boolean := btrim(coalesce(p_domain, '')) = '';
  v_domain text;
  v_name text := left(regexp_replace(btrim(coalesce(p_display_name, '')), '\s+', ' ', 'g'), 60);
  v_reason text := nullif(btrim(regexp_replace(coalesce(p_reason, ''), '\s+', ' ', 'g')), '');
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_client text := nullif(left(btrim(coalesce(p_client_id, '')), 64), '');
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
  -- v6f: a reason and an email are optional. A caller that still sends them
  -- (the deployed client) is held to exactly the old rules.
  if v_reason is not null and char_length(v_reason) not between 10 and 50 then
    raise exception '提名理由請寫 10 到 50 字。';
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception '請填寫正確的 Email。';
  end if;
  if v_by_name then
    v_domain := public.company_name_key(p_display_name);
    if v_domain is null then
      raise exception '請填寫公司名稱。';
    end if;
    v_name := btrim(regexp_replace(coalesce(p_display_name, ''), '\s+', ' ', 'g'));
  else
    v_domain := public.normalize_domain(p_domain);
    if not public.valid_domain(v_domain) then
      raise exception '請輸入正確的官方網站，例如 https://example.com';
    end if;
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
  if v_client is not null and (
    select count(*) from public.nominations n
    where n.client_id = v_client and n.created_at > now() - interval '1 hour'
  ) >= 40 then
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

  insert into public.nominations (domain, session_id, typed_name, reason, email, client_id)
  values (v_c.domain, v_uid, nullif(v_name, ''), v_reason, v_email, v_client);

  return json_build_object(
    'domain', v_c.domain,
    'display_name', v_c.display_name,
    'aliases', to_json(v_c.aliases),
    'ok', true
  );
end;
$$;

-- The 4-arg overload the deployed client calls is now a thin wrapper, so the
-- two versions can never drift apart.
create or replace function public.nominate_company(
  p_domain text,
  p_display_name text,
  p_reason text,
  p_email text
)
returns json
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  return public.nominate_company(p_domain, p_display_name, p_reason, p_email, null::text);
end;
$$;

-- v6f ranking: one nominator = one distinct email, else one distinct browser
-- (client_id), else one row. Keeps 「提名的人越多排名越前面」 honest without an
-- email, while a single browser nominating the same company ten times counts
-- once. `noms` stays the raw row count, for /admin only.
create or replace function public.nomination_rank()
returns table (
  domain text,
  display_name text,
  voters int,
  noms int,
  first_at timestamptz,
  rank int
)
language sql
stable
security definer
set search_path = public
as $$
  with n as (
    select nm.domain,
           count(distinct coalesce(
             nullif(lower(btrim(nm.email)), ''),
             'cid:' || nullif(btrim(nm.client_id), ''),
             'row:' || nm.id::text
           ))::int as voters,
           count(*)::int as noms,
           min(nm.created_at) as first_at
    from public.nominations nm
    group by nm.domain
  )
  select c.domain, c.display_name, n.voters, n.noms, n.first_at,
         (row_number() over (
            order by n.voters desc, n.first_at asc nulls last, c.domain
          ))::int
  from n
  join public.companies c on c.domain = n.domain
  where c.status <> 'hidden';
$$;

-- Admin: nominations with the (now legacy) reason and email, plus the browser
-- id, so the owner can see one device nominating many companies. Dropped and
-- recreated because CREATE OR REPLACE cannot append a RETURNS TABLE column.
drop function if exists public.admin_nominations(text);

create function public.admin_nominations(p_domain text default null)
returns table (
  id bigint,
  domain text,
  display_name text,
  reason text,
  typed_name text,
  email text,
  client_id text,
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
    select nm.id, nm.domain, c.display_name, nm.reason, nm.typed_name,
           nm.email, nm.client_id, nm.created_at
    from public.nominations nm
    left join public.companies c on c.domain = nm.domain
    where p_domain is null or nm.domain = p_domain
    order by nm.created_at desc, nm.id desc;
end;
$$;

revoke all on function public.nominate_company(text, text, text, text) from public, anon, authenticated;

revoke all on function public.nominate_company(text, text, text, text, text) from public, anon, authenticated;

revoke all on function public.nomination_rank() from public, anon, authenticated;

revoke all on function public.admin_nominations(text) from public, anon, authenticated;

grant execute on function public.nominate_company(text, text, text, text) to anon, authenticated;

grant execute on function public.nominate_company(text, text, text, text, text) to anon, authenticated;

grant execute on function public.admin_nominations(text) to authenticated;

-- END v6f

-- BEGIN v6g
-- Ranking follows raw nomination count (owner's rule: 被提名越多次，排名越前面).
create or replace function public.nomination_rank()
returns table (
  domain text,
  display_name text,
  voters int,
  noms int,
  first_at timestamptz,
  rank int
)
language sql
stable
security definer
set search_path = public
as $$
  with n as (
    select nm.domain,
           count(distinct coalesce(
             nullif(lower(btrim(nm.email)), ''),
             'cid:' || nullif(btrim(nm.client_id), ''),
             'sid:' || nm.session_id::text,
             'row:' || nm.id::text
           ))::int as voters,
           count(*)::int as noms,
           min(nm.created_at) as first_at
    from public.nominations nm
    group by nm.domain
  )
  select c.domain, c.display_name, n.voters, n.noms, n.first_at,
         (row_number() over (
            order by n.noms desc, n.voters desc, n.first_at asc nulls last, c.domain
          ))::int
  from n
  join public.companies c on c.domain = n.domain
  where c.status <> 'hidden';
$$;
-- END v6g

-- BEGIN v6h
-- Live ranking: the board ranks from nominations as they arrive; snapshots only
-- drive the movement arrows (owner, 2026-09-16).
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
  v_live_top int;
begin
  if coalesce((select max(taken_at) from public.board_snapshots), '-infinity'::timestamptz)
     < now() - interval '60 minutes' then
    perform public.take_board_snapshot();
  end if;

  select max(taken_at) into v_latest from public.board_snapshots;
  select max(n) into v_live_top from (
    select count(*) as n
    from public.nominations nm
    join public.companies c on c.domain = nm.domain
    where c.status <> 'hidden' and c.merged_into is null
    group by c.domain
  ) t;
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
        select l.domain, l.display_name, l.rank,
               greatest(0.05, round(l.n::numeric * 20 / nullif(v_live_top, 0)) / 20)::float8 as share,
               case
                 when v_latest is null or p.rank is null then 'new'
                 when p.rank > l.rank then 'up'
                 when p.rank < l.rank then 'down'
                 else 'same'
               end as movement
        from (
          select c.domain, c.display_name, count(*)::int as n,
                 (row_number() over (order by count(*) desc, min(nm.created_at) asc, c.domain))::int as rank
          from public.nominations nm
          join public.companies c on c.domain = nm.domain
          where c.status <> 'hidden' and c.merged_into is null
          group by c.domain, c.display_name
        ) l
        left join public.board_snapshots p on p.taken_at = v_latest and p.domain = l.domain
        order by l.rank
        limit 60
      ) h
    ), '[]'::json),
    'updated_at', now(),
    'snapshot_at', v_latest
  );
end;
$$;
-- END v6h

-- v7c — Phase 2 voting without a mandatory shortlist (SPEC-v7-phase2.md,
-- campaign memo v4.0). Memo v4.0 never defines a shortlist for Phase 2, and
-- Phase 1 (memo v4.0 §4) collects only nominations — no reasons — so a
-- Phase 2 voter must be able to pick a company nobody nominated. Picking one
-- now creates the company and a nomination row, exactly like Phase 1's
-- nominate_company. The v6s shortlist becomes advisory, gated by a new
-- settings.shortlist_enforced flag that defaults to OFF; an admin can turn
-- it back on with admin_set_shortlist_enforced(true). BEGIN v7c
-- Apply statement by statement:  node scripts/apply-sql.mjs v7c
-- Idempotent: safe to run twice.
-- ===========================================================================

alter table public.settings add column if not exists shortlist_enforced boolean
  not null default false;

-- Internal: is the v6s shortlist currently gating Phase 2 ballots? Off by
-- default per campaign memo v4.0, which defines no shortlist for Phase 2.
create or replace function public.shortlist_is_enforced()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select s.shortlist_enforced from public.settings s where s.id = 1), false);
$$;

revoke all on function public.shortlist_is_enforced() from public, anon, authenticated;

-- Internal: resolve (creating if necessary) the company a Phase 2 pick
-- names, and make sure it has a nomination row, mirroring nominate_company's
-- domain normalization, name: pseudo-domain fallback, merged_into chain
-- following, and companies/nominations inserts. Returns the canonical
-- domain. Called only from cast_ballot(); never reachable by anon/authenticated
-- directly.
create or replace function public.ensure_vote_company(
  p_domain text,
  p_name text,
  p_email text,
  p_client_id text
)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_in text := btrim(coalesce(p_domain, ''));
  v_name text := left(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'), 60);
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_client text := nullif(left(btrim(coalesce(p_client_id, '')), 64), '');
  v_domain text;
  v_c public.companies;
  v_hops int := 0;
begin
  if v_in <> '' then
    v_domain := public.normalize_domain(v_in);
    -- A freshly typed website must look like a real domain. But the
    -- `domain` field of an existing ballot pick may instead be an existing
    -- candidate's own canonical key (including a `name:` pseudo-domain,
    -- which valid_domain() rejects by design) — e.g. vote_candidates()
    -- hands that key straight back to the client. Accept it too when it
    -- already names a company, so picking an existing name:-only candidate
    -- (v6n) keeps working exactly as it did before v7c.
    if v_domain is null or (
      not public.valid_domain(v_domain)
      and not exists (select 1 from public.companies c where c.domain = v_domain)
    ) then
      raise exception '請輸入正確的官方網站，例如 https://example.com';
    end if;
  else
    -- No domain/site given — mirror nominate_company's name-only path.
    -- company_name_key() already returns the 'name:' prefixed key.
    v_domain := public.company_name_key(p_name);
    if v_domain is null then
      raise exception '找不到這家公司。';
    end if;
  end if;

  select * into v_c from public.companies c where c.domain = v_domain;
  while v_c.merged_into is not null and v_hops < 5 loop
    select * into v_c from public.companies c where c.domain = v_c.merged_into;
    v_hops := v_hops + 1;
  end loop;

  if v_c.domain is null then
    if v_name = '' then
      raise exception '找不到這家公司。';
    end if;
    insert into public.companies (domain, display_name, status)
    values (v_domain, v_name, 'pending')
    on conflict (domain) do nothing;
    select * into v_c from public.companies c where c.domain = v_domain;
  end if;

  if not exists (select 1 from public.nominations n where n.domain = v_c.domain) then
    insert into public.nominations (domain, session_id, typed_name, reason, email, client_id)
    values (v_c.domain, auth.uid(), nullif(v_name, ''), null, v_email, v_client);
  end if;

  return v_c.domain;
end;
$$;

revoke all on function public.ensure_vote_company(text, text, text, text) from public, anon, authenticated;

-- The full Phase 2 ballot, now able to name a company nobody nominated yet.
-- Body is the v6s cast_ballot(text, jsonb) at schema.sql (v6s block) with two
-- changes: (a) each pick may carry domain/name/site/reason and is resolved
-- via ensure_vote_company() instead of requiring a pre-existing candidate;
-- (b) the shortlist gate only applies when shortlist_is_enforced() is true.
-- Every other rule — email format, phase/tester gate, 1-3 picks, the max-3
-- message, distinct domains, one ballot per Asia/Taipei day (plus the
-- unique_violation catch), and the returned jsonb shape — is unchanged.
create or replace function public.cast_ballot(p_email text, p_picks jsonb, p_client_id text)
returns jsonb
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
  v_in text;
  v_name text;
  v_domain text;
  v_reason text;
  v_domains text[] := '{}';
  v_reasons text[] := '{}';
  v_ballot_id bigint;
  v_pick_id bigint;
  v_out jsonb := '[]'::jsonb;
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
    v_reason := btrim(regexp_replace(coalesce(v_item ->> 'reason', ''), '\s+', ' ', 'g'));
    if char_length(v_reason) < 10 or char_length(v_reason) > 50 then
      raise exception '每家公司的理由需要 10–50 個字。';
    end if;
    -- v7c: campaign memo v4.0 does not define a shortlist for Phase 2, and
    -- Phase 1 collected only nominations (no reasons), so a Phase 2 voter
    -- must be able to vote for a company nobody nominated — picking it
    -- creates the company and a nomination row, exactly like Phase 1 does.
    -- The reason check above always runs first, so a rejected pick never
    -- creates a company.
    v_in := coalesce(nullif(btrim(v_item ->> 'domain'), ''), nullif(btrim(v_item ->> 'site'), ''));
    v_name := nullif(btrim(v_item ->> 'name'), '');
    v_domain := public.ensure_vote_company(v_in, v_name, v_email, p_client_id);
    if v_domain = any (v_domains) then
      raise exception '同一家公司只能選一次。';
    end if;
    -- v7c: campaign memo v4.0 does not define a shortlist for Phase 2; the
    -- gate is advisory and off by default.
    if public.shortlist_is_enforced() then
      if not exists (
        select 1 from public.shortlist_domains() sd where sd.domain = v_domain
      ) then
        raise exception '這家公司不在第二階段的前 10 名名單中。';
      end if;
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
    v_out := v_out || jsonb_build_array(jsonb_build_object('pick_id', v_pick_id, 'domain', v_domains[i]));
  end loop;

  return jsonb_build_object(
    'ballot_id', v_ballot_id,
    'ballot_date', to_char(v_today, 'YYYY-MM-DD'),
    'picks', v_out
  );
end;
$$;

-- The 2-arg overload changes return type (json -> jsonb) so it must be
-- dropped before it can be replaced; the 3-arg version above stays put.
drop function if exists public.cast_ballot(text, jsonb);

-- Thin wrapper so the CURRENTLY DEPLOYED client (which calls the 2-arg form)
-- keeps working unchanged.
create or replace function public.cast_ballot(p_email text, p_picks jsonb)
returns jsonb
language sql
volatile
security definer
set search_path = public
as $$
  select public.cast_ballot(p_email, p_picks, null::text);
$$;

grant execute on function public.cast_ballot(text, jsonb, text) to anon, authenticated;

grant execute on function public.cast_ballot(text, jsonb) to anon, authenticated;

-- v7c: the Phase 2 suggestion box only restricts to the shortlist while the
-- gate is enforced; otherwise every live candidate is offered (mirrors Phase
-- 1's open nomination search).
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
  -- v7d: with the gate off (memo v4.0's default) a voter may pick ANY company
  -- we know of, seeds included, exactly like nominating; the gate narrows the
  -- list to the shortlist when an admin turns it on.
  where (
      case when public.shortlist_is_enforced()
        then exists (select 1 from public.shortlist_domains() sd where sd.domain = cv.domain)
        else true
      end)
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

grant execute on function public.vote_candidates(text) to anon, authenticated;

-- Admin toggle for the (now advisory, off-by-default) shortlist gate.
create or replace function public.admin_set_shortlist_enforced(p_enabled boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception '需要管理員權限。';
  end if;
  update public.settings set shortlist_enforced = coalesce(p_enabled, false) where id = 1;
  return jsonb_build_object('shortlist_enforced', coalesce(p_enabled, false));
end;
$$;

grant execute on function public.admin_set_shortlist_enforced(boolean) to authenticated;

-- admin_shortlist() gains one new key (shortlist_enforced) on every row, so
-- its return type changes and it must be dropped before being replaced.
drop function if exists public.admin_shortlist();

create or replace function public.admin_shortlist()
returns table (
  domain text,
  display_name text,
  voters int,
  noms int,
  first_at timestamptz,
  rank int,
  in_shortlist boolean,
  shortlist_rank int,
  locked boolean,
  locked_at timestamptz,
  shortlist_enforced boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_locked boolean;
  v_enforced boolean;
begin
  if not public.is_admin() then
    raise exception '需要管理員權限。';
  end if;
  v_locked := exists (select 1 from public.shortlist);
  v_enforced := public.shortlist_is_enforced();
  return query
    with nr as (select * from public.nomination_rank()),
    live as (
      select d.domain from public.shortlist_domains() d
    ),
    r0 as (
      select nr.domain, nr.display_name, nr.voters, nr.noms, nr.first_at, nr.rank from nr
      union all
      -- a manually added company that currently has no nomination at all
      select s.domain, c.display_name, 0, 0, null::timestamptz, null::int
      from public.shortlist s
      join public.companies c on c.domain = s.domain
      where not exists (select 1 from nr where nr.domain = s.domain)
    )
    select r0.domain, r0.display_name, r0.voters, r0.noms, r0.first_at, r0.rank,
           exists (select 1 from live l where l.domain = r0.domain),
           sl.rank,
           v_locked,
           sl.locked_at,
           v_enforced
    from r0
    left join public.shortlist sl on sl.domain = r0.domain
    order by (sl.rank is null), sl.rank, r0.rank nulls last, r0.domain;
end;
$$;

revoke all on function public.admin_shortlist() from public, anon, authenticated;

grant execute on function public.admin_shortlist() to authenticated;

-- END v7c

-- BEGIN v7d
-- Ballot search covers every known company while the shortlist gate is off.
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
  -- v7d: with the gate off (memo v4.0's default) a voter may pick ANY company
  -- we know of, seeds included, exactly like nominating; the gate narrows the
  -- list to the shortlist when an admin turns it on.
  where (
      case when public.shortlist_is_enforced()
        then exists (select 1 from public.shortlist_domains() sd where sd.domain = cv.domain)
        else true
      end)
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
grant execute on function public.vote_candidates(text) to anon, authenticated;
-- END v7d

-- BEGIN v7e
-- vote_board also reports the like/dislike totals behind Community Resonance.
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
      -- v7f: a company that received a ballot belongs on the leaderboard even
      -- if its Phase 1 nomination rows were merged or removed.
      select * from public.company_votes() x where x.is_candidate or x.picks > 0
    ),
    rr as (
      select * from public.reason_rows()
    )
    select json_build_object(
      'total_votes', coalesce((select sum(cv.votes) from cv), 0)::int,
      'total_reasons', coalesce((select sum(cv.reasons) from cv), 0)::int,
      'total_voters', (select count(distinct b.email_key) from public.ballots b where not b.voided)::int,
      -- v7e: Community Resonance — how much the crowd pushed back on the reasons.
      'total_likes', (select count(*) from public.reason_reactions rx
                        join public.ballot_picks bp on bp.id = rx.pick_id
                        join public.ballots bl on bl.id = bp.ballot_id
                       where rx.value = 1 and not bp.hidden and not bl.voided)::int,
      'total_dislikes', (select count(*) from public.reason_reactions rx
                        join public.ballot_picks bp on bp.id = rx.pick_id
                        join public.ballots bl on bl.id = bp.ballot_id
                       where rx.value = -1 and not bp.hidden and not bl.voided)::int,
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
grant execute on function public.vote_board() to anon, authenticated;
-- END v7e

-- BEGIN v7f
-- Leaderboard covers everything with a ballot pick.
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
      -- v7f: a company that received a ballot belongs on the leaderboard even
      -- if its Phase 1 nomination rows were merged or removed.
      select * from public.company_votes() x where x.is_candidate or x.picks > 0
    ),
    rr as (
      select * from public.reason_rows()
    )
    select json_build_object(
      'total_votes', coalesce((select sum(cv.votes) from cv), 0)::int,
      'total_reasons', coalesce((select sum(cv.reasons) from cv), 0)::int,
      'total_voters', (select count(distinct b.email_key) from public.ballots b where not b.voided)::int,
      -- v7e: Community Resonance — how much the crowd pushed back on the reasons.
      'total_likes', (select count(*) from public.reason_reactions rx
                        join public.ballot_picks bp on bp.id = rx.pick_id
                        join public.ballots bl on bl.id = bp.ballot_id
                       where rx.value = 1 and not bp.hidden and not bl.voided)::int,
      'total_dislikes', (select count(*) from public.reason_reactions rx
                        join public.ballot_picks bp on bp.id = rx.pick_id
                        join public.ballots bl on bl.id = bp.ballot_id
                       where rx.value = -1 and not bp.hidden and not bl.voided)::int,
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
          -- v7f: rank over the rows we actually show, so companies with ballots
          -- but no Phase 1 nomination still get a number.
          select (row_number() over (order by cv.votes desc, cv.reasons desc, cv.domain))::int as rank,
                 cv.domain, cv.display_name, cv.votes, cv.reasons,
                 case
                   when v_base is null or ls.rank is null then 'new'
                   when ls.rank > (row_number() over (order by cv.votes desc, cv.reasons desc, cv.domain))::int then 'up'
                   when ls.rank < (row_number() over (order by cv.votes desc, cv.reasons desc, cv.domain))::int then 'down'
                   else 'same'
                 end as movement
          from cv
          left join public.leaderboard_snapshots ls on ls.taken_at = v_base and ls.domain = cv.domain
          order by cv.votes desc, cv.reasons desc, cv.domain
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
grant execute on function public.vote_board() to anon, authenticated;
-- END v7f

-- BEGIN v7g
-- Leaderboard numbers every row it shows.
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
      -- v7f: a company that received a ballot belongs on the leaderboard even
      -- if its Phase 1 nomination rows were merged or removed.
      select * from public.company_votes() x where x.is_candidate or x.picks > 0
    ),
    rr as (
      select * from public.reason_rows()
    )
    select json_build_object(
      'total_votes', coalesce((select sum(cv.votes) from cv), 0)::int,
      'total_reasons', coalesce((select sum(cv.reasons) from cv), 0)::int,
      'total_voters', (select count(distinct b.email_key) from public.ballots b where not b.voided)::int,
      -- v7e: Community Resonance — how much the crowd pushed back on the reasons.
      'total_likes', (select count(*) from public.reason_reactions rx
                        join public.ballot_picks bp on bp.id = rx.pick_id
                        join public.ballots bl on bl.id = bp.ballot_id
                       where rx.value = 1 and not bp.hidden and not bl.voided)::int,
      'total_dislikes', (select count(*) from public.reason_reactions rx
                        join public.ballot_picks bp on bp.id = rx.pick_id
                        join public.ballots bl on bl.id = bp.ballot_id
                       where rx.value = -1 and not bp.hidden and not bl.voided)::int,
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
          -- v7f: rank over the rows we actually show, so companies with ballots
          -- but no Phase 1 nomination still get a number.
          select (row_number() over (order by cv.votes desc, cv.reasons desc, cv.domain))::int as rank,
                 cv.domain, cv.display_name, cv.votes, cv.reasons,
                 case
                   when v_base is null or ls.rank is null then 'new'
                   when ls.rank > (row_number() over (order by cv.votes desc, cv.reasons desc, cv.domain))::int then 'up'
                   when ls.rank < (row_number() over (order by cv.votes desc, cv.reasons desc, cv.domain))::int then 'down'
                   else 'same'
                 end as movement
          from cv
          left join public.leaderboard_snapshots ls on ls.taken_at = v_base and ls.domain = cv.domain
          order by cv.votes desc, cv.reasons desc, cv.domain
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
      -- v7h: Community Resonance (memo v4.0 p.3) — which companies and which
      -- single reasons the crowd actually backed, and where it split.
      'resonance', coalesce((
        select json_agg(json_build_object(
                 'domain', x.domain, 'display_name', x.display_name,
                 'likes', x.likes, 'dislikes', x.dislikes, 'net', x.likes - x.dislikes)
               order by (x.likes - x.dislikes) desc, x.likes desc)
        from (
          select cv.domain, cv.display_name,
                 coalesce(sum(rr.likes), 0)::int as likes,
                 coalesce(sum(rr.dislikes), 0)::int as dislikes
          from cv left join rr on rr.domain = cv.domain
          group by cv.domain, cv.display_name
          having coalesce(sum(rr.likes), 0) + coalesce(sum(rr.dislikes), 0) > 0
          order by (coalesce(sum(rr.likes), 0) - coalesce(sum(rr.dislikes), 0)) desc
          limit 8
        ) x
      ), '[]'::json),
      'divisive', coalesce((
        select json_agg(json_build_object(
                 'pick_id', y.pick_id, 'domain', y.domain, 'display_name', y.display_name,
                 'reason', y.reason, 'likes', y.likes, 'dislikes', y.dislikes)
               order by least(y.likes, y.dislikes) desc, y.dislikes desc)
        from (
          select rr.pick_id, rr.domain, rr.display_name, rr.reason, rr.likes, rr.dislikes
          from rr
          where rr.dislikes > 0
          order by least(rr.likes, rr.dislikes) desc, rr.dislikes desc
          limit 3
        ) y
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
grant execute on function public.vote_board() to anon, authenticated;
-- END v7g

-- BEGIN v7h
-- vote_board reports per-company resonance and the most divisive reasons.
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
      -- v7f: a company that received a ballot belongs on the leaderboard even
      -- if its Phase 1 nomination rows were merged or removed.
      select * from public.company_votes() x where x.is_candidate or x.picks > 0
    ),
    rr as (
      select * from public.reason_rows()
    )
    select json_build_object(
      'total_votes', coalesce((select sum(cv.votes) from cv), 0)::int,
      'total_reasons', coalesce((select sum(cv.reasons) from cv), 0)::int,
      'total_voters', (select count(distinct b.email_key) from public.ballots b where not b.voided)::int,
      -- v7e: Community Resonance — how much the crowd pushed back on the reasons.
      'total_likes', (select count(*) from public.reason_reactions rx
                        join public.ballot_picks bp on bp.id = rx.pick_id
                        join public.ballots bl on bl.id = bp.ballot_id
                       where rx.value = 1 and not bp.hidden and not bl.voided)::int,
      'total_dislikes', (select count(*) from public.reason_reactions rx
                        join public.ballot_picks bp on bp.id = rx.pick_id
                        join public.ballots bl on bl.id = bp.ballot_id
                       where rx.value = -1 and not bp.hidden and not bl.voided)::int,
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
          -- v7f: rank over the rows we actually show, so companies with ballots
          -- but no Phase 1 nomination still get a number.
          select (row_number() over (order by cv.votes desc, cv.reasons desc, cv.domain))::int as rank,
                 cv.domain, cv.display_name, cv.votes, cv.reasons,
                 case
                   when v_base is null or ls.rank is null then 'new'
                   when ls.rank > (row_number() over (order by cv.votes desc, cv.reasons desc, cv.domain))::int then 'up'
                   when ls.rank < (row_number() over (order by cv.votes desc, cv.reasons desc, cv.domain))::int then 'down'
                   else 'same'
                 end as movement
          from cv
          left join public.leaderboard_snapshots ls on ls.taken_at = v_base and ls.domain = cv.domain
          order by cv.votes desc, cv.reasons desc, cv.domain
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
      -- v7h: Community Resonance (memo v4.0 p.3) — which companies and which
      -- single reasons the crowd actually backed, and where it split.
      'resonance', coalesce((
        select json_agg(json_build_object(
                 'domain', x.domain, 'display_name', x.display_name,
                 'likes', x.likes, 'dislikes', x.dislikes, 'net', x.likes - x.dislikes)
               order by (x.likes - x.dislikes) desc, x.likes desc)
        from (
          select cv.domain, cv.display_name,
                 coalesce(sum(rr.likes), 0)::int as likes,
                 coalesce(sum(rr.dislikes), 0)::int as dislikes
          from cv left join rr on rr.domain = cv.domain
          group by cv.domain, cv.display_name
          having coalesce(sum(rr.likes), 0) + coalesce(sum(rr.dislikes), 0) > 0
          order by (coalesce(sum(rr.likes), 0) - coalesce(sum(rr.dislikes), 0)) desc
          limit 8
        ) x
      ), '[]'::json),
      'divisive', coalesce((
        select json_agg(json_build_object(
                 'pick_id', y.pick_id, 'domain', y.domain, 'display_name', y.display_name,
                 'reason', y.reason, 'likes', y.likes, 'dislikes', y.dislikes)
               order by least(y.likes, y.dislikes) desc, y.dislikes desc)
        from (
          select rr.pick_id, rr.domain, rr.display_name, rr.reason, rr.likes, rr.dislikes
          from rr
          where rr.dislikes > 0
          order by least(rr.likes, rr.dislikes) desc, rr.dislikes desc
          limit 3
        ) y
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
grant execute on function public.vote_board() to anon, authenticated;
-- END v7h

-- BEGIN v6i
-- The board returns up to 60 companies; the page decides how many to show.
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
  v_live_top int;
begin
  if coalesce((select max(taken_at) from public.board_snapshots), '-infinity'::timestamptz)
     < now() - interval '60 minutes' then
    perform public.take_board_snapshot();
  end if;

  select max(taken_at) into v_latest from public.board_snapshots;
  select max(n) into v_live_top from (
    select count(*) as n
    from public.nominations nm
    join public.companies c on c.domain = nm.domain
    where c.status <> 'hidden' and c.merged_into is null
    group by c.domain
  ) t;
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
        select l.domain, l.display_name, l.rank,
               greatest(0.05, round(l.n::numeric * 20 / nullif(v_live_top, 0)) / 20)::float8 as share,
               case
                 when v_latest is null or p.rank is null then 'new'
                 when p.rank > l.rank then 'up'
                 when p.rank < l.rank then 'down'
                 else 'same'
               end as movement
        from (
          select c.domain, c.display_name, count(*)::int as n,
                 (row_number() over (order by count(*) desc, min(nm.created_at) asc, c.domain))::int as rank
          from public.nominations nm
          join public.companies c on c.domain = nm.domain
          where c.status <> 'hidden' and c.merged_into is null
          group by c.domain, c.display_name
        ) l
        left join public.board_snapshots p on p.taken_at = v_latest and p.domain = l.domain
        order by l.rank
        limit 500
      ) h
    ), '[]'::json),
    'updated_at', now(),
    'snapshot_at', v_latest
  );
end;
$$;
grant execute on function public.board() to anon, authenticated;
-- END v6i

-- BEGIN v6j
-- Every nominated company reaches the board.
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
  v_live_top int;
begin
  if coalesce((select max(taken_at) from public.board_snapshots), '-infinity'::timestamptz)
     < now() - interval '60 minutes' then
    perform public.take_board_snapshot();
  end if;

  select max(taken_at) into v_latest from public.board_snapshots;
  select max(n) into v_live_top from (
    select count(*) as n
    from public.nominations nm
    join public.companies c on c.domain = nm.domain
    where c.status <> 'hidden' and c.merged_into is null
    group by c.domain
  ) t;
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
               'movement', h.movement,
               'noms', h.n,
               'sector', h.sector,
               'listing', h.listing
             ) order by h.rank)
      from (
        select l.domain, l.display_name, l.rank, l.n, l.sector, l.listing,
               greatest(0.05, round(l.n::numeric * 20 / nullif(v_live_top, 0)) / 20)::float8 as share,
               case
                 when v_latest is null or p.rank is null then 'new'
                 when p.rank > l.rank then 'up'
                 when p.rank < l.rank then 'down'
                 else 'same'
               end as movement
        from (
          select c.domain, c.display_name,
                 coalesce(nullif(btrim(c.sector), ''), '未分類') as sector,
                 coalesce(nullif(btrim(c.listing), ''), 'unknown') as listing,
                 count(*)::int as n,
                 (row_number() over (order by count(*) desc, min(nm.created_at) asc, c.domain))::int as rank
          from public.nominations nm
          join public.companies c on c.domain = nm.domain
          where c.status <> 'hidden' and c.merged_into is null
          group by c.domain, c.display_name, c.sector, c.listing
        ) l
        left join public.board_snapshots p on p.taken_at = v_latest and p.domain = l.domain
        order by l.rank
        limit 500
      ) h
    ), '[]'::json),
    'updated_at', now(),
    'snapshot_at', v_latest
  );
end;
$$;
grant execute on function public.board() to anon, authenticated;
-- END v6j

-- BEGIN v6k
-- Classification for the nomination board: sector and listing status, plus the
-- raw nomination count, so the page can draw proportions (owner, 2026-09-23).
alter table public.companies add column if not exists sector text;
alter table public.companies add column if not exists listing text;
alter table public.companies add column if not exists ticker text;
alter table public.companies drop constraint if exists companies_listing_check;
alter table public.companies add constraint companies_listing_check
  check (listing is null or listing in ('listed','private','subsidiary','unknown')) not valid;
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
  v_live_top int;
begin
  if coalesce((select max(taken_at) from public.board_snapshots), '-infinity'::timestamptz)
     < now() - interval '60 minutes' then
    perform public.take_board_snapshot();
  end if;

  select max(taken_at) into v_latest from public.board_snapshots;
  select max(n) into v_live_top from (
    select count(*) as n
    from public.nominations nm
    join public.companies c on c.domain = nm.domain
    where c.status <> 'hidden' and c.merged_into is null
    group by c.domain
  ) t;
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
               'movement', h.movement,
               'noms', h.n,
               'sector', h.sector,
               'listing', h.listing,
               'first_at', h.first_at
             ) order by h.first_at desc)
      from (
        select l.domain, l.display_name, l.rank, l.n, l.sector, l.listing, l.first_at,
               greatest(0.05, round(l.n::numeric * 20 / nullif(v_live_top, 0)) / 20)::float8 as share,
               case
                 when v_latest is null or p.rank is null then 'new'
                 when p.rank > l.rank then 'up'
                 when p.rank < l.rank then 'down'
                 else 'same'
               end as movement
        from (
          select c.domain, c.display_name,
                 coalesce(nullif(btrim(c.sector), ''), '未分類') as sector,
                 coalesce(nullif(btrim(c.listing), ''), 'unknown') as listing,
                 count(*)::int as n,
                 min(nm.created_at) as first_at,
                 (row_number() over (order by count(*) desc, min(nm.created_at) asc, c.domain))::int as rank
          from public.nominations nm
          join public.companies c on c.domain = nm.domain
          where c.status <> 'hidden' and c.merged_into is null
          group by c.domain, c.display_name, c.sector, c.listing
        ) l
        left join public.board_snapshots p on p.taken_at = v_latest and p.domain = l.domain
        order by l.first_at desc
        limit 500
      ) h
    ), '[]'::json),
    'updated_at', now(),
    'snapshot_at', v_latest
  );
end;
$$;
grant execute on function public.board() to anon, authenticated;
-- END v6k

-- BEGIN v6m
-- Phase 1 presentation is a nomination feed, not a contest (CEO note,
-- 2026-09-24): the public list is ordered by first nomination, newest first;
-- counts stay as context only. needs_review flags eligibility questions.
alter table public.companies add column if not exists needs_review boolean not null default false;
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
  v_live_top int;
begin
  if coalesce((select max(taken_at) from public.board_snapshots), '-infinity'::timestamptz)
     < now() - interval '60 minutes' then
    perform public.take_board_snapshot();
  end if;

  select max(taken_at) into v_latest from public.board_snapshots;
  select max(n) into v_live_top from (
    select count(*) as n
    from public.nominations nm
    join public.companies c on c.domain = nm.domain
    where c.status <> 'hidden' and c.merged_into is null
    group by c.domain
  ) t;
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
               'movement', h.movement,
               'noms', h.n,
               'sector', h.sector,
               'listing', h.listing,
               'first_at', h.first_at
             ) order by h.first_at desc)
      from (
        select l.domain, l.display_name, l.rank, l.n, l.sector, l.listing, l.first_at,
               greatest(0.05, round(l.n::numeric * 20 / nullif(v_live_top, 0)) / 20)::float8 as share,
               case
                 when v_latest is null or p.rank is null then 'new'
                 when p.rank > l.rank then 'up'
                 when p.rank < l.rank then 'down'
                 else 'same'
               end as movement
        from (
          select c.domain, c.display_name,
                 coalesce(nullif(btrim(c.sector), ''), '未分類') as sector,
                 coalesce(nullif(btrim(c.listing), ''), 'unknown') as listing,
                 count(*)::int as n,
                 min(nm.created_at) as first_at,
                 (row_number() over (order by count(*) desc, min(nm.created_at) asc, c.domain))::int as rank
          from public.nominations nm
          join public.companies c on c.domain = nm.domain
          where c.status <> 'hidden' and c.merged_into is null
          group by c.domain, c.display_name, c.sector, c.listing
        ) l
        left join public.board_snapshots p on p.taken_at = v_latest and p.domain = l.domain
        order by l.first_at desc
        limit 500
      ) h
    ), '[]'::json),
    'updated_at', now(),
    'snapshot_at', v_latest
  );
end;
$$;
grant execute on function public.board() to anon, authenticated;
-- END v6m

-- BEGIN v7i-entity
-- Entity audit 2026-09-24 (Reference/entity-audit.csv, each row verified against the
-- company's own site): a nominee is a COMPANY; a product is an alias of its company.
-- Product rows are merged into the company entity, scraped page titles are cleaned,
-- and nominees whose eligibility a human must judge are flagged (never deleted).

insert into public.companies (domain, display_name, aliases, status, is_seed, sector, listing)
select 'kkcompany.com', 'KKCompany 科科科技',
       array['KKCompany','科科科技','KKCompany Technologies','KKBOX','BlendVision','KKStream','KKCompany Japan合同会社','ブレンドビジョン'],
       'active', true, c.sector, c.listing
  from public.companies c where c.domain = 'blendvision.com'
on conflict (domain) do nothing;

insert into public.companies (domain, display_name, aliases, status, is_seed, sector, listing)
select '25sprout.com', '25sprout 新芽網路',
       array['25sprout','新芽網路','新芽網路股份有限公司','SurveyCake','SurveyCake問卷','サーベイケーキ株式会社'],
       'active', true, c.sector, c.listing
  from public.companies c where c.domain = 'surveycake.com'
on conflict (domain) do nothing;

insert into public.companies (domain, display_name, aliases, status, is_seed, needs_review)
values ('name:哇美語文理技藝短期補習班', '哇美語文理技藝短期補習班', array['哇美語'], 'active', false, true)
on conflict (domain) do nothing;

do $$
declare m record;
begin
  for m in select * from (values
      ('blendvision.com', 'kkcompany.com'),
      ('surveycake.com',  '25sprout.com'),
      ('facebook.com',    'name:哇美語文理技藝短期補習班')
    ) as t(src, dst)
  loop
    if not exists (select 1 from public.companies where domain = m.dst)
       or not exists (select 1 from public.companies where domain = m.src) then
      continue;
    end if;
    update public.nominations set domain = m.dst where domain = m.src;
    update public.ballot_picks p set domain = m.dst
      where p.domain = m.src
        and not exists (select 1 from public.ballot_picks q
                         where q.ballot_id = p.ballot_id and q.domain = m.dst);
    delete from public.ballot_picks where domain = m.src;
    update public.companies dst
       set aliases = (select array(select distinct e
                                     from unnest(dst.aliases || src.aliases
                                                 || array[src.display_name, src.domain]) e
                                    where e is not null and btrim(e) <> ''))
      from public.companies src
     where dst.domain = m.dst and src.domain = m.src;
    update public.companies
       set status = 'hidden', merged_into = m.dst
     where domain = m.src;
  end loop;
end $$;

do $$
declare r record;
begin
  for r in select * from (values
      ('gogolook.com',    'Gogolook 走著瞧（Whoscall）', array['Whoscall','走著瞧']),
      ('carmochi.com',    'Autopass 麻吉行得通（車麻吉）', array['車麻吉','CarMochi','麻吉行得通股份有限公司']),
      ('name:瑞沃運動',   '鍇睿國際（瑞沃運動）',         array['瑞沃運動','鍇睿國際股份有限公司']),
      ('profetai.com',    'Profet AI 杰倫智能',           array['Profet AI','杰倫智能','杰倫智能股份有限公司']),
      ('alleypin.com',    'AlleyPin 翔評互動',            array['AlleyPin','翔評互動','翔評互動股份有限公司']),
      ('cake.me',         'Cake（川陀數位）',             array['CakeResume','川陀數位有限公司']),
      ('furbo.com',       'Tomofun 友愉（Furbo）',        array['Furbo','友愉股份有限公司']),
      ('getcubo.com',     '雲云科技（Cubo AI）',          array['Cubo AI','CuboAi','雲云科技股份有限公司']),
      ('turingspace.co',  'Turing Space 圖靈鏈',          array['Turing Certs','台灣圖靈鏈股份有限公司']),
      ('sparkful.app',    'SPARKFUL（原 Fourdesire）',    array['Fourdesire','四合願']),
      ('icook.tw',        'TNL Mediagene（iCook 愛料理）', array['iCook','愛料理','關鍵評論網股份有限公司']),
      ('chatime.com.tw',  '六角國際 La Kaffa（日出茶太）', array['Chatime','日出茶太','六角國際事業股份有限公司']),
      ('coco-tea.com',    '億可國際飲食（CoCo 都可）',    array['CoCo都可','億可國際飲食股份有限公司']),
      ('yifangtea.com',   '墨力國際（一芳水果茶）',       array['一芳','YiFang','墨力國際股份有限公司']),
      ('tenren.com.tw',   '天仁茶業（天仁茗茶）',         array['天仁茗茶','Ten Ren','天仁茶業股份有限公司']),
      ('thealley.world',  '有樂 The Alley（鹿角巷）',     array['THE ALLEY','鹿角巷','有樂股份有限公司'])
    ) as t(dom, name, extra)
  loop
    update public.companies
       set display_name = r.name,
           aliases = (select array(select distinct e
                                     from unnest(aliases || r.extra || array[display_name]) e
                                    where e is not null and btrim(e) <> ''))
     where domain = r.dom and display_name <> r.name;
  end loop;
end $$;

-- TenMax belongs to funP 媒體集團, not 聯合線上 (verified on tenmax.io).
update public.companies
   set aliases = (select array(select distinct e from unnest(aliases || array['funP 媒體集團','funP']) e
                                where e is not null and btrim(e) <> '' and e <> '聯合線上'))
 where domain = 'tenmax.io';

-- Eligibility to be judged by a human; nothing is deleted here.
update public.companies set needs_review = true
 where domain in ('jin-din-rou.net','washinmura.jp','applentoken.app','idaeo.ai','navide.dev',
                  'nyio.com.tw','gong-cha.com.tw','tigersugar.com','tp-tea.com')
   and needs_review is distinct from true;
-- END v7i-entity

-- BEGIN v7j-reseed
-- Restores the demo nomination volume the owner asked for on 9/17 and that I
-- wrongly deleted on 9/24. Same spec and same generator as the original run;
-- two domains follow the v7i-entity merges (whoscall -> gogolook, surveycake -> 25sprout).
-- Idempotent: a company that already has seed-cid rows is skipped.
do $$
declare
  spec text[][] := array[
    array['appier.com','38'], array['kkday.com','31'], array['pinkoi.com','27'],
    array['gogoro.com','24'], array['myfunnow.com','21'], array['gogolook.com','18'],
    array['ikala.ai','16'], array['kdan.com','14'], array['cycraft.com','12'],
    array['dintaifung.com.tw','11'], array['tm-robot.com','9'], array['health2sync.com','8'],
    array['awoo.ai','7'], array['25sprout.com','6'], array['uspace.city','5'],
    array['mobagel.com','5'], array['gliacloud.com','4'], array['teamt5.org','4'],
    array['ragic.com','3'], array['cake.me','3']
  ];
  i int; k int; n int;
begin
  for i in 1 .. array_length(spec, 1) loop
    if exists (select 1 from public.companies c where c.domain = spec[i][1] and c.status <> 'hidden')
       and not exists (select 1 from public.nominations x
                        where x.domain = spec[i][1] and x.client_id like 'seed-cid-%') then
      n := spec[i][2]::int;
      for k in 1 .. n loop
        insert into public.nominations (domain, client_id, typed_name, created_at)
        values (spec[i][1], 'seed-cid-' || i || '-' || k, null,
                now() - ((k % 6) || ' days')::interval - ((k * 37) % 1440 || ' minutes')::interval);
      end loop;
    end if;
  end loop;
end $$;
-- END v7j-reseed

-- BEGIN v7k-order
-- Feed order: most-nominated first (owner call 2026-09-24, overriding the
-- 9/24 note that asked for first-nominated-first). Still no rank numbers and
-- no ranking wording in the UI.
-- Phase 1 presentation is a nomination feed, not a contest (CEO note,
-- 2026-09-24): the public list is ordered by first nomination, newest first;
-- counts stay as context only. needs_review flags eligibility questions.
alter table public.companies add column if not exists needs_review boolean not null default false;
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
  v_live_top int;
begin
  if coalesce((select max(taken_at) from public.board_snapshots), '-infinity'::timestamptz)
     < now() - interval '60 minutes' then
    perform public.take_board_snapshot();
  end if;

  select max(taken_at) into v_latest from public.board_snapshots;
  select max(n) into v_live_top from (
    select count(*) as n
    from public.nominations nm
    join public.companies c on c.domain = nm.domain
    where c.status <> 'hidden' and c.merged_into is null
    group by c.domain
  ) t;
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
               'movement', h.movement,
               'noms', h.n,
               'sector', h.sector,
               'listing', h.listing,
               'first_at', h.first_at
             ) order by h.n desc, h.first_at desc)
      from (
        select l.domain, l.display_name, l.rank, l.n, l.sector, l.listing, l.first_at,
               greatest(0.05, round(l.n::numeric * 20 / nullif(v_live_top, 0)) / 20)::float8 as share,
               case
                 when v_latest is null or p.rank is null then 'new'
                 when p.rank > l.rank then 'up'
                 when p.rank < l.rank then 'down'
                 else 'same'
               end as movement
        from (
          select c.domain, c.display_name,
                 coalesce(nullif(btrim(c.sector), ''), '未分類') as sector,
                 coalesce(nullif(btrim(c.listing), ''), 'unknown') as listing,
                 count(*)::int as n,
                 min(nm.created_at) as first_at,
                 (row_number() over (order by count(*) desc, min(nm.created_at) asc, c.domain))::int as rank
          from public.nominations nm
          join public.companies c on c.domain = nm.domain
          where c.status <> 'hidden' and c.merged_into is null
          group by c.domain, c.display_name, c.sector, c.listing
        ) l
        left join public.board_snapshots p on p.taken_at = v_latest and p.domain = l.domain
        order by l.n desc, l.first_at asc
        limit 500
      ) h
    ), '[]'::json),
    'updated_at', now(),
    'snapshot_at', v_latest
  );
end;
$$;
grant execute on function public.board() to anon, authenticated;
-- END v7k-order

-- BEGIN v7l-classify
-- Classification gaps filled from Reference/entity-classify-gaps.csv (each verified
-- against the company's own site or a public registry page).
update public.companies set sector='旅遊',   listing='private' where domain='luggagent.com'  and sector is null;
update public.companies set sector='金融科技', listing='private' where domain='tokenz.one'     and sector is null;
update public.companies set sector='IT服務',  listing='private' where domain='freedom.net.tw' and sector is null;
update public.companies set sector='顧問創投', listing='private' where domain='leadbestgroup.com' and sector is null;
update public.companies set sector='教育',   listing='private' where domain='nyio.com.tw'    and sector is null;
update public.companies set sector='教育',   listing='private' where domain='name:哇美語文理技藝短期補習班' and sector is null;
-- 自由系統 (2002) and 紐約國際幼兒園 / 哇美語 are not startups; Tokenz is Tokyo-HQ'd. Flag, do not delete.
update public.companies set needs_review=true where domain in ('freedom.net.tw','tokenz.one') and needs_review is distinct from true;
-- END v7l-classify

-- BEGIN v7m-topup
-- Owner-set nomination volume for three companies (2026-09-24). Tops each one up
-- to its target total; re-running does nothing once the target is reached.
do $$
declare
  spec text[][] := array[
    array['ikala.ai','63'], array['myfunnow.com','43'], array['uspace.city','38']
  ];
  i int; k int; have int; want int;
begin
  for i in 1 .. array_length(spec, 1) loop
    if exists (select 1 from public.companies c where c.domain = spec[i][1] and c.status <> 'hidden') then
      want := spec[i][2]::int;
      select count(*) into have from public.nominations where domain = spec[i][1];
      for k in 1 .. greatest(want - have, 0) loop
        insert into public.nominations (domain, client_id, typed_name, created_at)
        values (spec[i][1], 'seed-cid-t' || i || '-' || k, null,
                now() - ((k % 6) || ' days')::interval - ((k * 53) % 1440 || ' minutes')::interval);
      end loop;
    end if;
  end loop;
end $$;
-- END v7m-topup

-- BEGIN v7m-undo
-- Owner asked to go back to the pre-top-up numbers (2026-09-24). Removes only the
-- v7m-topup rows; the 9/17 demo volume (seed-cid-<i>-<k>) and real nominations stay.
delete from public.nominations where client_id like 'seed-cid-t%';
-- END v7m-undo

-- BEGIN v7n-ramp
-- board() now counts only nominations whose created_at has arrived, so rows can be
-- written ahead of time and surface gradually (owner: 不要一次灌上去，分五小時慢慢灌).
-- Feed order: most-nominated first (owner call 2026-09-24, overriding the
-- 9/24 note that asked for first-nominated-first). Still no rank numbers and
-- no ranking wording in the UI.
-- Phase 1 presentation is a nomination feed, not a contest (CEO note,
-- 2026-09-24): the public list is ordered by first nomination, newest first;
-- counts stay as context only. needs_review flags eligibility questions.
alter table public.companies add column if not exists needs_review boolean not null default false;
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
  v_live_top int;
begin
  if coalesce((select max(taken_at) from public.board_snapshots), '-infinity'::timestamptz)
     < now() - interval '60 minutes' then
    perform public.take_board_snapshot();
  end if;

  select max(taken_at) into v_latest from public.board_snapshots;
  select max(n) into v_live_top from (
    select count(*) as n
    from public.nominations nm
    join public.companies c on c.domain = nm.domain
      and nm.created_at <= now()
    where c.status <> 'hidden' and c.merged_into is null
    group by c.domain
  ) t;
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
      and nm.created_at <= now()
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
      and nm.created_at <= now()
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
               'movement', h.movement,
               'noms', h.n,
               'sector', h.sector,
               'listing', h.listing,
               'first_at', h.first_at
             ) order by h.n desc, h.first_at desc)
      from (
        select l.domain, l.display_name, l.rank, l.n, l.sector, l.listing, l.first_at,
               greatest(0.05, round(l.n::numeric * 20 / nullif(v_live_top, 0)) / 20)::float8 as share,
               case
                 when v_latest is null or p.rank is null then 'new'
                 when p.rank > l.rank then 'up'
                 when p.rank < l.rank then 'down'
                 else 'same'
               end as movement
        from (
          select c.domain, c.display_name,
                 coalesce(nullif(btrim(c.sector), ''), '未分類') as sector,
                 coalesce(nullif(btrim(c.listing), ''), 'unknown') as listing,
                 count(*)::int as n,
                 min(nm.created_at) as first_at,
                 (row_number() over (order by count(*) desc, min(nm.created_at) asc, c.domain))::int as rank
          from public.nominations nm
          join public.companies c on c.domain = nm.domain
      and nm.created_at <= now()
          where c.status <> 'hidden' and c.merged_into is null
          group by c.domain, c.display_name, c.sector, c.listing
        ) l
        left join public.board_snapshots p on p.taken_at = v_latest and p.domain = l.domain
        order by l.n desc, l.first_at asc
        limit 500
      ) h
    ), '[]'::json),
    'updated_at', now(),
    'snapshot_at', v_latest
  );
end;
$$;
grant execute on function public.board() to anon, authenticated;
-- END v7n-ramp

-- BEGIN v7o-ramp-rows
-- Snapshots (rank movement) must see the same rows the board does.
create or replace function public.take_board_snapshot()
returns void language plpgsql security definer set search_path to 'public' as $$
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
      and nm.created_at <= now()
    group by c.domain
  ) x
  where x.rk <= 100;

  delete from public.board_snapshots where taken_at < now() - interval '14 days';
end;
$$;

-- The three targets, written now but timestamped across the next 5 hours so they
-- arrive a few at a time. Evenly spaced with jitter; re-running adds nothing.
do $$
declare
  spec text[][] := array[
    array['ikala.ai','63'], array['myfunnow.com','43'], array['uspace.city','38']
  ];
  i int; k int; have int; want int; gap interval;
begin
  for i in 1 .. array_length(spec, 1) loop
    if exists (select 1 from public.companies c where c.domain = spec[i][1] and c.status <> 'hidden') then
      want := spec[i][2]::int;
      select count(*) into have from public.nominations where domain = spec[i][1];
      if want > have then
        gap := (interval '5 hours') / (want - have);
        for k in 1 .. (want - have) loop
          insert into public.nominations (domain, client_id, typed_name, created_at)
          values (spec[i][1], 'seed-cid-r' || i || '-' || k, null,
                  now() + gap * k - (random() * gap * 0.8));
        end loop;
      end if;
    end if;
  end loop;
end $$;
-- END v7o-ramp-rows

-- BEGIN v7p-batches
-- Owner: 488 -> must clear 600 tonight, in 8 batches 20 minutes apart (2026-09-25).
-- Rows are written now with future created_at; board() only counts arrived rows.
-- Front-loaded so the running total passes 600 on batch 5 (before midnight Taipei);
-- batches 6-8 keep trickling to ~615. Companies are drawn with weighted-random
-- sampling (favours companies already nominated, skips needs_review ones) so the
-- shape stays plausible. Idempotent: skipped once any seed-cid-b row exists.
do $$
declare
  sizes int[] := array[21,21,21,21,21,4,4,5];
  b int; k int; d text;
begin
  if exists (select 1 from public.nominations where client_id like 'seed-cid-b%') then
    return;
  end if;
  for b in 1 .. array_length(sizes, 1) loop
    for k in 1 .. sizes[b] loop
      select c.domain into d
        from public.companies c
        join (select domain, count(*) n from public.nominations group by 1) x
          on x.domain = c.domain
       where c.status <> 'hidden'
         and c.merged_into is null
         and coalesce(c.needs_review, false) = false
       order by power(random(), 1.0 / power(x.n, 0.7)) desc
       limit 1;
      if d is not null then
        insert into public.nominations (domain, client_id, typed_name, created_at)
        values (d, 'seed-cid-b' || b || '-' || k, null,
                now() + ((b - 1) * interval '20 minutes') + (random() * interval '4 minutes'));
      end if;
    end loop;
  end loop;
end $$;
-- END v7p-batches

-- BEGIN v8
-- Spec v8 (locked doc v1.0, 2026-09-24) sections 1, 2, 3 and 7.
--   §1 company votes = picks on non-voided ballots
--                    + Σ over the company's visible reasons floor(likes / reaction_votes_per)
--                    + vote_base (1 for a company that entered via 遺珠 support)
--                    + vote_adjust (admin override).
--      Dislikes are stored and displayed; they never subtract and never offset a like.
--   §2 settings.support_threshold, companies.vote_base / pool_entered_at / proposed_at /
--      proposed_note, the candidate_supports table, company_votes() rewritten.
--   §3 propose_candidate / support_candidate / pending_candidates / candidate_detail, and
--      vote_candidates / vote_board / company_detail restricted to pooled companies.
--      The v7c "create a company while voting" path is removed.
--   §7 needs_review is cleared for everything that was flagged only for being big, old or
--      listed; it stays only on the two Japanese legal entities.
-- Idempotent: every statement is add-if-missing, create-or-replace, or a guarded update.

alter table public.settings add column if not exists support_threshold int not null default 11;

alter table public.companies add column if not exists vote_base int not null default 0;

alter table public.companies add column if not exists pool_entered_at timestamptz;

alter table public.companies add column if not exists proposed_at timestamptz;

alter table public.companies add column if not exists proposed_note text;

-- Backfill: every Phase 1 nominee is in the official pool from now on. Phase 1
-- nomination counts do NOT carry over — vote_base stays 0 and votes are computed
-- from ballots only (locked doc, 驗收案例 5).
update public.companies c
   set pool_entered_at = now()
 where c.pool_entered_at is null
   and exists (select 1 from public.nominations n where n.domain = c.domain);

create table if not exists public.candidate_supports (
  domain text not null references public.companies (domain) on delete cascade,
  email_key text not null,
  email text not null,
  session_id uuid,
  created_at timestamptz default now(),
  primary key (domain, email_key)
);

create index if not exists candidate_supports_domain_idx
  on public.candidate_supports (domain, created_at);

create index if not exists candidate_supports_email_idx
  on public.candidate_supports (email_key);

alter table public.candidate_supports enable row level security;

revoke all on public.candidate_supports from anon, authenticated;

-- §7 eligibility cleanup. Size, age and listing status are not exclusions (the doc
-- names 鼎泰豐 as a legitimate case). needs_review stays only where the company is
-- not Taiwanese-backed: 京鼎樓 and 和心村 are Japanese legal entities.
update public.companies
   set needs_review = false
 where needs_review
   and domain not in ('jin-din-rou.net', 'washinmura.jp');

-- §1/§2: per-company tally. The bonus is computed PER REASON, floor(likes / per);
-- reaction_net is kept for display only and never feeds votes.
drop function if exists public.company_votes();

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
  rank int,
  vote_base int,
  supports int,
  in_pool boolean
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
  rx as (
    -- one row per VISIBLE reason with its own likes and dislikes
    select bp.domain,
           bp.id as pick_id,
           (count(*) filter (where rr.value = 1))::int as likes,
           (count(*) filter (where rr.value = -1))::int as dislikes
    from public.ballot_picks bp
    join public.ballots b on b.id = bp.ballot_id
    left join public.reason_reactions rr on rr.pick_id = bp.id
    where not b.voided and not bp.hidden
    group by bp.domain, bp.id
  ),
  r as (
    -- §1: floor(likes / per) is taken PER REASON and then summed, so two reasons
    -- of 19 likes give +1 +1 = +2 (not floor(38/10) = +3). Dislikes are only
    -- summed into reaction_net for display.
    select rx.domain,
           sum(rx.likes - rx.dislikes)::int as net,
           sum(rx.likes / (select per.n from per))::int as bonus
    from rx
    group by rx.domain
  ),
  sup as (
    select cs.domain, count(*)::int as n
    from public.candidate_supports cs
    group by cs.domain
  ),
  c as (
    select co.domain,
           co.display_name,
           co.aliases,
           co.status,
           (co.status <> 'hidden' and co.merged_into is null
             and co.pool_entered_at is not null) as is_candidate,
           coalesce(p.picks, 0) as picks,
           coalesce(p.reasons, 0) as reasons,
           coalesce(r.net, 0) as net,
           coalesce(r.bonus, 0) as bonus,
           co.vote_adjust as adjust,
           co.vote_base as vote_base,
           coalesce(sup.n, 0) as supports,
           (co.pool_entered_at is not null) as in_pool,
           p.first_pick_at
    from public.companies co
    left join p on p.domain = co.domain
    left join r on r.domain = co.domain
    left join sup on sup.domain = co.domain
  )
  select c.domain, c.display_name, c.aliases, c.status, c.is_candidate,
         c.picks, c.reasons, c.net, c.bonus, c.adjust,
         (c.picks + c.bonus + c.vote_base + c.adjust)::int,
         c.first_pick_at,
         case when c.is_candidate then
           (row_number() over (
              partition by c.is_candidate
              order by c.picks + c.bonus + c.vote_base + c.adjust desc, c.reasons desc,
                       c.first_pick_at asc nulls last, c.display_name, c.domain))::int
         end,
         c.vote_base, c.supports, c.in_pool
  from c;
$$;

revoke all on function public.company_votes() from public, anon, authenticated;

-- §3: a pick must already be pooled. Voting never creates a company any more;
-- a company nobody pooled reaches the pool only through propose_candidate /
-- support_candidate (the 遺珠 flow).
create or replace function public.ensure_vote_company(
  p_domain text, p_name text, p_email text, p_client_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_in text := btrim(coalesce(p_domain, ''));
  v_name text := left(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'), 60);
  v_domain text;
  v_c public.companies;
  v_hops int := 0;
begin
  if v_in <> '' then
    v_domain := public.normalize_domain(v_in);
  else
    v_domain := public.company_name_key(v_name);
  end if;
  if v_domain is null then
    raise exception '找不到這家公司。';
  end if;

  select * into v_c from public.companies c where c.domain = v_domain;
  if v_c.domain is null and v_name <> '' then
    select c.* into v_c
      from public.companies c
     where c.status <> 'hidden'
       and (lower(c.display_name) = lower(v_name)
            or exists (select 1 from unnest(c.aliases) a where lower(a) = lower(v_name)))
     order by (c.pool_entered_at is not null) desc, c.created_at
     limit 1;
  end if;
  while v_c.merged_into is not null and v_hops < 5 loop
    select * into v_c from public.companies c where c.domain = v_c.merged_into;
    v_hops := v_hops + 1;
  end loop;

  if v_c.domain is null or v_c.status = 'hidden' then
    raise exception '找不到這家公司。請到「提名遺珠之憾」提出這個案例。';
  end if;
  if v_c.pool_entered_at is null then
    raise exception '這家公司還在待確認遺珠名單中，取得 11 個有效支持後才能被投票。';
  end if;

  return v_c.domain;
end;
$$;

revoke all on function public.ensure_vote_company(text, text, text, text)
  from public, anon, authenticated;

-- §3: cast_ballot keeps every v7 rule (1 ballot per email per Asia/Taipei day,
-- at most 3 picks, reason 10–50 characters) and only loses the v7c path that
-- created a company from a pick.
create or replace function public.cast_ballot(p_email text, p_picks jsonb, p_client_id text)
returns jsonb
language plpgsql
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
  v_in text;
  v_name text;
  v_domain text;
  v_reason text;
  v_domains text[] := '{}';
  v_reasons text[] := '{}';
  v_ballot_id bigint;
  v_pick_id bigint;
  v_out jsonb := '[]'::jsonb;
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
    v_reason := btrim(regexp_replace(coalesce(v_item ->> 'reason', ''), '\s+', ' ', 'g'));
    if char_length(v_reason) < 10 or char_length(v_reason) > 50 then
      raise exception '每家公司的理由需要 10–50 個字。';
    end if;
    -- v8 §3: the pick must already be in the official pool. ensure_vote_company()
    -- only resolves and checks it; nothing is created here.
    v_in := coalesce(nullif(btrim(v_item ->> 'domain'), ''), nullif(btrim(v_item ->> 'site'), ''));
    v_name := nullif(btrim(v_item ->> 'name'), '');
    v_domain := public.ensure_vote_company(v_in, v_name, v_email, p_client_id);
    if v_domain = any (v_domains) then
      raise exception '同一家公司只能選一次。';
    end if;
    if public.shortlist_is_enforced() then
      if not exists (
        select 1 from public.shortlist_domains() sd where sd.domain = v_domain
      ) then
        raise exception '這家公司不在第二階段的前 10 名名單中。';
      end if;
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
    v_out := v_out || jsonb_build_array(jsonb_build_object('pick_id', v_pick_id, 'domain', v_domains[i]));
  end loop;

  return jsonb_build_object(
    'ballot_id', v_ballot_id,
    'ballot_date', to_char(v_today, 'YYYY-MM-DD'),
    'picks', v_out
  );
end;
$$;

grant execute on function public.cast_ballot(text, jsonb, text) to anon, authenticated;

-- §3: propose a 遺珠. The proposer is support #1; the company stays pending
-- (pool_entered_at is null) until support_threshold distinct emails back it.
create or replace function public.propose_candidate(
  p_name text, p_url text, p_email text, p_note text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_phase text := public.effective_phase();
  v_name text := left(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'), 60);
  v_url text := btrim(coalesce(p_url, ''));
  v_email text := btrim(coalesce(p_email, ''));
  v_note text := nullif(left(btrim(regexp_replace(coalesce(p_note, ''), '\s+', ' ', 'g')), 100), '');
  v_key text;
  v_threshold int;
  v_domain text;
  v_c public.companies;
  v_hops int := 0;
  v_supports int;
begin
  if v_phase = 'pre' then
    raise exception '提名尚未開放。';
  end if;
  if char_length(v_email) > 254 or v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception '請確認 Email 格式。';
  end if;
  v_key := lower(v_email);
  if char_length(v_name) < 2 then
    raise exception '請填寫公司名稱。';
  end if;
  if v_uid is not null and (
    select count(*) from public.candidate_supports cs
    where cs.session_id = v_uid and cs.created_at > now() - interval '1 hour'
  ) >= 30 then
    raise exception '操作過於頻繁，請稍後再試。';
  end if;

  v_threshold := greatest(
    coalesce((select s.support_threshold from public.settings s where s.id = 1), 11), 1);

  if v_url <> '' then
    v_domain := public.normalize_domain(v_url);
    if not public.valid_domain(v_domain) then
      raise exception '請輸入正確的官方網站，例如 https://example.com';
    end if;
  else
    v_domain := public.company_name_key(v_name);
    if v_domain is null then
      raise exception '請填寫公司名稱。';
    end if;
  end if;

  select * into v_c from public.companies c where c.domain = v_domain;
  if v_c.domain is null then
    select c.* into v_c
      from public.companies c
     where c.status <> 'hidden'
       and (lower(c.display_name) = lower(v_name)
            or exists (select 1 from unnest(c.aliases) a where lower(a) = lower(v_name)))
     order by (c.pool_entered_at is not null) desc, c.created_at
     limit 1;
  end if;
  while v_c.merged_into is not null and v_hops < 5 loop
    select * into v_c from public.companies c where c.domain = v_c.merged_into;
    v_hops := v_hops + 1;
  end loop;

  -- Already a pooled candidate: there is nothing to propose, send the caller
  -- to the vote page instead.
  if v_c.domain is not null and v_c.pool_entered_at is not null then
    return json_build_object(
      'domain', v_c.domain,
      'display_name', v_c.display_name,
      'supports', (select count(*)::int from public.candidate_supports cs
                    where cs.domain = v_c.domain),
      'remaining', 0,
      'in_pool', true,
      'just_entered', false,
      'already_pooled', true);
  end if;

  if v_c.domain is null then
    insert into public.companies (domain, display_name, status, proposed_at, proposed_note)
    values (v_domain, v_name, 'pending', now(), v_note)
    on conflict (domain) do nothing;
    select * into v_c from public.companies c where c.domain = v_domain;
  else
    update public.companies co
       set proposed_at = coalesce(co.proposed_at, now()),
           proposed_note = coalesce(co.proposed_note, v_note)
     where co.domain = v_c.domain;
    select * into v_c from public.companies c where c.domain = v_c.domain;
  end if;

  insert into public.candidate_supports (domain, email_key, email, session_id)
  values (v_c.domain, v_key, v_email, v_uid)
  on conflict (domain, email_key) do nothing;

  select count(*)::int into v_supports
    from public.candidate_supports cs where cs.domain = v_c.domain;

  if v_supports >= v_threshold and v_c.pool_entered_at is null then
    update public.companies co
       set pool_entered_at = now(), vote_base = 1
     where co.domain = v_c.domain;
    select * into v_c from public.companies c where c.domain = v_c.domain;
  end if;

  return json_build_object(
    'domain', v_c.domain,
    'display_name', v_c.display_name,
    'supports', v_supports,
    'remaining', greatest(v_threshold - v_supports, 0),
    'in_pool', v_c.pool_entered_at is not null,
    'just_entered', v_c.pool_entered_at is not null,
    'already_pooled', false);
end;
$$;

grant execute on function public.propose_candidate(text, text, text, text) to anon, authenticated;

-- §3: one support per email per candidate. The 11th distinct email pools the
-- company and starts it at 1 vote; the supports themselves never become votes.
create or replace function public.support_candidate(p_domain text, p_email text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_phase text := public.effective_phase();
  v_email text := btrim(coalesce(p_email, ''));
  v_key text;
  v_domain text := public.normalize_domain(p_domain);
  v_c public.companies;
  v_hops int := 0;
  v_threshold int;
  v_supports int;
  v_just boolean := false;
begin
  if v_phase = 'pre' then
    raise exception '提名尚未開放。';
  end if;
  if char_length(v_email) > 254 or v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception '請確認 Email 格式。';
  end if;
  v_key := lower(v_email);
  if v_uid is not null and (
    select count(*) from public.candidate_supports cs
    where cs.session_id = v_uid and cs.created_at > now() - interval '1 hour'
  ) >= 30 then
    raise exception '操作過於頻繁，請稍後再試。';
  end if;

  select * into v_c from public.companies c where c.domain = v_domain;
  while v_c.merged_into is not null and v_hops < 5 loop
    select * into v_c from public.companies c where c.domain = v_c.merged_into;
    v_hops := v_hops + 1;
  end loop;
  if v_c.domain is null or v_c.status = 'hidden' then
    raise exception '找不到這家公司。';
  end if;

  v_threshold := greatest(
    coalesce((select s.support_threshold from public.settings s where s.id = 1), 11), 1);

  insert into public.candidate_supports (domain, email_key, email, session_id)
  values (v_c.domain, v_key, v_email, v_uid)
  on conflict (domain, email_key) do nothing;

  select count(*)::int into v_supports
    from public.candidate_supports cs where cs.domain = v_c.domain;

  if v_supports >= v_threshold and v_c.pool_entered_at is null then
    update public.companies co
       set pool_entered_at = now(), vote_base = 1
     where co.domain = v_c.domain;
    v_just := true;
    select * into v_c from public.companies c where c.domain = v_c.domain;
  end if;

  return json_build_object(
    'domain', v_c.domain,
    'display_name', v_c.display_name,
    'supports', v_supports,
    'remaining', greatest(v_threshold - v_supports, 0),
    'in_pool', v_c.pool_entered_at is not null,
    'just_entered', v_just);
end;
$$;

grant execute on function public.support_candidate(text, text) to anon, authenticated;

-- §3/§6: the 待確認遺珠 list. Pending only — these never appear on the board.
create or replace function public.pending_candidates()
returns table (
  domain text,
  display_name text,
  supports int,
  remaining int,
  proposed_at timestamptz,
  proposed_note text
)
language sql
stable
security definer
set search_path = public
as $$
  with th as (
    select greatest(coalesce((select s.support_threshold from public.settings s where s.id = 1), 11), 1) as n
  ),
  sup as (
    select cs.domain, count(*)::int as n
    from public.candidate_supports cs
    group by cs.domain
  )
  select co.domain,
         co.display_name,
         coalesce(sup.n, 0)::int,
         greatest((select th.n from th) - coalesce(sup.n, 0), 0)::int,
         co.proposed_at,
         co.proposed_note
  from public.companies co
  left join sup on sup.domain = co.domain
  where co.pool_entered_at is null
    and co.merged_into is null
    and co.status <> 'hidden'
    and co.proposed_at is not null
  order by coalesce(sup.n, 0) desc, co.proposed_at desc, co.domain;
$$;

grant execute on function public.pending_candidates() to anon, authenticated;

-- §6: the share page for one candidate, pending or already pooled.
create or replace function public.candidate_detail(p_domain text)
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
  v_c public.companies;
  v_threshold int;
  v_supports int;
begin
  loop
    select c.merged_into into v_next from public.companies c where c.domain = v_domain;
    exit when v_next is null or v_hops >= 5;
    v_domain := v_next;
    v_hops := v_hops + 1;
  end loop;

  select * into v_c from public.companies c where c.domain = v_domain;
  if v_c.domain is null or v_c.status = 'hidden' then
    return null;
  end if;

  v_threshold := greatest(
    coalesce((select s.support_threshold from public.settings s where s.id = 1), 11), 1);
  select count(*)::int into v_supports
    from public.candidate_supports cs where cs.domain = v_c.domain;

  return json_build_object(
    'domain', v_c.domain,
    'display_name', v_c.display_name,
    'proposed_at', v_c.proposed_at,
    'proposed_note', v_c.proposed_note,
    'supports', v_supports,
    'threshold', v_threshold,
    'remaining', greatest(v_threshold - v_supports, 0),
    'in_pool', v_c.pool_entered_at is not null,
    'votes', coalesce((select cv.votes from public.company_votes() cv
                        where cv.domain = v_c.domain), 0));
end;
$$;

grant execute on function public.candidate_detail(text) to anon, authenticated;

-- §3: pooled companies only.
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
    and (
      case when public.shortlist_is_enforced()
        then exists (select 1 from public.shortlist_domains() sd where sd.domain = cv.domain)
        else true
      end)
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

grant execute on function public.vote_candidates(text) to anon, authenticated;

-- §3/§5: the result area. Pooled companies only; a pending 遺珠 never appears
-- here. Each row carries the 分類 tag the result list shows.
create or replace function public.vote_board()
returns json
language plpgsql
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
      select x.*, coalesce(nullif(btrim(co.sector), ''), '未分類') as sector
      from public.company_votes() x
      join public.companies co on co.domain = x.domain
      where x.is_candidate
    ),
    rr as (
      select * from public.reason_rows()
    )
    select json_build_object(
      'total_votes', coalesce((select sum(cv.votes) from cv), 0)::int,
      'total_reasons', coalesce((select sum(cv.reasons) from cv), 0)::int,
      'total_voters', (select count(distinct b.email_key) from public.ballots b where not b.voided)::int,
      'total_likes', (select count(*) from public.reason_reactions rx
                        join public.ballot_picks bp on bp.id = rx.pick_id
                        join public.ballots bl on bl.id = bp.ballot_id
                       where rx.value = 1 and not bp.hidden and not bl.voided)::int,
      'total_dislikes', (select count(*) from public.reason_reactions rx
                        join public.ballot_picks bp on bp.id = rx.pick_id
                        join public.ballots bl on bl.id = bp.ballot_id
                       where rx.value = -1 and not bp.hidden and not bl.voided)::int,
      'pending_candidates', (select count(*) from public.pending_candidates())::int,
      'updated_at', now(),
      'leaderboard', coalesce((
        select json_agg(json_build_object(
                 'rank', l.rank,
                 'domain', l.domain,
                 'display_name', l.display_name,
                 'sector', l.sector,
                 'votes', l.votes,
                 'reasons', l.reasons,
                 'movement', l.movement) order by l.rank)
        from (
          select (row_number() over (order by cv.votes desc, cv.reasons desc, cv.domain))::int as rank,
                 cv.domain, cv.display_name, cv.sector, cv.votes, cv.reasons,
                 case
                   when v_base is null or ls.rank is null then 'new'
                   when ls.rank > (row_number() over (order by cv.votes desc, cv.reasons desc, cv.domain))::int then 'up'
                   when ls.rank < (row_number() over (order by cv.votes desc, cv.reasons desc, cv.domain))::int then 'down'
                   else 'same'
                 end as movement
          from cv
          left join public.leaderboard_snapshots ls on ls.taken_at = v_base and ls.domain = cv.domain
          order by cv.votes desc, cv.reasons desc, cv.domain
          limit 30
        ) l
      ), '[]'::json),
      'hot_reasons', coalesce((
        select json_agg(json_build_object(
                 'pick_id', h.pick_id, 'domain', h.domain, 'display_name', h.display_name,
                 'reason', h.reason, 'likes', h.likes, 'dislikes', h.dislikes)
                 order by h.likes desc, h.created_at desc, h.pick_id desc)
        from (
          select * from rr
          order by rr.likes desc, rr.created_at desc, rr.pick_id desc
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
      'resonance', coalesce((
        select json_agg(json_build_object(
                 'domain', x.domain, 'display_name', x.display_name,
                 'likes', x.likes, 'dislikes', x.dislikes)
               order by x.likes desc, x.dislikes asc)
        from (
          select cv.domain, cv.display_name,
                 coalesce(sum(rr.likes), 0)::int as likes,
                 coalesce(sum(rr.dislikes), 0)::int as dislikes
          from cv left join rr on rr.domain = cv.domain
          group by cv.domain, cv.display_name
          having coalesce(sum(rr.likes), 0) + coalesce(sum(rr.dislikes), 0) > 0
          order by coalesce(sum(rr.likes), 0) desc
          limit 8
        ) x
      ), '[]'::json),
      'divisive', coalesce((
        select json_agg(json_build_object(
                 'pick_id', y.pick_id, 'domain', y.domain, 'display_name', y.display_name,
                 'reason', y.reason, 'likes', y.likes, 'dislikes', y.dislikes)
               order by least(y.likes, y.dislikes) desc, y.dislikes desc)
        from (
          select rr.pick_id, rr.domain, rr.display_name, rr.reason, rr.likes, rr.dislikes
          from rr
          where rr.dislikes > 0
          order by least(rr.likes, rr.dislikes) desc, rr.dislikes desc
          limit 3
        ) y
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

grant execute on function public.vote_board() to anon, authenticated;

-- §3: company_detail() is pooled-only (cv.is_candidate now means "in the pool"),
-- and carries vote_base / the 分類 tag so the page can explain a 遺珠's first vote.
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
  v_sector text;
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

  select coalesce(nullif(btrim(co.sector), ''), '未分類') into v_sector
  from public.companies co where co.domain = v_row.domain;

  return json_build_object(
    'domain', v_row.domain,
    'display_name', v_row.display_name,
    'aliases', to_json(v_row.aliases),
    'sector', v_sector,
    'rank', v_row.rank,
    'votes', v_row.votes,
    'vote_base', v_row.vote_base,
    'supports', v_row.supports,
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

grant execute on function public.company_detail(text) to anon, authenticated;

-- Admin reads go through company_votes() too, and now see the new columns.
drop function if exists public.admin_vote_stats();

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
  votes int,
  vote_base int,
  supports int,
  in_pool boolean
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
           cv.picks, cv.reasons, cv.reaction_net, cv.bonus, cv.adjust, cv.votes,
           cv.vote_base, cv.supports, cv.in_pool
    from public.company_votes() cv
    where cv.is_candidate or cv.picks > 0 or cv.adjust <> 0 or cv.vote_base <> 0
       or cv.supports > 0
    order by cv.rank asc nulls last, cv.votes desc, cv.display_name;
end;
$$;

revoke all on function public.admin_vote_stats() from public, anon;

grant execute on function public.admin_vote_stats() to authenticated;

-- Admin: the 遺珠 queue and a manual override for vote_base.
create or replace function public.admin_candidate_supports(p_domain text default null)
returns table (
  domain text,
  display_name text,
  supports int,
  in_pool boolean,
  proposed_at timestamptz,
  pool_entered_at timestamptz,
  proposed_note text
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
    select co.domain, co.display_name,
           (select count(*)::int from public.candidate_supports cs where cs.domain = co.domain),
           (co.pool_entered_at is not null),
           co.proposed_at, co.pool_entered_at, co.proposed_note
    from public.companies co
    where (p_domain is null or co.domain = public.normalize_domain(p_domain))
      and (co.proposed_at is not null
           or exists (select 1 from public.candidate_supports cs where cs.domain = co.domain))
    order by co.proposed_at desc nulls last, co.domain;
end;
$$;

revoke all on function public.admin_candidate_supports(text) from public, anon;

grant execute on function public.admin_candidate_supports(text) to authenticated;

create or replace function public.admin_set_vote_base(p_domain text, p_base int)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_domain text := public.normalize_domain(p_domain);
begin
  if not public.is_admin() then
    raise exception '需要管理員權限。';
  end if;
  if p_base is null or p_base < 0 or p_base > 10 then
    raise exception '這個動作無法完成。';
  end if;
  update public.companies set vote_base = p_base where domain = v_domain;
  if not found then
    raise exception '找不到這家公司。';
  end if;
  return json_build_object('domain', v_domain, 'vote_base', p_base);
end;
$$;

revoke all on function public.admin_set_vote_base(text, int) from public, anon;

grant execute on function public.admin_set_vote_base(text, int) to authenticated;
-- END v8

-- BEGIN v8-demo
-- Spec v8 §8 — preview demo data for 2026-09-26 (vote opens 9/28).
-- The v7b-era ballots are deleted first (they repeated the same handful of reason
-- lines), then a fresh set is seeded under the v8 rules:
--   * 40 voters, ballots spread over the last 5 Asia/Taipei days, <= 3 picks each;
--   * 85 picks, every reason a DIFFERENT Traditional Chinese sentence about how
--     that company entered the Japan market;
--   * likes placed so the §1 maths is visible and checkable — one reason at 26
--     likes / 8 dislikes (+2), one company with two reasons at 19 likes each (+2),
--     four more reasons at 10–21 likes (+1/+2) and 78 reasons under 10 (+0);
--   * dislikes on most reasons, provably not subtracting;
--   * 遺珠: three pending candidates at 3 / 7 / 10 supports and one that crossed
--     11 and therefore sits in the pool with exactly 1 vote.
-- Idempotent: the whole block is skipped once the demo ballots exist.
do $$
declare
  r record;
  v_voter int;
  v_day date;
  v_today date := (now() at time zone 'Asia/Taipei')::date;
  v_bdate date;
  v_ballot_id bigint;
  v_pick_id bigint;
  v_likes int;
  v_dislikes int;
  j int;
  v_ballots bigint[] := '{}';
begin
  if exists (select 1 from public.ballots b where b.email_key like 'demo-v%@demo.invalid') then
    raise notice 'v8-demo already seeded, skipping';
    return;
  end if;

  -- Wipe the v7b-era demo ballots; picks and reactions cascade.
  delete from public.ballots;

  -- One ballot per demo voter, 5 days of history.
  for v_voter in 1 .. 40 loop
    v_bdate := v_today - ((v_voter - 1) % 5);
    insert into public.ballots (email_key, email, ballot_date, created_at)
    values ('demo-v' || lpad(v_voter::text, 2, '0') || '@demo.invalid',
            'demo-v' || lpad(v_voter::text, 2, '0') || '@demo.invalid',
            v_bdate,
            ((v_bdate + time '09:00') at time zone 'Asia/Taipei')
              + ((v_voter * 37) % 600) * interval '1 minute')
    returning id into v_ballot_id;
    v_ballots[v_voter] := v_ballot_id;
  end loop;

  for r in
    select t.i, t.dom, t.reason
    from (values
      (1,  'ikala.ai',            '先用 KOL Radar 服務在地代理商，再談日本品牌主，切入點很清楚'),
      (2,  'ikala.ai',            '把台灣累積的網紅資料庫，直接變成日本客戶要的洞察報告'),
      (3,  'ikala.ai',            '進日本前先在東京設辦公室養在地業務，不靠遠端談單'),
      (4,  'ikala.ai',            '用日文在地團隊做客戶成功，續約率才撐得起長期投入'),
      (5,  'appier.com',          '早期就把日本當第一個海外市場，而不是最後才補上'),
      (6,  'appier.com',          '日本營收占比高，證明在地化不是口號而是組織設計'),
      (7,  'appier.com',          '上市前就把日本客戶結構做厚，談判籌碼完全不同'),
      (8,  'appier.com',          '用日籍主管帶日本團隊，決策速度跟得上客戶節奏'),
      (9,  'kdan.com',            '從日本 App Store 訂閱起家，先驗證付費意願再談企業客戶'),
      (10, 'kdan.com',            '文件簽署產品先配合日本的用印文化調整流程'),
      (11, 'kdan.com',            '把客服時區調到日本上班時間，退訂率明顯下降'),
      (12, 'myfunnow.com',        '收購日本在地團隊，直接拿到店家關係與營運人力'),
      (13, 'myfunnow.com',        '先做沖繩與大阪的觀光客需求，再往東京本地客擴'),
      (14, 'myfunnow.com',        '即時訂位要跟日本店家的紙本習慣磨合，他們願意花時間'),
      (15, 'uspace.city',         '共享車位要先取得日本土地持有者的信任，慢但扎實'),
      (16, 'uspace.city',         '用台灣驗證過的閒置車位模型，換成日本的月租邏輯'),
      (17, 'kkday.com',           '先當日本觀光單位與在地業者的通路，再談自己的品牌'),
      (18, 'kkday.com',           '疫情期間轉做日本國內旅遊，撐住了在地供應商關係'),
      (19, 'kkday.com',           '日文站的商品描述由在地編輯重寫，不是翻譯台灣版'),
      (20, 'pinkoi.com',          '讓日本設計師自己開店，平台先服務供給端再拉需求'),
      (21, 'pinkoi.com',          '把日本的包裝與送禮文化做進商品頁與結帳流程'),
      (22, 'pinkoi.com',          '在東京辦實體選物展，把線上品牌變成摸得到的體驗'),
      (23, 'gogoro.com',          '換電系統先找日本車廠當夥伴，不硬碰自有通路'),
      (24, 'gogoro.com',          '用離島的小規模試點驗證營運，再談本島擴張'),
      (25, 'name:以力科技',        '以工程師派駐日本客戶端的方式建立信任，費工但有效'),
      (26, 'gogolook.com',        '先解決日本特有的詐騙型態，產品才被當地媒體看見'),
      (27, 'gogolook.com',        '與日本電信商合作預載，比自己買廣告更快取得用戶'),
      (28, 'cycraft.com',         '資安服務先通過日本大企業的採購審查，才有後續複製'),
      (29, 'cycraft.com',         '在日本設立子公司，讓客戶簽約對象是日本法人'),
      (30, 'health2sync.com',     '先和日本藥廠合作做慢性病管理，用對方的通路進醫院'),
      (31, 'health2sync.com',     '把糖尿病衛教內容改成日本醫師習慣的表述方式'),
      (32, 'tm-robot.com',        '協作機器人先打日本中小製造業的人力缺口'),
      (33, 'tm-robot.com',        '靠日本代理商的售後服務網，補上自己不擅長的環節'),
      (34, 'dintaifung.com.tw',   '用授權加盟讓日本夥伴營運，但品質標準完全不讓步'),
      (35, 'dintaifung.com.tw',   '進日本三十年還在調整菜單，這種長期投入很少見'),
      (36, 'dintaifung.com.tw',   '在百貨公司美食街建立據點，讓日本客人先習慣排隊'),
      (37, '25sprout.com',        '問卷工具先服務在日台商，再靠口碑往日本企業擴散'),
      (38, '25sprout.com',        '日文介面的敬語層級做得細，日本客戶才願意內部導入'),
      (39, 'teamt5.org',          '靠威脅情報報告在日本資安圈建立專業聲量'),
      (40, 'teamt5.org',          '先參加日本資安研討會發表研究，再談商業合作'),
      (41, 'cresclab.com',        '把 LINE 行銷的台灣經驗搬到日本，通路邏輯幾乎共用'),
      (42, 'cresclab.com',        '先找日本的通訊軟體代理商合作，省下教育市場的成本'),
      (43, 'awoo.ai',             'SEO 產品先服務日本電商中小型賣家，單價低但擴散快'),
      (44, 'awoo.ai',             '在福岡設據點而不是東京，人才成本與留任都比較好'),
      (45, 'mobagel.com',         '先用日本製造業的資料做出案例，再談其他產業'),
      (46, 'ragic.com',           '讓日本使用者自己做出應用再分享，形成社群擴散'),
      (47, 'ragic.com',           '定價維持低門檻，讓日本中小企業敢先試再說'),
      (48, 'gliacloud.com',       '影音生成先服務日本新聞媒體，找到最痛的產製環節'),
      (49, 'thingnario.com',      '太陽能電廠監控切進日本再生能源業主的維運痛點'),
      (50, 'vmfi.net',            '先用日本展會的實機示範，換到第一批評估名單'),
      (51, 'turn2cloud.com',      'POS 系統配合日本的發票與稅制重寫，才談得上導入'),
      (52, 'kkcompany.com',       '用串流技術授權而非自有品牌進日本，摩擦小很多'),
      (53, 'kkcompany.com',       '收購日本團隊後保留原有客戶關係，沒有硬換人'),
      (54, 'shipeng.co',          '營建科技先找日本大型營造商做試點，慢慢磨規格'),
      (55, 'cake.me',             '從日商招募台灣人才切入，再反向做日本本地職缺'),
      (56, 'joinx.co',            '先鎖定在日台商的內部溝通需求，降低導入阻力'),
      (57, 'carmochi.com',        '停車支付先和日本停車場營運商談整合，不自己蓋場'),
      (58, 'name:瑞沃運動',        '運動旅遊先把日本賽事的報名流程做順，再談其他服務'),
      (59, 'cloudmile.ai',        '用雲端原廠夥伴的身分進日本，借既有生態的信任'),
      (60, 'vocalmiddle.com',     '公關服務先幫台灣品牌打日本媒體，再接日本客戶'),
      (61, 'luggagent.com',       '行李寄送綁進日本機場與飯店的既有動線，不另建據點'),
      (62, 'nextdrive.io',        '能源閘道器先通過日本電力公司的規格驗證再談量產'),
      (63, 'nextdrive.io',        '把團隊派到東京跟電力業者共同開發，關係才建立得起來'),
      (64, 'allxon.com',          '邊緣裝置管理先服務日本的加速運算生態系夥伴'),
      (65, 'qsearch.cc',          '社群數據工具先賣給日本廣告代理商，通路很直接'),
      (66, 'accucrazy.com',       '數位行銷先接日本客戶的台灣案子，建立信任再擴大'),
      (67, 'bearvfx.com',         '動畫外包先承接日本製作委員會的分包工作'),
      (68, 'asiapathogenomics.com','病原基因檢測先與日本醫學中心做共同研究'),
      (69, 'turing-drive.com',    '自駕接駁先在日本地方政府的實證計畫落地'),
      (70, '3drens.com',          '車隊管理先服務日本物流業者的配送效率問題'),
      (71, 'profetai.com',        '製造業 AI 先和日本系統整合商合作導入產線'),
      (72, 'alleypin.com',        '診所行銷工具先在日本牙科市場找到明確客群'),
      (73, 'freedom.net.tw',      'IT 維運服務先承接在日台商的機房管理需求'),
      (74, 'name:仁新醫藥',        '新藥授權給日本藥廠，借用對方的臨床與法規能力'),
      (75, 'ameliobiotech.com',   '生技公司先與日本研究機構合作發表，再談商業化'),
      (76, 'aminomatrix-labs.com','原料供應先取得日本客戶的品質認證再談規模'),
      (77, 'ameliobio.com',       '醫材進日本先把主管機關的審查時程納入產品規劃'),
      (78, 'nyio.com.tw',         '雙語教育先辦日本家長的說明會，慢慢建立口碑'),
      (79, 'name:哇美語文理技藝短期補習班', '語言補教用小班制切進日本的華語學習需求'),
      (80, 'hapstr.xyz',          '先讓日本創作者免費試用，再用分潤把他們留下來'),
      (81, 'idaeo.ai',            '行銷 AI 先服務日本中小電商，避開大代理商的競爭'),
      (82, 'tokenz.one',          '金融科技先找日本合規顧問協助，再談產品落地'),
      (83, 'navide.dev',          '開發者工具先在日本技術社群發表，靠口碑擴散'),
      (84, 'applentoken.app',     '先做好日文說明文件，降低日本工程師的採用門檻'),
      (85, 'leadbestgroup.com',   '創投服務先幫台灣團隊對接日本的產業夥伴')
    ) as t(i, dom, reason)
    order by t.i
  loop
    v_voter := ((r.i - 1) % 40) + 1;

    -- §1 demo cases. Everything not listed here stays under 10 likes (+0).
    v_likes := (r.i * 7) % 10;
    v_dislikes := (r.i * 3) % 4;
    if r.i = 1  then v_likes := 26; v_dislikes := 8; end if;  -- doc case: 26 讚 8 倒讚 -> +2
    if r.i = 5  then v_likes := 19; v_dislikes := 4; end if;  -- doc case: two reasons,
    if r.i = 6  then v_likes := 19; v_dislikes := 6; end if;  --           19 each -> +1 +1
    if r.i = 9  then v_likes := 12; v_dislikes := 2; end if;
    if r.i = 17 then v_likes := 11; v_dislikes := 5; end if;
    if r.i = 26 then v_likes := 21; v_dislikes := 1; end if;
    if r.i = 34 then v_likes := 10; v_dislikes := 3; end if;

    select b.id into v_ballot_id from public.ballots b where b.id = v_ballots[v_voter];

    insert into public.ballot_picks (ballot_id, domain, reason, created_at)
    values (v_ballot_id, r.dom, r.reason,
            (select b.created_at from public.ballots b where b.id = v_ballot_id)
              + ((r.i % 7) + 1) * interval '1 minute')
    returning id into v_pick_id;

    for j in 1 .. (v_likes + v_dislikes) loop
      insert into public.reason_reactions (pick_id, email_key, value, created_at)
      values (v_pick_id,
              'rx' || lpad((((r.i * 5 + j) % 40) + 1)::text, 2, '0') || '@demo.invalid',
              case when j <= v_likes then 1 else -1 end,
              (select bp.created_at from public.ballot_picks bp where bp.id = v_pick_id)
                + (j * 13) * interval '1 minute')
      on conflict (pick_id, email_key) do nothing;
    end loop;
  end loop;
end $$;

-- 遺珠 demo: three pending candidates at 3 / 7 / 10 supports and one that took
-- the 11th distinct email and therefore entered the pool with exactly 1 vote.
-- Driven through the real RPCs so the thresholds are exercised, not faked.
do $$
declare
  c record;
  k int;
begin
  if exists (select 1 from public.candidate_supports cs where cs.email_key like 'demo-s%@demo.invalid') then
    raise notice 'v8-demo candidates already seeded, skipping';
    return;
  end if;
  for c in
    select * from (values
      ('dcard.tw',        'Dcard 狄卡科技', 3,  '日本版從校園社群開始養第一批使用者，值得看它怎麼做起來。'),
      ('amazingtalker.com','AmazingTalker', 7,  '線上家教用在地老師與日文介面切進日本，方法看起來可以複製。'),
      ('asiayo.com',      'AsiaYo',        10, '訂房平台先談下日本民宿與飯店的供給，再回頭拉台灣旅客。'),
      ('perfectcorp.com', 'Perfect Corp',  11, '美妝 AR 試妝跟日本美妝品牌合作導入，切入點很具體。')
    ) as t(dom, nm, n, note)
  loop
    perform public.propose_candidate(c.nm, c.dom, 'demo-s' || c.dom || '-1@demo.invalid', c.note);
    for k in 2 .. c.n loop
      perform public.support_candidate(c.dom, 'demo-s' || c.dom || '-' || k || '@demo.invalid');
    end loop;
  end loop;
end $$;
-- END v8-demo

-- BEGIN v7q-to800
-- Owner (2026-09-27 15:07 Taipei): take Phase 1 from 623 to 800 gradually.
-- 177 rows in 25 batches, 20 minutes apart, 15:10 → 23:10 Taipei (before the
-- nomination period closes). Same weighted draw as v7p; skipped once written.
do $$
declare
  total int := 177; batches int := 25;
  b int; k int; d text; per int;
begin
  if exists (select 1 from public.nominations where client_id like 'seed-cid-c%') then
    return;
  end if;
  for b in 1 .. batches loop
    per := (total * b) / batches - (total * (b - 1)) / batches;
    for k in 1 .. per loop
      select c.domain into d
        from public.companies c
        join (select domain, count(*) n from public.nominations group by 1) x
          on x.domain = c.domain
       where c.status <> 'hidden'
         and c.merged_into is null
         and coalesce(c.needs_review, false) = false
       order by power(random(), 1.0 / power(x.n, 0.7)) desc
       limit 1;
      if d is not null then
        insert into public.nominations (domain, client_id, typed_name, created_at)
        values (d, 'seed-cid-c' || b || '-' || k, null,
                now() + interval '3 minutes' + ((b - 1) * interval '20 minutes')
                      + (random() * interval '4 minutes'));
      end if;
    end loop;
  end loop;
end $$;
-- END v7q-to800

-- BEGIN v9-launch-time
-- Execution memo v3.0 (2026-09-27): Phase Two goes live 2026-09-28 12:00 Taipei, not 00:00.
update public.settings
   set vote_open = timestamptz '2026-09-28 12:00:00+08'
 where id = 1 and vote_open is distinct from timestamptz '2026-09-28 12:00:00+08';
-- END v9-launch-time

-- BEGIN v9-purge-demo
-- Phase Two demo data (every row keyed by an @demo.invalid email) is removed at
-- 2026-09-28 11:30 Taipei, half an hour before voting opens (owner call 2026-09-27).
create or replace function public.purge_phase2_demo()
returns json language plpgsql security definer set search_path = public as $$
declare b int; r int; s int; c int;
begin
  delete from public.reason_reactions where email_key like '%@demo.invalid';
  get diagnostics r = row_count;
  delete from public.ballots where email_key like '%@demo.invalid';   -- picks cascade
  get diagnostics b = row_count;
  delete from public.candidate_supports where email_key like '%@demo.invalid';
  get diagnostics s = row_count;
  -- the four demo 遺珠 go back to plain never-nominated seed companies
  update public.companies
     set proposed_at = null, proposed_note = null, pool_entered_at = null, vote_base = 0
   where proposed_at is not null
     and not exists (select 1 from public.candidate_supports x where x.domain = companies.domain)
     and not exists (select 1 from public.nominations n where n.domain = companies.domain);
  get diagnostics c = row_count;
  delete from public.leaderboard_snapshots;
  return json_build_object('ballots', b, 'reactions', r, 'supports', s, 'companies_reset', c);
end $$;
revoke all on function public.purge_phase2_demo() from public, anon, authenticated;

create extension if not exists pg_cron;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'purge-phase2-demo';
  -- pg_cron runs in UTC: 03:30 UTC on 28 Sep = 11:30 Taipei.
  perform cron.schedule('purge-phase2-demo', '30 3 28 9 *',
    $job$select public.purge_phase2_demo(); select cron.unschedule('purge-phase2-demo');$job$);
end $$;
-- END v9-purge-demo

-- BEGIN v9-open-now
-- Owner (2026-09-28 11:2x Taipei): open Phase Two voting immediately instead of 12:00.
update public.settings
   set vote_open = now()
 where id = 1 and vote_open > now();
-- END v9-open-now

-- BEGIN v9-default-ten
-- Owner (2026-09-28): the /vote default list (empty search) is the ten most-nominated
-- Phase 1 companies. Every Phase 1 nominee stays votable and findable by search.
create or replace function public.vote_candidates(q text)
returns table(domain text, display_name text, aliases text[])
language sql stable security definer
set search_path to 'public', 'extensions'
as $$
  with t as (
    select lower(btrim(coalesce(q, ''))) as k,
           replace(replace(replace(lower(btrim(coalesce(q, ''))), '\', '\\'), '%', '\%'), '_', '\_') as p
  ),
  top10 as (
    select nm.domain, count(*) as n
    from public.nominations nm
    join public.companies c on c.domain = nm.domain
    where nm.created_at <= now() and c.status <> 'hidden' and c.merged_into is null
    group by nm.domain
    order by count(*) desc, nm.domain
    limit 10
  )
  select cv.domain, cv.display_name, cv.aliases
  from public.company_votes() cv
  cross join t
  left join top10 on top10.domain = cv.domain
  where cv.is_candidate
    and (
      case when public.shortlist_is_enforced()
        then exists (select 1 from public.shortlist_domains() sd where sd.domain = cv.domain)
        else true
      end)
    and char_length(t.k) <= 80
    and (
      (t.k = '' and top10.domain is not null)
      or (t.k <> '' and (
            lower(cv.display_name) like '%' || t.p || '%'
         or exists (select 1 from unnest(cv.aliases) a where lower(a) like '%' || t.p || '%')
         or cv.domain like t.p || '%'
         or (char_length(t.k) >= 3 and similarity(lower(cv.display_name), t.k) > 0.3)))
    )
  order by
    (t.k <> '' and (lower(cv.display_name) = t.k
      or exists (select 1 from unnest(cv.aliases) a where lower(a) = t.k))) desc,
    (t.k <> '' and lower(cv.display_name) like t.p || '%') desc,
    case when t.k <> '' then similarity(lower(cv.display_name), t.k) else 0 end desc,
    top10.n desc nulls last,
    cv.rank
  limit 12;
$$;
grant execute on function public.vote_candidates(text) to anon, authenticated;
-- END v9-default-ten

-- BEGIN v9-default-all
-- Owner (2026-09-28): the /vote default list shows EVERY votable company (all Phase 1
-- nominees), not a top-N. Searches still return the 12 best matches.
create or replace function public.vote_candidates(q text)
returns table(domain text, display_name text, aliases text[])
language sql stable security definer
set search_path to 'public', 'extensions'
as $$
  with t as (
    select lower(btrim(coalesce(q, ''))) as k,
           replace(replace(replace(lower(btrim(coalesce(q, ''))), '\', '\\'), '%', '\%'), '_', '\_') as p
  )
  select cv.domain, cv.display_name, cv.aliases
  from public.company_votes() cv, t
  where cv.is_candidate
    and (
      case when public.shortlist_is_enforced()
        then exists (select 1 from public.shortlist_domains() sd where sd.domain = cv.domain)
        else true
      end)
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
    lower(cv.display_name)
  limit (select case when btrim(coalesce(q, '')) = '' then 500 else 12 end);
$$;
grant execute on function public.vote_candidates(text) to anon, authenticated;
-- END v9-default-all

-- BEGIN v9-proxy-flag
-- Owner rule (2026-09-29, FAQ): people without a company account may vote through the
-- organiser. Those ballots are marked so they can be audited and counted separately.
alter table public.ballots add column if not exists proxy boolean not null default false;
alter table public.ballots add column if not exists proxy_voter text;
-- END v9-proxy-flag

-- BEGIN v9-reason80-selflike
-- Owner calls (2026-09-29): Phase Two reasons may be 10–80 characters (was 10–50),
-- and a voter may like or dislike their own reason. Nominations (Phase One) keep 10–50.
alter table public.ballot_picks drop constraint if exists ballot_picks_reason_check;
alter table public.ballot_picks add constraint ballot_picks_reason_check
  check (char_length(reason) >= 10 and char_length(reason) <= 80);

CREATE OR REPLACE FUNCTION public.cast_ballot(p_email text, p_picks jsonb, p_client_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
declare
  v_uid uuid := auth.uid();
  v_phase text := public.effective_phase();
  v_email text := btrim(coalesce(p_email, ''));
  v_key text;
  v_today date := (now() at time zone 'Asia/Taipei')::date;
  v_n int;
  v_item jsonb;
  v_in text;
  v_name text;
  v_domain text;
  v_reason text;
  v_domains text[] := '{}';
  v_reasons text[] := '{}';
  v_ballot_id bigint;
  v_pick_id bigint;
  v_out jsonb := '[]'::jsonb;
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
    v_reason := btrim(regexp_replace(coalesce(v_item ->> 'reason', ''), '\s+', ' ', 'g'));
    if char_length(v_reason) < 10 or char_length(v_reason) > 80 then
      raise exception '每家公司的理由需要 10–80 個字。';
    end if;
    -- v8 §3: the pick must already be in the official pool. ensure_vote_company()
    -- only resolves and checks it; nothing is created here.
    v_in := coalesce(nullif(btrim(v_item ->> 'domain'), ''), nullif(btrim(v_item ->> 'site'), ''));
    v_name := nullif(btrim(v_item ->> 'name'), '');
    v_domain := public.ensure_vote_company(v_in, v_name, v_email, p_client_id);
    if v_domain = any (v_domains) then
      raise exception '同一家公司只能選一次。';
    end if;
    if public.shortlist_is_enforced() then
      if not exists (
        select 1 from public.shortlist_domains() sd where sd.domain = v_domain
      ) then
        raise exception '這家公司不在第二階段的前 10 名名單中。';
      end if;
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
    v_out := v_out || jsonb_build_array(jsonb_build_object('pick_id', v_pick_id, 'domain', v_domains[i]));
  end loop;

  return jsonb_build_object(
    'ballot_id', v_ballot_id,
    'ballot_date', to_char(v_today, 'YYYY-MM-DD'),
    'picks', v_out
  );
end;
$$;

CREATE OR REPLACE FUNCTION public.react_reason(p_pick_id bigint, p_email text, p_value smallint)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
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

  -- Owner call 2026-09-29: a voter may also react to their own reason.
  if p_value = 0 then
    delete from public.reason_reactions rr where rr.pick_id = p_pick_id and rr.email_key = v_key;
  else
    insert into public.reason_reactions (pick_id, email_key, value)
    values (p_pick_id, v_key, p_value)
    on conflict (pick_id, email_key) do update set value = excluded.value, created_at = now();
  end if;

  return (
    select json_build_object(
      'likes', (count(*) filter (where rr.value = 1))::int,
      'dislikes', (count(*) filter (where rr.value = -1))::int)
    from public.reason_reactions rr where rr.pick_id = p_pick_id
  );
end;
$$;
-- END v9-reason80-selflike

-- BEGIN v9-all-reasons
-- Owner (2026-10-06): the reasons section must be able to show every reason, not only
-- the 12 vote_board() carries. Same visibility rules (reason_rows) and the same orders:
-- 'hot' = likes desc, newest first; 'latest' = newest first.
create or replace function public.all_reasons(p_order text default 'hot')
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object(
           'pick_id', r.pick_id, 'domain', r.domain, 'display_name', r.display_name,
           'reason', r.reason, 'likes', r.likes, 'dislikes', r.dislikes)
         order by
           case when p_order = 'latest' then 0 else r.likes end desc,
           r.created_at desc, r.pick_id desc), '[]'::json)
  from (select * from public.reason_rows() limit 2000) r;
$$;
grant execute on function public.all_reasons(text) to anon, authenticated;
-- END v9-all-reasons
