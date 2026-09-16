-- v6s — the Phase 2 shortlist. Everything this file writes (including the
-- phase switch and the cleared fixture tables) is undone by the final
-- `raise exception 'ROLLBACK_OK'`, which aborts the whole DO statement.
--
--   node scripts/apply-sql.mjs --sql "$(sed -n '/^do /,$p' supabase/tests/v6s-shortlist.sql)"
--
-- Covered: distinct-email ranking beats raw spam; ties break on the earliest
-- nomination; locking produces exactly 10; a ballot for a company outside a
-- locked shortlist is refused in Chinese; an empty shortlist falls back to
-- the live top 10.
do $$
declare
  r10 text := '一二三四五六七八九十';
  i int;
  j int;
  d text;
  n int;
  spam record;
  pair record;
  tie_a record;
  tie_b record;
  b json;
  is_locked boolean;
begin
  -- Act as the owner: transaction-local, so it dies with the rollback.
  perform set_config('request.jwt.claims', '{"email":"ray860408@gmail.com"}', true);
  if not public.is_admin() then raise exception 'FAIL: cannot act as admin'; end if;

  update public.settings set phase_mode = 'manual', phase = 'vote' where id = 1;
  if public.effective_phase() <> 'vote' then raise exception 'FAIL: phase not vote'; end if;

  -- Deterministic fixture. The live rows are cleared inside this aborted
  -- transaction so the ranking is exactly what this test builds.
  delete from public.shortlist;
  delete from public.nominations;

  -- 14 ranked companies; company i has (20 - i) distinct nominators, so the
  -- ranking is 01 … 14 with no ties and the top 10 is 01 … 10.
  for i in 1 .. 14 loop
    d := 'qa-v6s-' || lpad(i::text, 2, '0') || '.example';
    insert into public.companies (domain, display_name, status)
    values (d, 'QA 名單 ' || i, 'active')
    on conflict (domain) do nothing;
    for j in 1 .. (20 - i) loop
      insert into public.nominations (domain, email, reason)
      values (d, 'v' || i || '-' || j || '@example.com', r10);
    end loop;
  end loop;

  -- (1) Five nominations from ONE email must lose to two from TWO emails.
  insert into public.companies (domain, display_name, status) values
    ('qa-v6s-spam.example', 'QA 灌票', 'active'),
    ('qa-v6s-pair.example', 'QA 兩人', 'active')
  on conflict (domain) do nothing;
  for j in 1 .. 5 loop
    insert into public.nominations (domain, email, reason)
    values ('qa-v6s-spam.example', 'spam@example.com', r10);
  end loop;
  insert into public.nominations (domain, email, reason) values
    ('qa-v6s-pair.example', 'p1@example.com', r10),
    ('qa-v6s-pair.example', 'p2@example.com', r10);

  select nr.voters, nr.noms, nr.rank into spam
  from public.nomination_rank() nr where nr.domain = 'qa-v6s-spam.example';
  select nr.voters, nr.noms, nr.rank into pair
  from public.nomination_rank() nr where nr.domain = 'qa-v6s-pair.example';
  if spam.voters <> 1 or spam.noms <> 5 then
    raise exception 'FAIL: spam counted % voters / % noms', spam.voters, spam.noms;
  end if;
  if pair.voters <> 2 or pair.noms <> 2 then
    raise exception 'FAIL: pair counted % voters / % noms', pair.voters, pair.noms;
  end if;
  if pair.rank >= spam.rank then
    raise exception 'FAIL: raw spam (rank %) outranked two real nominators (rank %)',
      spam.rank, pair.rank;
  end if;

  -- (2) Same voter count → the earliest first nomination wins.
  insert into public.companies (domain, display_name, status) values
    ('qa-v6s-tie-a.example', 'QA 平手甲', 'active'),
    ('qa-v6s-tie-b.example', 'QA 平手乙', 'active')
  on conflict (domain) do nothing;
  for j in 1 .. 3 loop
    insert into public.nominations (domain, email, reason, created_at)
    values ('qa-v6s-tie-a.example', 'ta' || j || '@example.com', r10, now() - interval '2 hours');
    insert into public.nominations (domain, email, reason, created_at)
    values ('qa-v6s-tie-b.example', 'tb' || j || '@example.com', r10, now() - interval '1 hour');
  end loop;
  select nr.voters, nr.rank into tie_a
  from public.nomination_rank() nr where nr.domain = 'qa-v6s-tie-a.example';
  select nr.voters, nr.rank into tie_b
  from public.nomination_rank() nr where nr.domain = 'qa-v6s-tie-b.example';
  if tie_a.voters <> tie_b.voters then
    raise exception 'FAIL: tie fixture is not tied (% vs %)', tie_a.voters, tie_b.voters;
  end if;
  if tie_a.rank >= tie_b.rank then
    raise exception 'FAIL: tie-break ignored the earlier nomination (% vs %)',
      tie_a.rank, tie_b.rank;
  end if;

  -- (5) No lock yet → Phase 2 falls back to the live top 10.
  if (select count(*) from public.shortlist) <> 0 then
    raise exception 'FAIL: shortlist should still be empty';
  end if;
  select count(*) into n from public.shortlist_domains();
  if n <> 10 then raise exception 'FAIL: live fallback offered % domains, expected 10', n; end if;
  if not exists (select 1 from public.shortlist_domains() s where s.domain = 'qa-v6s-01.example')
    or exists (select 1 from public.shortlist_domains() s where s.domain = 'qa-v6s-11.example') then
    raise exception 'FAIL: live fallback is not the top 10';
  end if;
  b := public.cast_ballot('v6s-live@example.com',
        jsonb_build_array(jsonb_build_object('domain', 'qa-v6s-01.example', 'reason', r10)));
  if b ->> 'ballot_id' is null then raise exception 'FAIL: live-fallback ballot rejected'; end if;
  begin
    perform public.cast_ballot('v6s-live2@example.com',
      jsonb_build_array(jsonb_build_object('domain', 'qa-v6s-11.example', 'reason', r10)));
    raise exception 'LIVE_OUTSIDER_ACCEPTED';
  exception when others then
    if sqlerrm <> '這家公司不在第二階段的前 10 名名單中。' then
      raise exception 'FAIL live outsider: %', sqlerrm;
    end if;
  end;

  -- (3) Locking freezes exactly 10 rows.
  select count(*) into n from public.admin_lock_shortlist();
  if n <> 10 then raise exception 'FAIL: admin_lock_shortlist returned % rows', n; end if;
  if (select count(*) from public.shortlist) <> 10 then
    raise exception 'FAIL: shortlist table holds % rows', (select count(*) from public.shortlist);
  end if;
  if not exists (select 1 from public.shortlist s where s.domain = 'qa-v6s-10.example')
    or exists (select 1 from public.shortlist s where s.domain = 'qa-v6s-11.example') then
    raise exception 'FAIL: locked shortlist is not the top 10';
  end if;

  -- admin_shortlist() shows every nominated company, flagged in/out.
  select count(*) into n from public.admin_shortlist();
  if n <> 18 then raise exception 'FAIL: admin_shortlist returned % rows, expected 18', n; end if;
  select count(*) into n from public.admin_shortlist() a where a.in_shortlist;
  if n <> 10 then raise exception 'FAIL: admin_shortlist flags % companies in', n; end if;
  select a.locked into is_locked from public.admin_shortlist() a limit 1;
  if not is_locked then raise exception 'FAIL: admin_shortlist should report locked'; end if;

  -- (4) Outside the LOCKED shortlist → refused, in Chinese.
  begin
    perform public.cast_ballot('v6s-out@example.com',
      jsonb_build_array(jsonb_build_object('domain', 'qa-v6s-pair.example', 'reason', r10)));
    raise exception 'LOCKED_OUTSIDER_ACCEPTED';
  exception when others then
    if sqlerrm <> '這家公司不在第二階段的前 10 名名單中。' then
      raise exception 'FAIL locked outsider: %', sqlerrm;
    end if;
  end;

  -- Manual override: ranks follow the array order and the override decides.
  perform public.admin_set_shortlist(array['qa-v6s-11.example', 'qa-v6s-pair.example']);
  if (select count(*) from public.shortlist) <> 2 then
    raise exception 'FAIL: manual shortlist size';
  end if;
  if (select s.rank from public.shortlist s where s.domain = 'qa-v6s-11.example') <> 1
    or (select s.rank from public.shortlist s where s.domain = 'qa-v6s-pair.example') <> 2 then
    raise exception 'FAIL: manual ranks do not follow the array order';
  end if;
  b := public.cast_ballot('v6s-manual@example.com',
        jsonb_build_array(jsonb_build_object('domain', 'qa-v6s-11.example', 'reason', r10)));
  if b ->> 'ballot_id' is null then raise exception 'FAIL: manual shortlist ballot rejected'; end if;
  begin
    perform public.cast_ballot('v6s-manual2@example.com',
      jsonb_build_array(jsonb_build_object('domain', 'qa-v6s-01.example', 'reason', r10)));
    raise exception 'MANUAL_OUTSIDER_ACCEPTED';
  exception when others then
    if sqlerrm <> '這家公司不在第二階段的前 10 名名單中。' then
      raise exception 'FAIL manual outsider: %', sqlerrm;
    end if;
  end;

  -- vote_candidates() offers the shortlist and nothing else.
  select count(*) into n from public.vote_candidates('');
  if n <> 2 then raise exception 'FAIL: vote_candidates offered % rows, expected 2', n; end if;

  -- Clearing the override hands Phase 2 back to the live top 10.
  perform public.admin_set_shortlist(array[]::text[]);
  if (select count(*) from public.shortlist) <> 0 then
    raise exception 'FAIL: clearing the override left rows behind';
  end if;
  select count(*) into n from public.shortlist_domains();
  if n <> 10 then raise exception 'FAIL: fallback after clear offered %', n; end if;

  -- A company nobody nominated cannot be put on the list: cast_ballot would
  -- refuse it while /admin still showed 入選.
  insert into public.companies (domain, display_name, status)
  values ('qa-v6s-seed.example', 'QA 種子', 'active')
  on conflict (domain) do nothing;
  begin
    perform public.admin_set_shortlist(array['qa-v6s-01.example', 'qa-v6s-seed.example']);
    raise exception 'UNNOMINATED_ACCEPTED';
  exception when others then
    if sqlerrm <> '名單裡有尚未被提名、已隱藏或已合併的公司。' then
      raise exception 'FAIL unnominated: %', sqlerrm;
    end if;
  end;

  -- Merging a shortlisted company frees its slot instead of leaving a dead
  -- one that shortlist_domains() offers and cast_ballot() then refuses.
  perform public.admin_lock_shortlist(10);
  if (select count(*) from public.shortlist) <> 10 then
    raise exception 'FAIL: re-lock did not produce 10';
  end if;
  perform public.admin_merge_company('qa-v6s-10.example', 'qa-v6s-01.example');
  if exists (select 1 from public.shortlist s where s.domain = 'qa-v6s-10.example') then
    raise exception 'FAIL: the merged company kept its shortlist slot';
  end if;
  select count(*) into n from public.shortlist_domains();
  if n <> 9 then
    raise exception 'FAIL: shortlist_domains() after merge offered %, expected 9', n;
  end if;

  raise exception 'ROLLBACK_OK';
end;
$$;
