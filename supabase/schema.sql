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
