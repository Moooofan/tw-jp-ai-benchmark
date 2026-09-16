-- v7c — Phase 2 voting without a mandatory shortlist. Everything this file
-- writes (including the phase/shortlist_enforced switches) is undone by the
-- final `raise exception 'ROLLBACK_OK'`, which aborts the whole DO statement.
--
--   node scripts/apply-sql.mjs --sql "$(sed -n '/^do /,$p' supabase/tests/v7c-vote.sql)"
--
-- Covered:
--   T1 voting for a brand-new company creates the company (status=pending),
--      a nominations row and a ballot_picks row.
--   T2 the 3-per-ballot cap (4 picks raises, and the 4th/unresolved
--      companies are never created).
--   T3 one ballot per person per Asia/Taipei day.
--   T4 reason length: 9 chars and 51 chars are both rejected, and neither
--      rejected pick creates a company.
--   T5 reaction bonus: net +10 on one pick = +1 vote; net -10 = -1 vote.
--   T6 shortlist: with shortlist_enforced=false a non-shortlist company is
--      accepted; after flipping shortlist_enforced=true (inside this same
--      rolled-back transaction) the same shape of pick is refused. A
--      locked shortlist that excludes the QA domain is used so the result
--      does not depend on how many real companies are nominated live.
--
-- We force phase='vote' (as v7-rollback.sql / v6s-shortlist.sql already do)
-- rather than adding a public.testers row, since this is inside the same
-- transaction that always rolls back and never touches the live settings
-- row.
do $$
declare
  r10 text := '一二三四五六七八九十';
  r jsonb;
  pid bigint;
  v record;
  i int;
begin
  -- ---------------------------------------------------------------- setup
  update public.settings
    set phase_mode = 'manual', phase = 'vote', shortlist_enforced = false
    where id = 1;
  if public.effective_phase() <> 'vote' then
    raise exception 'SETUP_FAIL: phase not vote';
  end if;
  if public.shortlist_is_enforced() then
    raise exception 'SETUP_FAIL: shortlist_enforced not false';
  end if;

  if exists (
    select 1 from public.companies
    where domain in ('qa-a.example', 'qa-b.example', 'qa-c.example', 'qa-d.example',
                      'qa-t4-x.example', 'qa-t4-y.example', 'qa-t6.example', 'qa-t6-other.example')
  ) then
    raise exception 'SETUP_FAIL: a QA fixture domain already exists (leaked from a previous run)';
  end if;

  -- --------------------------------------------------------- T1: creation
  r := public.cast_ballot(
    'qa-t1@example.com',
    jsonb_build_array(jsonb_build_object('domain', 'qa-a.example', 'name', 'QA 測試公司 A', 'reason', r10)),
    'qa-cid-1'
  );
  pid := (r -> 'picks' -> 0 ->> 'pick_id')::bigint;
  if r ->> 'ballot_id' is null or pid is null
     or (r -> 'picks' -> 0 ->> 'domain') is distinct from 'qa-a.example' then
    raise exception 'T1_FAIL_BALLOT: %', r;
  end if;
  if not exists (
    select 1 from public.companies c
    where c.domain = 'qa-a.example' and c.status = 'pending' and c.display_name = 'QA 測試公司 A'
  ) then
    raise exception 'T1_FAIL_COMPANY_NOT_CREATED';
  end if;
  if not exists (select 1 from public.nominations n where n.domain = 'qa-a.example') then
    raise exception 'T1_FAIL_NOMINATION_NOT_CREATED';
  end if;
  if not exists (select 1 from public.ballot_picks bp where bp.id = pid and bp.domain = 'qa-a.example') then
    raise exception 'T1_FAIL_PICK_NOT_CREATED';
  end if;

  -- ------------------------------------------------------ T2: max 3 picks
  begin
    perform public.cast_ballot('qa-t2@example.com', jsonb_build_array(
      jsonb_build_object('domain', 'qa-a.example', 'reason', r10),
      jsonb_build_object('domain', 'qa-b.example', 'name', 'QA B', 'reason', r10),
      jsonb_build_object('domain', 'qa-c.example', 'name', 'QA C', 'reason', r10),
      jsonb_build_object('domain', 'qa-d.example', 'name', 'QA D', 'reason', r10)
    ), null);
    raise exception 'T2_FAIL: 4 picks accepted';
  exception when others then
    if sqlerrm not like '每張選票最多選 3 家公司%' then
      raise exception 'T2_FAIL: %', sqlerrm;
    end if;
  end;
  if exists (select 1 from public.companies where domain in ('qa-b.example', 'qa-c.example', 'qa-d.example')) then
    raise exception 'T2_FAIL_LEAKED_COMPANY: rejected ballot still created a company';
  end if;

  -- ------------------------------------------------- T3: one ballot / day
  begin
    perform public.cast_ballot(
      'qa-t1@example.com',
      jsonb_build_array(jsonb_build_object('domain', 'qa-a.example', 'reason', r10)),
      null
    );
    raise exception 'T3_FAIL: second same-day ballot accepted';
  exception when others then
    if sqlerrm <> '今天已經投過了，明天可以再投一次。' then
      raise exception 'T3_FAIL: %', sqlerrm;
    end if;
  end;

  -- --------------------------------------------------- T4: reason length
  begin
    perform public.cast_ballot(
      'qa-t4@example.com',
      jsonb_build_array(jsonb_build_object('domain', 'qa-t4-x.example', 'name', 'QA T4 X', 'reason', left(r10, 9))),
      null
    );
    raise exception 'T4_FAIL_9: 9-char reason accepted';
  exception when others then
    if sqlerrm not like '每家公司的理由需要%' then
      raise exception 'T4_FAIL_9: %', sqlerrm;
    end if;
  end;
  if exists (select 1 from public.companies where domain = 'qa-t4-x.example') then
    raise exception 'T4_FAIL_9_LEAKED_COMPANY';
  end if;

  begin
    perform public.cast_ballot(
      'qa-t4@example.com',
      jsonb_build_array(jsonb_build_object('domain', 'qa-t4-y.example', 'name', 'QA T4 Y', 'reason', rpad(r10, 51, '字'))),
      null
    );
    raise exception 'T4_FAIL_51: 51-char reason accepted';
  exception when others then
    if sqlerrm not like '每家公司的理由需要%' then
      raise exception 'T4_FAIL_51: %', sqlerrm;
    end if;
  end;
  if exists (select 1 from public.companies where domain = 'qa-t4-y.example') then
    raise exception 'T4_FAIL_51_LEAKED_COMPANY';
  end if;

  -- --------------------------------------------------- T5: reaction bonus
  for i in 1 .. 10 loop
    perform public.react_reason(pid, 'qa-fan' || i || '@example.com', 1::smallint);
  end loop;
  select * into v from public.company_votes() x where x.domain = 'qa-a.example';
  if v.reaction_net <> 10 or v.bonus <> 1 then
    raise exception 'T5_FAIL_PLUS: net=% bonus=% votes=%', v.reaction_net, v.bonus, v.votes;
  end if;

  for i in 1 .. 10 loop
    perform public.react_reason(pid, 'qa-fan' || i || '@example.com', (-1)::smallint);
  end loop;
  select * into v from public.company_votes() x where x.domain = 'qa-a.example';
  if v.reaction_net <> -10 or v.bonus <> -1 then
    raise exception 'T5_FAIL_MINUS: net=% bonus=% votes=%', v.reaction_net, v.bonus, v.votes;
  end if;

  -- --------------------------------------------------- T6: shortlist gate
  -- Lock a shortlist that does NOT include qa-t6.example, so the assertion
  -- below does not depend on how many real companies are nominated live
  -- (a non-empty public.shortlist always wins over the live top-10 fallback
  -- in shortlist_domains()).
  insert into public.companies (domain, display_name, status)
  values ('qa-t6-other.example', 'QA T6 Other', 'active')
  on conflict (domain) do nothing;
  insert into public.shortlist (domain, rank)
  values ('qa-t6-other.example', 1)
  on conflict (domain) do nothing;

  r := public.cast_ballot(
    'qa-t6a@example.com',
    jsonb_build_array(jsonb_build_object('domain', 'qa-t6.example', 'name', 'QA T6', 'reason', r10)),
    null
  );
  if r ->> 'ballot_id' is null then
    raise exception 'T6_FAIL_OFF: shortlist_enforced=false rejected a non-shortlist pick: %', r;
  end if;

  update public.settings set shortlist_enforced = true where id = 1;
  if not public.shortlist_is_enforced() then
    raise exception 'T6_FAIL_FLAG_NOT_SET';
  end if;

  begin
    perform public.cast_ballot(
      'qa-t6b@example.com',
      jsonb_build_array(jsonb_build_object('domain', 'qa-t6.example', 'reason', r10)),
      null
    );
    raise exception 'T6_FAIL_ON: shortlist_enforced=true accepted a non-shortlist pick';
  exception when others then
    if sqlerrm <> '這家公司不在第二階段的前 10 名名單中。' then
      raise exception 'T6_FAIL_ON: %', sqlerrm;
    end if;
  end;

  update public.settings set shortlist_enforced = false where id = 1;
  if public.shortlist_is_enforced() then
    raise exception 'T6_FAIL_FLAG_NOT_RESET';
  end if;

  raise exception 'ROLLBACK_OK';
end;
$$;
