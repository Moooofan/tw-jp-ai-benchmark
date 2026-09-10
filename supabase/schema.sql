-- 推爆東京 — full database schema.
-- Idempotent: safe to run repeatedly against the same project.
-- Apply with:
--   supabase db query --linked --project-ref pjqejaxfxjtcujfamyem -f supabase/schema.sql

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
    check (phase in ('nominate', 'vote', 'results')),
  nominate_close timestamptz,
  vote_close timestamptz,
  people_offset int default 0,
  companies_offset int default 0
);

insert into public.settings (id, phase, nominate_close, vote_close)
values (1, 'nominate', now() + interval '14 days', now() + interval '28 days')
on conflict (id) do nothing;

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  company text not null,
  company_key text generated always as (lower(btrim(company))) stored,
  reason text not null check (char_length(reason) between 4 and 120),
  user_id uuid not null references auth.users (id),
  email text not null,
  up int default 0,
  down int default 0,
  adjust int default 0,
  hidden boolean default false,
  flagged int default 0,
  created_at timestamptz default now()
);

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

create table if not exists public.final_votes (
  finalist_id uuid not null references public.finalists (id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz default now(),
  primary key (finalist_id, user_id)
);

create index if not exists final_votes_user_id_idx on public.final_votes (user_id);

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
-- ---------------------------------------------------------------------------

drop view if exists public.posts_public;
create view public.posts_public
with (security_invoker = false) as
select
  p.id,
  p.company,
  p.reason,
  left(split_part(p.email, '@', 1), 1) || '***@' || split_part(p.email, '@', 2)
    as masked_email,
  (p.up - p.down + p.adjust) as score,
  p.created_at
from public.posts p
where p.hidden = false;

drop view if exists public.finalists_public;
create view public.finalists_public
with (security_invoker = false) as
select f.id, f.company, f.blurb, f.top_reason, f.sort
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

-- admins: no policy at all -> nobody can read it through PostgREST.

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

drop policy if exists finalists_read on public.finalists;
create policy finalists_read on public.finalists
for select to anon, authenticated using (true);

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

grant select on public.settings to anon, authenticated;
grant update on public.settings to authenticated;
grant select, update, delete on public.posts to authenticated;
grant select on public.votes to authenticated;
grant select on public.reports to authenticated;
grant select on public.finalists to anon, authenticated;
grant insert, update, delete on public.finalists to authenticated;
grant select on public.final_votes to authenticated;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

create or replace function public.nominate(p_company text, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := auth.jwt() ->> 'email';
  v_phase text;
  v_company text := btrim(coalesce(p_company, ''));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_key text;
  v_others int;
  v_id uuid;
begin
  if v_uid is null then
    raise exception '先留信箱才能推。';
  end if;

  select phase into v_phase from public.settings where id = 1;
  if v_phase is distinct from 'nominate' then
    raise exception '推薦階段已經結束了。';
  end if;

  if v_company = '' then
    raise exception '公司名要填。';
  end if;
  if char_length(v_company) > 40 then
    raise exception '公司名太長了。';
  end if;
  if char_length(v_reason) < 4 then
    raise exception '理由至少寫一句，四個字也算。';
  end if;
  if char_length(v_reason) > 120 then
    raise exception '理由太長了，120 字以內。';
  end if;

  v_key := lower(v_company);

  select count(distinct company_key) into v_others
  from public.posts
  where user_id = v_uid and company_key <> v_key;

  if v_others >= 3 then
    raise exception '一個信箱只能推 3 家';
  end if;

  insert into public.posts (company, reason, user_id, email)
  values (v_company, v_reason, v_uid, coalesce(v_email, ''))
  returning id into v_id;

  insert into public.votes (post_id, user_id, dir)
  values (v_id, v_uid, 1)
  on conflict (post_id, user_id) do nothing;

  return v_id;
end;
$$;

create or replace function public.cast_vote(p_post uuid, p_dir smallint)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_phase text;
  v_prev smallint;
  v_score int;
begin
  if v_uid is null then
    raise exception '先留信箱才能推。';
  end if;
  if p_dir is null or p_dir not in (-1, 1) then
    raise exception '這個動作怪怪的。';
  end if;

  select phase into v_phase from public.settings where id = 1;
  if v_phase is distinct from 'nominate' then
    raise exception '推薦階段已經結束了。';
  end if;

  if not exists (select 1 from public.posts where id = p_post and hidden = false) then
    raise exception '這則不見了。';
  end if;

  select dir into v_prev from public.votes
  where post_id = p_post and user_id = v_uid;

  if v_prev is null then
    insert into public.votes (post_id, user_id, dir) values (p_post, v_uid, p_dir);
  elsif v_prev = p_dir then
    delete from public.votes where post_id = p_post and user_id = v_uid;
  else
    update public.votes set dir = p_dir
    where post_id = p_post and user_id = v_uid;
  end if;

  select up - down + adjust into v_score from public.posts where id = p_post;
  return v_score;
end;
$$;

create or replace function public.report_post(p_post uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception '先留信箱才能檢舉。';
  end if;
  if not exists (select 1 from public.posts where id = p_post) then
    raise exception '這則不見了。';
  end if;
  insert into public.reports (post_id, user_id) values (p_post, v_uid)
  on conflict (post_id, user_id) do nothing;
end;
$$;

create or replace function public.cast_final_vote(p_finalist uuid)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_phase text;
  v_used int;
  v_picks uuid[];
begin
  if v_uid is null then
    raise exception '先留信箱才能投。';
  end if;

  select phase into v_phase from public.settings where id = 1;
  if v_phase is distinct from 'vote' then
    raise exception '現在不是投票時間。';
  end if;

  if not exists (select 1 from public.finalists where id = p_finalist) then
    raise exception '這家不在名單上。';
  end if;

  if exists (
    select 1 from public.final_votes
    where finalist_id = p_finalist and user_id = v_uid
  ) then
    delete from public.final_votes
    where finalist_id = p_finalist and user_id = v_uid;
  else
    select count(*) into v_used from public.final_votes where user_id = v_uid;
    if v_used >= 3 then
      raise exception '3 票用完了，先取消一個。';
    end if;
    insert into public.final_votes (finalist_id, user_id) values (p_finalist, v_uid);
  end if;

  select coalesce(array_agg(finalist_id), '{}'::uuid[]) into v_picks
  from public.final_votes where user_id = v_uid;

  return v_picks;
end;
$$;

create or replace function public.my_state()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'votes', coalesce(
      (select json_object_agg(post_id::text, dir) from public.votes where user_id = auth.uid()),
      '{}'::json),
    'picks', coalesce(
      (select json_agg(finalist_id) from public.final_votes where user_id = auth.uid()),
      '[]'::json),
    'reports', coalesce(
      (select json_agg(post_id) from public.reports where user_id = auth.uid()),
      '[]'::json)
  )
  where auth.uid() is not null;
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
    'phase', (select phase from public.settings where id = 1),
    'nominate_close', (select nominate_close from public.settings where id = 1),
    'vote_close', (select vote_close from public.settings where id = 1)
  );
$$;

create or replace function public.admin_people()
returns table (
  email text,
  user_id uuid,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  n_posts bigint,
  n_votes bigint,
  n_final_votes bigint,
  companies text[]
)
language plpgsql
security definer
set search_path = public
as $$
-- The OUT parameters share names with table columns; prefer the columns.
#variable_conflict use_column
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception '這裡沒有東西。';
  end if;

  return query
  with actors as (
    select p.user_id from public.posts p
    union
    select v.user_id from public.votes v
    union
    select fv.user_id from public.final_votes fv
  )
  select
    u.email::text,
    a.user_id,
    u.created_at,
    u.last_sign_in_at,
    (select count(*) from public.posts p where p.user_id = a.user_id),
    (select count(*) from public.votes v where v.user_id = a.user_id),
    (select count(*) from public.final_votes f where f.user_id = a.user_id),
    (select coalesce(array_agg(distinct p.company), '{}'::text[])
       from public.posts p where p.user_id = a.user_id)
  from actors a
  join auth.users u on u.id = a.user_id
  order by u.created_at desc;
end;
$$;

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
      (array_agg(p.reason order by (p.up - p.down + p.adjust) desc, p.created_at))[1]
        as top_reason
    from public.posts p
    where p.hidden = false
    group by p.company_key
    order by total desc, n_posts desc
    limit 10
  )
  insert into public.finalists (company, blurb, top_reason, sort)
  select r.company, '', r.top_reason,
         row_number() over (order by r.total desc, r.n_posts desc)
  from ranked r;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function grants
-- ---------------------------------------------------------------------------

revoke all on function public.nominate(text, text) from public, anon, authenticated;
revoke all on function public.cast_vote(uuid, smallint) from public, anon, authenticated;
revoke all on function public.report_post(uuid) from public, anon, authenticated;
revoke all on function public.cast_final_vote(uuid) from public, anon, authenticated;
revoke all on function public.my_state() from public, anon, authenticated;
revoke all on function public.company_suggest(text) from public, anon, authenticated;
revoke all on function public.stats() from public, anon, authenticated;
revoke all on function public.admin_people() from public, anon, authenticated;
revoke all on function public.admin_build_finalists() from public, anon, authenticated;
revoke all on function public.is_admin() from public, anon, authenticated;

grant execute on function public.nominate(text, text) to authenticated;
grant execute on function public.cast_vote(uuid, smallint) to authenticated;
grant execute on function public.report_post(uuid) to authenticated;
grant execute on function public.cast_final_vote(uuid) to authenticated;
grant execute on function public.my_state() to authenticated;
grant execute on function public.company_suggest(text) to anon, authenticated;
grant execute on function public.stats() to anon, authenticated;
grant execute on function public.admin_people() to authenticated;
grant execute on function public.admin_build_finalists() to authenticated;
grant execute on function public.is_admin() to authenticated;
