# Spec v7 — Phase 2 Vote & Perception (memo v4.0, 9/28–10/6)

Source: `/Users/moooofan/Downloads/TW JP Market Attack Campaign v4.0.pdf` p3 (§四 Phase 2),
p6 (§十一 Phase 2 必須完成; §十二 narrative). Visual system: SPEC-v5 layout + the ximu palette
now in globals.css. Phase-1 rules from SPEC-v6 still apply to phases pre/nominate.

## 0. Memo requirements (verbatim)
- 這一階段才開始真正計票，也才開始收集有價值的 Human Perception Data。
- 正式投票規則：必須輸入 Email。每人每天 1 張 ballot。每張 ballot 最多投 3 家公司。每次投票必須留下『為什麼』。投票截止：10/6。10/7 留給結算、清理、rehearsal 與內容 freeze。
- 讚／倒讚正式影響票數：每一個投票理由可按讚或倒讚。以淨反應計算：Likes − Dislikes。每累積淨 +10 個反應 = +1 票；每累積淨 −10 個反應 = −1 票。因為會影響正式票數，一個 Email 對同一理由只能表態一次。
- Phase 2 網站重點：Leaderboard / rank movement。投票理由與熱門理由。Company word cloud。整體日本市場 perception word cloud。Like / Dislike / Community Resonance。總票數、總理由數、趨勢。這一階段的網站本質上不是票選頁，而是一個 Community Intelligence Page。
- Narrative (market team): 現在真正來投票，並告訴我們為什麼。Market actions: 排行、理由、讚／倒讚、word cloud、10/8 預告.
- Still hidden in phase vote: ximu, IQ Lite, IQ Elite, pricing, "AI Representation". A 10/8 preview IS allowed
  (「10 月 8 日中午，直播揭曉」) — without saying what is revealed.

## 1. Decisions taken where the memo is silent (flag them in reports; keep them easy to change)
- D1 Candidates = every company with ≥1 nomination and status ≠ 'hidden' (no shortlist in v4.0). No new
  companies can be created in phase vote.
- D2 Email is required but NOT verified (owner declined SMTP). Identity = lower(trim(email)).
- D3 "每天" = calendar day in Asia/Taipei.
- D4 One reason per picked company, 10–50 characters (same bound the owner chose for nomination reasons).
- D5 Reaction bonus is computed PER COMPANY: `trunc(sum(likes − dislikes over that company's visible reasons) / 10)`
  (truncation toward zero, so +19 → +1, −19 → −1). Store the constant as `settings.reaction_votes_per` default 10.
- D6 Company votes = picks on non-void ballots + reaction bonus + `companies.vote_adjust` (admin, default 0).
- D7 Voters may not react to their own reasons (same email_key) — silently ignored.
- D8 Public leaderboard shows rank, movement, votes, reasons count. Voter emails never public.

## 2. Data model (append as a `BEGIN v7` … `END v7` block to supabase/schema.sql; idempotent;
apply with `node scripts/apply-sql.mjs v7`, run twice)
- `settings`: add `reaction_votes_per int not null default 10`.
- `companies`: add `vote_adjust int not null default 0`.
- `testers(email_key text primary key)` — admin-managed QA emails that may write in any phase (see §5). No public access.
- `ballots(id bigserial pk, email_key text not null, email text not null, ballot_date date not null,
  session_id uuid, voided boolean not null default false, created_at timestamptz default now(),
  unique (email_key, ballot_date))`.
- `ballot_picks(id bigserial pk, ballot_id bigint not null references ballots on delete cascade,
  domain text not null references companies(domain), reason text not null check (char_length(reason) between 10 and 50),
  hidden boolean not null default false, created_at timestamptz default now(), unique (ballot_id, domain))`.
- `reason_reactions(pick_id bigint references ballot_picks on delete cascade, email_key text, value smallint check (value in (-1,1)),
  created_at timestamptz default now(), primary key (pick_id, email_key))`.
- `leaderboard_snapshots(taken_at timestamptz, domain text, rank int, votes int, primary key (taken_at, domain))`,
  taken lazily (same pattern as board_snapshots) when older than 60 minutes.
- A view or SQL function `company_votes()` implementing D5/D6 used by every public and admin read.
- RLS on; no direct table access for anon/authenticated; everything through RPCs.

## 3. RPCs (security definer, `set search_path = public`)
Public (anon + authenticated):
- `vote_candidates(q text)` → up to 12 candidates {domain, display_name, aliases}; empty q → top 12 by votes.
- `cast_ballot(p_email text, p_picks jsonb)` — p_picks = `[{"domain": "...", "reason": "..."}]`, 1–3 items,
  distinct domains, each candidate eligible (D1), reason 10–50. Phase must be `vote` (or tester). Rejects a
  second ballot for the same email_key and Taipei date with 「今天已經投過了，明天可以再投一次。」.
  Rate limit: 30 ballots per session per hour. Returns {ballot_id, ballot_date, picks:[{pick_id, domain}]}.
- `react_reason(p_pick_id bigint, p_email text, p_value smallint)` — value 1, -1, or 0 (clear). Phase `vote`
  (or tester). D7. Returns {likes, dislikes}.
- `my_vote_state(p_email text)` → {voted_today boolean, today: [{domain, display_name, reason}], reactions: [{pick_id, value}]}.
- `vote_board()` → {total_votes, total_reasons, total_voters, updated_at,
  leaderboard: [{rank, domain, display_name, votes, reasons, movement: up|down|same|new}] (top 30),
  hot_reasons: [{pick_id, domain, display_name, reason, likes, dislikes}] (top 12 by net, then newest),
  latest_reasons: same shape, newest 12,
  trend: [{day: 'YYYY-MM-DD', ballots int, reasons int}] for the vote window}.
- `company_detail(p_domain text)` → {domain, display_name, aliases, rank, votes, reasons_count,
  reasons: [{pick_id, reason, likes, dislikes, created_at}] newest first, max 200, hidden excluded} or null.
- `reason_corpus(p_domain text default null)` → text[] of visible reasons (all, or for one company), max 5000.
Admin (authenticated + `is_admin()` checked inside):
- `admin_ballots(p_limit int, p_offset int)` → ballots with email, date, voided, picks+reasons, reactions.
- `admin_set_ballot_void(p_id bigint, p_voided boolean)`, `admin_set_reason_hidden(p_pick_id bigint, p_hidden boolean)`,
  `admin_set_vote_adjust(p_domain text, p_adjust int)`, `admin_testers_set(p_email text, p_on boolean)`,
  `admin_vote_stats()` → per company picks, reaction net, bonus, adjust, votes.
All write RPCs are denied to anon for admin functions; `effective_phase()` unchanged.

## 4. Tests for this stage (execute; no UI yet)
1. Apply v7 twice via apply-sql (second run no row changes).
2. Transactional SQL test: ONE `do $$ … $$` statement that sets phase_mode manual + phase vote, creates two QA
   companies + nominations, casts ballots for 2 emails, checks: second ballot same day rejected; 4 picks rejected;
   reason 9 chars rejected; own-reason reaction ignored; 10 likes from 10 emails → +1 bonus; 19 → +1; −10 → −1;
   voided ballot removes its picks from votes; hidden reason removes its reactions from the bonus;
   leaderboard order and ranks correct; then `raise exception 'ROLLBACK_OK'` so NOTHING persists. The run must end
   with the ROLLBACK_OK error and a follow-up select must show settings and table counts unchanged.
3. `scripts/check-rls.mjs` extended: anon can call vote_board/company_detail/reason_corpus/vote_candidates/my_vote_state;
   anon cannot select ballots/ballot_picks/reason_reactions/testers/leaderboard_snapshots; cast_ballot and react_reason
   reject in phase nominate for a non-tester; admin_* reject for anon. Must pass.
4. Live settings must be unchanged at the end (phase_mode auto, effective phase nominate).

## 5. Tester bypass
`cast_ballot` / `react_reason` accept writes outside phase `vote` when email_key is in `testers`. Used only for
end-to-end UI tests in stage 2 so the public site never has to be flipped. Never exposed in UI except admin.

## 6. Stage 2 (UI) — separate task, summarised here for context
`/` vote phase = Community Intelligence Page (hero + stats: 投票期間 / 總票數 / 總理由數; leaderboard with movement;
熱門理由 cards with 讚/倒讚; 整體日本市場 perception word cloud; 投票規則 cards; 10/8 預告 band; FAQ);
`/vote` ballot flow (email → pick ≤3 → reason each → submit → today's ballot + share + come back tomorrow);
`/company/[domain]` company page (rank, votes, reasons with reactions, company word cloud);
admin sections for ballots, reasons moderation, vote adjust, testers. Word clouds via `Intl.Segmenter('zh-Hant',{granularity:'word'})`
server-side with a stop-word list, rendered as a weighted CSS tag cloud (no external library).
