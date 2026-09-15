do $$
declare
  a text := 'qa-v7-a.example';
  b text := 'qa-v7-b.example';
  c text := 'qa-v7-c.example';
  d text := 'qa-v7-d.example';
  r10 text := '一二三四五六七八九十';
  r json;
  pa bigint;
  pb bigint;
  bal2 bigint;
  i int;
  v record;
  lb json;
  pos text;
begin
  -- Scenario setup (all rolled back by the final exception).
  update public.settings set phase_mode = 'manual', phase = 'vote' where id = 1;
  if public.effective_phase() <> 'vote' then raise exception 'FAIL: phase not vote'; end if;
  delete from public.leaderboard_snapshots;
  insert into public.companies (domain, display_name, status) values
    (a, 'QA 甲公司', 'active'), (b, 'QA 乙公司', 'active'),
    (c, 'QA 丙公司', 'active'), (d, 'QA 丁公司', 'active');
  insert into public.nominations (domain) values (a), (b), (c), (d);

  r := public.cast_ballot('QA1@example.com', jsonb_build_array(
         jsonb_build_object('domain', a, 'reason', '甲公司的 AI 服務很有代表性'),
         jsonb_build_object('domain', b, 'reason', '乙公司在日本市場很活躍')));
  pa := (r -> 'picks' -> 0 ->> 'pick_id')::bigint;
  pb := (r -> 'picks' -> 1 ->> 'pick_id')::bigint;
  if pa is null or pb is null or json_array_length(r -> 'picks') <> 2 then
    raise exception 'FAIL: cast_ballot payload %', r;
  end if;

  -- second ballot same Taipei day (same email_key, different spelling)
  begin
    perform public.cast_ballot(' qa1@EXAMPLE.com ', jsonb_build_array(jsonb_build_object('domain', c, 'reason', r10)));
    raise exception 'FAIL: second ballot accepted';
  exception when others then
    if sqlerrm <> '今天已經投過了，明天可以再投一次。' then raise exception 'FAIL second ballot: %', sqlerrm; end if;
  end;
  -- 4 picks
  begin
    perform public.cast_ballot('qa2@example.com', jsonb_build_array(
      jsonb_build_object('domain', a, 'reason', r10), jsonb_build_object('domain', b, 'reason', r10),
      jsonb_build_object('domain', c, 'reason', r10), jsonb_build_object('domain', d, 'reason', r10)));
    raise exception 'FAIL: 4 picks accepted';
  exception when others then
    if sqlerrm not like '每張選票最多選 3 家公司%' then raise exception 'FAIL 4 picks: %', sqlerrm; end if;
  end;
  -- 9-char reason
  begin
    perform public.cast_ballot('qa2@example.com', jsonb_build_array(jsonb_build_object('domain', a, 'reason', left(r10, 9))));
    raise exception 'FAIL: 9-char reason accepted';
  exception when others then
    if sqlerrm not like '每家公司的理由需要%' then raise exception 'FAIL 9 chars: %', sqlerrm; end if;
  end;
  -- duplicate domain in one ballot
  begin
    perform public.cast_ballot('qa2@example.com', jsonb_build_array(
      jsonb_build_object('domain', a, 'reason', r10), jsonb_build_object('domain', 'https://www.' || a, 'reason', r10)));
    raise exception 'FAIL: duplicate domain accepted';
  exception when others then
    if sqlerrm not like '同一家公司只能選一次%' then raise exception 'FAIL dup domain: %', sqlerrm; end if;
  end;
  -- non-candidate (hidden) company
  update public.companies set status = 'hidden' where domain = d;
  begin
    perform public.cast_ballot('qa2@example.com', jsonb_build_array(jsonb_build_object('domain', d, 'reason', r10)));
    raise exception 'FAIL: hidden company accepted';
  exception when others then
    if sqlerrm not like '這家公司不在候選名單中%' then raise exception 'FAIL hidden company: %', sqlerrm; end if;
  end;
  update public.companies set status = 'active' where domain = d;

  r := public.cast_ballot('qa2@example.com', jsonb_build_array(
         jsonb_build_object('domain', a, 'reason', r10), jsonb_build_object('domain', c, 'reason', r10)));
  bal2 := (r ->> 'ballot_id')::bigint;
  if (select count(*) from public.ballots where email_key in ('qa1@example.com', 'qa2@example.com')) <> 2 then
    raise exception 'FAIL: rejected ballots left rows';
  end if;

  -- own-reason reaction ignored (D7)
  r := public.react_reason(pa, 'qa1@example.com', 1::smallint);
  if (r ->> 'likes')::int <> 0 then raise exception 'FAIL: own reaction counted %', r; end if;

  -- 10 likes from 10 emails -> +1
  for i in 1 .. 10 loop
    perform public.react_reason(pa, 'fan' || i || '@example.com', 1::smallint);
  end loop;
  select * into v from public.company_votes() x where x.domain = a;
  if v.picks <> 2 or v.reaction_net <> 10 or v.bonus <> 1 or v.votes <> 3 then
    raise exception 'FAIL 10 likes: %', row_to_json(v);
  end if;
  -- re-liking is one stance, not two
  perform public.react_reason(pa, 'fan1@example.com', 1::smallint);
  -- 19 -> +1
  for i in 11 .. 19 loop
    perform public.react_reason(pa, 'fan' || i || '@example.com', 1::smallint);
  end loop;
  select * into v from public.company_votes() x where x.domain = a;
  if v.reaction_net <> 19 or v.bonus <> 1 or v.votes <> 3 then raise exception 'FAIL 19 likes: %', row_to_json(v); end if;
  -- clear (0) then re-add
  r := public.react_reason(pa, 'fan19@example.com', 0::smallint);
  if (r ->> 'likes')::int <> 18 then raise exception 'FAIL clear: %', r; end if;
  perform public.react_reason(pa, 'fan19@example.com', 1::smallint);

  -- -10 on B -> -1 (and -19 stays -1)
  for i in 1 .. 10 loop
    perform public.react_reason(pb, 'hater' || i || '@example.com', -1::smallint);
  end loop;
  select * into v from public.company_votes() x where x.domain = b;
  if v.reaction_net <> -10 or v.bonus <> -1 or v.votes <> 0 then raise exception 'FAIL -10: %', row_to_json(v); end if;
  for i in 11 .. 19 loop
    perform public.react_reason(pb, 'hater' || i || '@example.com', -1::smallint);
  end loop;
  select * into v from public.company_votes() x where x.domain = b;
  if v.reaction_net <> -19 or v.bonus <> -1 then raise exception 'FAIL -19: %', row_to_json(v); end if;

  -- leaderboard: A 3 votes, C 1, B 0 (1 reason), D 0 (0 reasons); movement vs a 2h-old snapshot
  insert into public.leaderboard_snapshots (taken_at, domain, rank, votes) values
    (now() - interval '2 hours', c, 1, 0), (now() - interval '2 hours', a, 2, 0), (now() - interval '2 hours', b, 3, 0);
  lb := public.vote_board() -> 'leaderboard';
  select string_agg((e ->> 'domain') || ':' || (e ->> 'votes') || ':' || (e ->> 'movement'), ',' order by (e ->> 'rank')::int)
    into pos
  from json_array_elements(lb) e where e ->> 'domain' like 'qa-v7-%';
  if pos <> a || ':3:up,' || c || ':1:down,' || b || ':0:same,' || d || ':0:new' then
    raise exception 'FAIL leaderboard order: %', pos;
  end if;
  if exists (
    select 1 from (select (e ->> 'rank')::int rk, row_number() over (order by (e ->> 'rank')::int) rn
                   from json_array_elements(lb) e) z where z.rk <> z.rn) then
    raise exception 'FAIL ranks not consecutive: %', lb;
  end if;
  if (select count(*) from public.leaderboard_snapshots where taken_at > now() - interval '1 minute') = 0 then
    raise exception 'FAIL: lazy snapshot not taken';
  end if;

  -- admin functions reject non-admins
  begin
    perform public.admin_set_ballot_void(bal2, true);
    raise exception 'FAIL: admin_set_ballot_void allowed without admin';
  exception when others then
    if sqlerrm <> '需要管理員權限。' then raise exception 'FAIL admin gate: %', sqlerrm; end if;
  end;
  perform set_config('request.jwt.claims', '{"email":"ray860408@gmail.com","role":"authenticated"}', true);
  if not public.is_admin() then raise exception 'FAIL: admin claim not honoured'; end if;

  -- voided ballot removes its picks (qa2: A and C)
  perform public.admin_set_ballot_void(bal2, true);
  select * into v from public.company_votes() x where x.domain = a;
  if v.picks <> 1 or v.votes <> 2 then raise exception 'FAIL void A: %', row_to_json(v); end if;
  select * into v from public.company_votes() x where x.domain = c;
  if v.picks <> 0 or v.votes <> 0 then raise exception 'FAIL void C: %', row_to_json(v); end if;

  -- hidden reason removes its reactions from the bonus (pick still counts)
  perform public.admin_set_reason_hidden(pa, true);
  select * into v from public.company_votes() x where x.domain = a;
  if v.picks <> 1 or v.reasons <> 0 or v.reaction_net <> 0 or v.bonus <> 0 or v.votes <> 1 then
    raise exception 'FAIL hidden reason: %', row_to_json(v);
  end if;
  begin
    perform public.react_reason(pa, 'late@example.com', 1::smallint);
    raise exception 'FAIL: reaction on hidden reason accepted';
  exception when others then
    if sqlerrm not like '這則理由已不存在%' then raise exception 'FAIL hidden react: %', sqlerrm; end if;
  end;
  if exists (select 1 from unnest(public.reason_corpus(a)) t where t like '甲公司的%') then
    raise exception 'FAIL: hidden reason in corpus';
  end if;

  -- vote_adjust (D6) and company_detail
  perform public.admin_set_vote_adjust(d, 5);
  r := public.company_detail('https://www.' || d || '/x');
  if (r ->> 'votes')::int <> 5 or (r ->> 'rank')::int >= (public.company_detail(a) ->> 'rank')::int then
    raise exception 'FAIL adjust/detail: % / %', r, public.company_detail(a);
  end if;
  if public.company_detail('nope-qa-v7.example') is not null then raise exception 'FAIL: detail for unknown'; end if;
  if (select count(*) from public.admin_vote_stats() s where s.domain like 'qa-v7-%') <> 4 then
    raise exception 'FAIL admin_vote_stats';
  end if;
  if json_array_length(public.admin_ballots(50, 0) -> 'ballots') < 2 then raise exception 'FAIL admin_ballots'; end if;

  -- my_vote_state and candidates
  r := public.my_vote_state('qa1@example.com');
  if (r ->> 'voted_today')::boolean is not true or json_array_length(r -> 'today') <> 2 then
    raise exception 'FAIL my_vote_state: %', r;
  end if;
  r := public.my_vote_state('fan3@example.com');
  if json_array_length(r -> 'reactions') <> 1 or (r ->> 'voted_today')::boolean then raise exception 'FAIL my_vote_state reactions: %', r; end if;
  if (select v2.domain from public.vote_candidates('QA 甲') v2 limit 1) <> a then raise exception 'FAIL vote_candidates'; end if;

  -- phase gate + tester bypass
  update public.settings set phase = 'nominate' where id = 1;
  begin
    perform public.cast_ballot('qa3@example.com', jsonb_build_array(jsonb_build_object('domain', a, 'reason', r10)));
    raise exception 'FAIL: ballot accepted in nominate';
  exception when others then
    if sqlerrm <> '投票尚未開放。' then raise exception 'FAIL phase gate: %', sqlerrm; end if;
  end;
  perform public.admin_testers_set('QA3@example.com', true);
  r := public.cast_ballot('qa3@example.com', jsonb_build_array(jsonb_build_object('domain', a, 'reason', r10)));
  if r ->> 'ballot_id' is null then raise exception 'FAIL tester bypass'; end if;
  r := public.react_reason((r -> 'picks' -> 0 ->> 'pick_id')::bigint, 'qa3@example.com', 1::smallint);

  raise exception 'ROLLBACK_OK';
end;
$$;
