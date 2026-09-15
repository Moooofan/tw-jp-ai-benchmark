do $$
declare
  f text := 'qa-v7b-from.example';
  t text := 'qa-v7b-into.example';
  o text := 'qa-v7b-other.example';
  r10 text := '一二三四五六七八九十';
  r json;
  b1 bigint; b2 bigint; b3 bigint;
  p1f bigint; p1i bigint; p2i bigint; p2f bigint; p3f bigint;
  v record;
  n int;
begin
  -- Scenario setup (everything is rolled back by the final exception).
  update public.settings set phase_mode = 'manual', phase = 'vote' where id = 1;
  insert into public.companies (domain, display_name, status) values
    (f, 'QA 合併來源', 'active'), (t, 'QA 合併目標', 'active'), (o, 'QA 其他', 'active');
  insert into public.nominations (domain) values (f), (t), (o);

  -- Ballot 1 picks FROM first, then INTO (same created_at, lower id = earlier).
  r := public.cast_ballot('m1@example.com', jsonb_build_array(
         jsonb_build_object('domain', f, 'reason', '來源公司理由一二三四五'),
         jsonb_build_object('domain', t, 'reason', '目標公司理由一二三四五')));
  b1 := (r ->> 'ballot_id')::bigint;
  p1f := (r -> 'picks' -> 0 ->> 'pick_id')::bigint;
  p1i := (r -> 'picks' -> 1 ->> 'pick_id')::bigint;
  -- Ballot 2 picks INTO first, then FROM, plus OTHER.
  r := public.cast_ballot('m2@example.com', jsonb_build_array(
         jsonb_build_object('domain', t, 'reason', '目標公司第二張票理由'),
         jsonb_build_object('domain', f, 'reason', '來源公司第二張票理由'),
         jsonb_build_object('domain', o, 'reason', r10)));
  b2 := (r ->> 'ballot_id')::bigint;
  p2i := (r -> 'picks' -> 0 ->> 'pick_id')::bigint;
  p2f := (r -> 'picks' -> 1 ->> 'pick_id')::bigint;
  -- Ballot 3 picks only FROM.
  r := public.cast_ballot('m3@example.com', jsonb_build_array(
         jsonb_build_object('domain', f, 'reason', r10)));
  b3 := (r ->> 'ballot_id')::bigint;
  p3f := (r -> 'picks' -> 0 ->> 'pick_id')::bigint;

  -- Ballot 1: kept = p1f (earlier). Reactions on the dropped p1i: x1 +1, x2 -1, x3 +1.
  -- x3 already disliked the kept pick, so x3's stance on the kept pick must stay -1.
  perform public.react_reason(p1i, 'x1@example.com', 1::smallint);
  perform public.react_reason(p1i, 'x2@example.com', -1::smallint);
  perform public.react_reason(p1i, 'x3@example.com', 1::smallint);
  perform public.react_reason(p1f, 'x3@example.com', -1::smallint);
  perform public.react_reason(p1f, 'x4@example.com', 1::smallint);
  -- Ballot 2: kept = p2i (earlier). Reactions on the dropped p2f: y1 +1, y2 +1 (y2 also +1 on kept).
  perform public.react_reason(p2f, 'y1@example.com', 1::smallint);
  perform public.react_reason(p2f, 'y2@example.com', 1::smallint);
  perform public.react_reason(p2i, 'y2@example.com', 1::smallint);
  perform public.react_reason(p3f, 'z1@example.com', 1::smallint);

  -- non-admin is rejected
  begin
    perform public.admin_merge_company(f, t);
    raise exception 'FAIL: merge allowed without admin';
  exception when others then
    if sqlerrm <> '需要管理員權限。' then raise exception 'FAIL admin gate: %', sqlerrm; end if;
  end;
  perform set_config('request.jwt.claims', '{"email":"ray860408@gmail.com","role":"authenticated"}', true);
  if not public.is_admin() then raise exception 'FAIL: admin claim not honoured'; end if;

  insert into public.leaderboard_snapshots (taken_at, domain, rank, votes)
    values (now() - interval '2 hours', f, 1, 3), (now() - interval '2 hours', t, 2, 2);

  perform public.admin_merge_company(f, t);

  -- no pick left on FROM; each ballot has one INTO pick
  if exists (select 1 from public.ballot_picks where domain = f) then raise exception 'FAIL: picks left on from'; end if;
  select count(*) into n from public.ballot_picks where ballot_id in (b1, b2, b3) and domain = t;
  if n <> 3 then raise exception 'FAIL: into picks % (want 3)', n; end if;
  -- ballot 1 kept the earlier pick (p1f, with its own reason), p1i is gone
  if not exists (select 1 from public.ballot_picks where id = p1f and ballot_id = b1 and domain = t and reason = '來源公司理由一二三四五') then
    raise exception 'FAIL: ballot 1 did not keep the earlier pick';
  end if;
  if exists (select 1 from public.ballot_picks where id = p1i) then raise exception 'FAIL: ballot 1 later pick not deleted'; end if;
  -- ballot 2 kept p2i, p2f gone, OTHER untouched
  if not exists (select 1 from public.ballot_picks where id = p2i and domain = t) or exists (select 1 from public.ballot_picks where id = p2f) then
    raise exception 'FAIL: ballot 2 keep/drop wrong';
  end if;
  if (select count(*) from public.ballot_picks where ballot_id = b2) <> 2 then raise exception 'FAIL: ballot 2 pick count'; end if;
  -- ballot 3 simply moved
  if not exists (select 1 from public.ballot_picks where id = p3f and domain = t) then raise exception 'FAIL: ballot 3 not moved'; end if;

  -- reactions: p1f = x3(-1 kept) + x4(+1) + moved x1(+1), x2(-1) => likes 2, dislikes 2
  select (count(*) filter (where value = 1))::int as likes, (count(*) filter (where value = -1))::int as dislikes
    into v from public.reason_reactions where pick_id = p1f;
  if v.likes <> 2 or v.dislikes <> 2 then raise exception 'FAIL p1f reactions: %', row_to_json(v); end if;
  if (select value from public.reason_reactions where pick_id = p1f and email_key = 'x3@example.com') <> -1 then
    raise exception 'FAIL: existing stance overwritten';
  end if;
  -- p2i = y2(+1) + moved y1(+1) => 2 likes, no duplicate y2
  select count(*) into n from public.reason_reactions where pick_id = p2i;
  if n <> 2 then raise exception 'FAIL p2i reactions: %', n; end if;
  if exists (select 1 from public.reason_reactions where pick_id in (p1i, p2f)) then raise exception 'FAIL: orphan reactions'; end if;

  -- tallies: INTO has 3 picks, FROM is no longer a candidate; nominations moved; snapshots of FROM gone
  select * into v from public.company_votes() x where x.domain = t;
  if v.picks <> 3 or not v.is_candidate then raise exception 'FAIL into tally: %', row_to_json(v); end if;
  select * into v from public.company_votes() x where x.domain = f;
  if v.is_candidate or v.picks <> 0 then raise exception 'FAIL from tally: %', row_to_json(v); end if;
  if (select count(*) from public.nominations where domain = t) <> 2 then raise exception 'FAIL: nominations not moved'; end if;
  if exists (select 1 from public.leaderboard_snapshots where domain = f) then raise exception 'FAIL: from snapshot left'; end if;
  if (select merged_into from public.companies where domain = f) <> t then raise exception 'FAIL: merged_into'; end if;
  if (public.company_detail(f) ->> 'domain') <> t then raise exception 'FAIL: detail does not follow merge'; end if;

  raise exception 'ROLLBACK_OK';
end;
$$;
