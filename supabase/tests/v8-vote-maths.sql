-- v8 — the five acceptance cases of locked doc v1.0 (「驗收案例」), plus the two
-- paths §3 removed. Everything this file writes — including the phase switch —
-- is undone by the final `raise exception 'ROLLBACK_OK'`, which aborts the whole
-- DO statement. A PASS is the ROLLBACK_OK error itself.
--
--   node scripts/apply-sql.mjs --sql "$(sed -n '/^do /,$p' supabase/tests/v8-vote-maths.sql)"
--
-- Covered:
--   C1 a new 遺珠 with 10 distinct emails is still pending, 尚差 1 人.
--   C2 the 11th distinct email pools it; it starts at exactly 1 vote and the
--      11 supports do NOT become 11 votes.
--   C3 one reason with 26 likes and 8 dislikes gives that company +2, and
--      deleting the 8 dislikes changes the tally by 0 (they never subtract and
--      never offset a like).
--   C4 two reasons of 19 likes each give +1 +1 = +2, never floor(38/10) = 3.
--   C5 a company nominated 300 times in Phase 1 carries 0 votes into Phase 2.
--   C6 the v7c "create a company while voting" path is gone: a pending company
--      and an unknown domain are both refused, and neither is created.
do $$
declare
  r jsonb;
  res json;
  pid1 bigint;
  pid2 bigint;
  pid3 bigint;
  j int;
  v_votes int;
  v_bonus int;
  v_base int;
  v_picks int;
  v_is_cand boolean;
  v_in_pool boolean;
  v_supports int;
begin
  -- ---------------------------------------------------------------- setup
  update public.settings
     set phase_mode = 'manual', phase = 'vote', shortlist_enforced = false
   where id = 1;
  if public.effective_phase() <> 'vote' then
    raise exception 'SETUP_FAIL: phase is not vote';
  end if;
  if exists (select 1 from public.companies where domain like 'qa-v8-%') then
    raise exception 'SETUP_FAIL: a qa-v8 fixture already exists (leaked from a previous run)';
  end if;
  if exists (select 1 from public.ballots where email_key like 'qa-v8-%') then
    raise exception 'SETUP_FAIL: a qa-v8 ballot already exists';
  end if;

  insert into public.companies (domain, display_name, status, pool_entered_at)
  values ('qa-v8-a.example', 'QA 案例 A', 'active', now()),
         ('qa-v8-b.example', 'QA 案例 B', 'active', now()),
         ('qa-v8-c.example', 'QA 案例 C', 'active', now());
  insert into public.companies (domain, display_name, status)
  values ('qa-v8-x.example', 'QA 待確認遺珠', 'pending');

  -- ------------------------------- C5: 300 Phase 1 nominations carry 0 votes
  insert into public.nominations (domain, client_id)
  select 'qa-v8-c.example', 'qa-v8-nom-' || g from generate_series(1, 300) g;

  select cv.votes, cv.picks, cv.bonus, cv.vote_base, cv.is_candidate
    into v_votes, v_picks, v_bonus, v_base, v_is_cand
    from public.company_votes() cv where cv.domain = 'qa-v8-c.example';
  if not v_is_cand then
    raise exception 'C5_BROKEN: a Phase 1 nominee is not in the pool';
  end if;
  if v_votes <> 0 or v_picks <> 0 or v_bonus <> 0 or v_base <> 0 then
    raise exception 'C5_BROKEN: 300 nominations carried votes=% picks=% bonus=% base=%',
      v_votes, v_picks, v_bonus, v_base;
  end if;

  -- --------------------------- C3: one reason, 26 likes and 8 dislikes -> +2
  r := public.cast_ballot('qa-v8-1@example.com',
         jsonb_build_array(jsonb_build_object(
           'domain', 'qa-v8-a.example',
           'reason', '日本市場的切入點講得很清楚，值得借鏡')));
  pid1 := (r -> 'picks' -> 0 ->> 'pick_id')::bigint;
  if pid1 is null then
    raise exception 'C3_BROKEN: cast_ballot returned no pick_id';
  end if;
  for j in 1 .. 26 loop
    insert into public.reason_reactions (pick_id, email_key, value)
    values (pid1, 'qa-v8-like-' || j || '@example.com', 1);
  end loop;
  for j in 1 .. 8 loop
    insert into public.reason_reactions (pick_id, email_key, value)
    values (pid1, 'qa-v8-dis-' || j || '@example.com', -1);
  end loop;

  select cv.bonus, cv.votes into v_bonus, v_votes
    from public.company_votes() cv where cv.domain = 'qa-v8-a.example';
  if v_bonus <> 2 or v_votes <> 3 then
    raise exception 'C3_BROKEN: 26 likes / 8 dislikes gave bonus=% votes=% (want 2 / 3)',
      v_bonus, v_votes;
  end if;

  -- the dislikes must be inert: deleting all 8 of them must change nothing
  delete from public.reason_reactions rr where rr.pick_id = pid1 and rr.value = -1;
  select cv.bonus, cv.votes into v_bonus, v_votes
    from public.company_votes() cv where cv.domain = 'qa-v8-a.example';
  if v_bonus <> 2 or v_votes <> 3 then
    raise exception 'C3_DISLIKE_BROKEN: removing 8 dislikes changed the tally to bonus=% votes=%',
      v_bonus, v_votes;
  end if;

  -- ------------------------ C4: two reasons of 19 likes each -> +1 +1 = +2
  r := public.cast_ballot('qa-v8-2@example.com',
         jsonb_build_array(jsonb_build_object(
           'domain', 'qa-v8-b.example',
           'reason', '先在東京設點養在地業務，不靠遠端談單')));
  pid2 := (r -> 'picks' -> 0 ->> 'pick_id')::bigint;
  r := public.cast_ballot('qa-v8-3@example.com',
         jsonb_build_array(jsonb_build_object(
           'domain', 'qa-v8-b.example',
           'reason', '與日本在地通路合作，先驗證付費意願')));
  pid3 := (r -> 'picks' -> 0 ->> 'pick_id')::bigint;
  for j in 1 .. 19 loop
    insert into public.reason_reactions (pick_id, email_key, value)
    values (pid2, 'qa-v8-b2-' || j || '@example.com', 1);
    insert into public.reason_reactions (pick_id, email_key, value)
    values (pid3, 'qa-v8-b3-' || j || '@example.com', 1);
  end loop;

  select cv.bonus, cv.votes into v_bonus, v_votes
    from public.company_votes() cv where cv.domain = 'qa-v8-b.example';
  if v_bonus <> 2 then
    raise exception 'C4_BROKEN: 19 + 19 likes gave bonus=% (want 2, never floor(38/10)=3)', v_bonus;
  end if;
  if v_votes <> 4 then
    raise exception 'C4_BROKEN: 2 picks + 2 bonus gave votes=% (want 4)', v_votes;
  end if;

  -- ------------------- C1: a new 遺珠 with 10 distinct emails stays pending
  res := public.propose_candidate('QA 遺珠公司', 'qa-v8-n.example',
                                  'qa-v8-s1@example.com', '示範用的遺珠說明');
  if (res ->> 'in_pool')::boolean or (res ->> 'supports')::int <> 1 then
    raise exception 'C1_BROKEN: propose_candidate returned %', res;
  end if;
  for j in 2 .. 10 loop
    res := public.support_candidate('qa-v8-n.example', 'qa-v8-s' || j || '@example.com');
  end loop;
  if (res ->> 'supports')::int <> 10
     or (res ->> 'in_pool')::boolean
     or (res ->> 'remaining')::int <> 1 then
    raise exception 'C1_BROKEN: 10 supports returned %', res;
  end if;
  -- the same email twice must not count twice
  res := public.support_candidate('qa-v8-n.example', 'QA-V8-S10@Example.com');
  if (res ->> 'supports')::int <> 10 then
    raise exception 'C1_DEDUPE_BROKEN: a repeated email changed supports to %',
      res ->> 'supports';
  end if;
  select cv.is_candidate, cv.in_pool into v_is_cand, v_in_pool
    from public.company_votes() cv where cv.domain = 'qa-v8-n.example';
  if v_is_cand then
    raise exception 'C1_BROKEN: a pending 遺珠 is already a candidate';
  end if;
  if not exists (select 1 from public.pending_candidates() pc
                  where pc.domain = 'qa-v8-n.example' and pc.supports = 10 and pc.remaining = 1) then
    raise exception 'C1_BROKEN: pending_candidates() does not show 10 supports / 尚差 1 人';
  end if;

  -- ------------------ C2: the 11th distinct email pools it at exactly 1 vote
  res := public.support_candidate('qa-v8-n.example', 'qa-v8-s11@example.com');
  if not (res ->> 'in_pool')::boolean
     or not (res ->> 'just_entered')::boolean
     or (res ->> 'supports')::int <> 11
     or (res ->> 'remaining')::int <> 0 then
    raise exception 'C2_BROKEN: the 11th support returned %', res;
  end if;
  select cv.votes, cv.vote_base, cv.picks, cv.supports, cv.is_candidate
    into v_votes, v_base, v_picks, v_supports, v_is_cand
    from public.company_votes() cv where cv.domain = 'qa-v8-n.example';
  if v_votes <> 1 or v_base <> 1 or v_picks <> 0 or v_supports <> 11 or not v_is_cand then
    raise exception 'C2_BROKEN: pooled 遺珠 has votes=% base=% picks=% supports=% candidate=% (want 1/1/0/11/true)',
      v_votes, v_base, v_picks, v_supports, v_is_cand;
  end if;
  if exists (select 1 from public.pending_candidates() pc where pc.domain = 'qa-v8-n.example') then
    raise exception 'C2_BROKEN: a pooled company is still listed as pending';
  end if;

  -- ------------------- C6: voting never creates a company any more (v7c gone)
  begin
    r := public.cast_ballot('qa-v8-4@example.com',
           jsonb_build_array(jsonb_build_object(
             'domain', 'qa-v8-x.example', 'name', 'QA 待確認遺珠',
             'reason', '這家公司還沒進入正式投票池')));
    raise exception 'C6_BROKEN: a pending company was accepted as a pick';
  exception when others then
    if sqlerrm like 'C6_BROKEN%' then raise; end if;
    if sqlerrm not like '%待確認遺珠%' then
      raise exception 'C6_BAD_MESSAGE: %', sqlerrm;
    end if;
  end;

  begin
    r := public.cast_ballot('qa-v8-5@example.com',
           jsonb_build_array(jsonb_build_object(
             'domain', 'qa-v8-new.example', 'name', 'QA 全新公司',
             'reason', '投票流程不應該建立新公司')));
    raise exception 'C6_BROKEN: voting created a brand-new company';
  exception when others then
    if sqlerrm like 'C6_BROKEN%' then raise; end if;
    if sqlerrm not like '%找不到這家公司%' then
      raise exception 'C6_BAD_MESSAGE: %', sqlerrm;
    end if;
  end;
  if exists (select 1 from public.companies where domain = 'qa-v8-new.example') then
    raise exception 'C6_BROKEN: qa-v8-new.example was created by a rejected pick';
  end if;

  -- All five doc cases and both removed paths behave. Undo everything.
  raise exception 'ROLLBACK_OK';
end $$;
