# Spec v7b — Phase 2 UI (Community Intelligence Page) + admin

Backend is done and committed (`fc67847`, SPEC-v7-phase2.md §2–§3; RPCs live). This spec builds the
pages for effective phase `vote` (and `closed`), without changing what `pre`/`nominate` visitors see.
Memo quotes and decisions D1–D8 are in SPEC-v7-phase2.md §0–§1. Visual system: current globals.css
(ximu palette, band + card layout). lucide-react icons, one treatment.

Still hidden in vote/closed: ximu, IQ Lite, IQ Elite, pricing, "AI Representation", "Benchmark".
Allowed: 「10 月 8 日中午，直播揭曉」 (settings.results_label) without saying what is revealed.

## 1. `/` when phase = vote — 「社群觀點」 Community Intelligence Page
1. Header: wordmark (unchanged); nav 首頁 · 前情提要 · 排行榜 · 熱門理由 · 投票規則; blue button 立即投票 → /vote.
2. Hero (same component style as phase 1): chip `TAIWAN → JAPAN 2026 · VOTE`; H1 unchanged question;
   sub 「現在開始正式投票：每天一張票，最多選三家，並告訴我們為什麼。」; CTAs 立即投票 (→ /vote) +
   看排行榜 (→ #leaderboard); disclaimer line.
3. Stat strip (3 cards): 投票期間 {vote_open–vote_close} (進行中 tag) · 總票數 N · 總理由數 N.
   Numbers from vote_board(); refresh client-side every 60 s.
4. 01 排行榜 (LEADERBOARD, id `leaderboard`): top 30 rows: rank (Barlow 800), movement icon
   (ArrowUp green / ArrowDown red / Minus grey / NEW chip), favicon, display name (links to /company/[domain]),
   votes (tabular), reasons count, a thin bar proportional to the leader. Mobile: compact rows.
   Note under the table: 「排行依票數即時計算；讚與倒讚每累積淨 10 個，影響該公司 1 票。」
5. 02 熱門理由 (WHY PEOPLE VOTE, id `reasons`): tabs 熱門 / 最新 (hot_reasons / latest_reasons). Reason
   cards: company name (link), reason text large, 讚 N · 倒讚 N buttons (ThumbsUp / ThumbsDown). Clicking
   asks for email once (modal, stored in localStorage `benchmark:email`, copy 「按讚或倒讚前，請留下 Email。
   同一個 Email 對同一則理由只能表態一次。」), calls react_reason, clicking the active one again clears
   (value 0), optimistic update reconciled with the RPC result. Own reasons: button disabled with title
   「不能對自己的理由表態」 (detect via my_vote_state today picks; best effort).
6. 03 大家怎麼看日本市場 (PERCEPTION, id `perception`): overall word cloud from reason_corpus(null).
   Server-side tokenisation with `Intl.Segmenter('zh-Hant', { granularity: 'word' })`, keep isWordLike
   tokens of length ≥ 2 (Latin tokens ≥ 3, lower-cased), drop a stop-word list (的 了 是 在 和 與 也 很 都
   就 而 及 或 讓 被 把 對 為 這 那 有 沒有 一個 我們 他們 公司 台灣 日本 市場 可以 因為 所以 非常 真的
   已經 還是 以及 其中 透過 進入 發展 新創 覺得 認為, plus English stop words). Top 60 words, font size
   scaled by sqrt(count) between 14px and 52px, colours cycling brand / bright / secondary only, rendered
   as a centred flex-wrap tag cloud. Cache: page revalidate 300 s. Empty state 「投票開始後，這裡會長出大家對日本市場的看法。」
7. 04 投票規則 (RULES, id `rules`): 4 cards — 每天一張票 (CalendarCheck) · 最多三家 (ListChecks) ·
   一定要說為什麼 (MessageSquareText, 「每家公司寫一句 10–50 字的理由」) · 讚與倒讚會影響票數 (ThumbsUp,
   「每累積淨 10 個讚，該公司 +1 票；淨 10 個倒讚，−1 票」). Deadline line 「投票截止：{vote_close}」.
8. 05 預告 band (id `live`): solid brand band, big type 「{results_label}，直播揭曉」 + 「Top 10、Top 3，
   以及大家沒看到的那一面。」 — no mention of ximu/AI/IQ.
9. 06 常見問題 (vote phase FAQ): 一天可以投幾次？(每個 Email 每天一張票，台北時間午夜重置) ·
   一張票可以選幾家？(最多三家，每家要寫理由) · 讚和倒讚有什麼用？(淨 10 個 = 1 票) · 可以改票嗎？(當天送出後不能修改，
   明天可以再投一張) · 我的 Email 會公開嗎？(不會，只用來確認一人一天一張票) · 為什麼有些公司不在名單上？
   (候選公司來自第一階段的提名；不符合資格的公司會被移除).
10. 前情提要 band stays (after the hero, before 01) — keep verbatim.
11. Footer unchanged (no ximu).

## 2. `/vote`
Band: chip VOTE, 「投下今天的一票」, sub 「最多選三家，每家寫一句為什麼。」
Two-column layout (form card + dark side card like /nominate):
- Step A Email (prefilled from localStorage). On blur/continue call my_vote_state(email): if voted_today →
  show the done state immediately.
- Step B pick: search input (vote_candidates, debounced 250 ms) + default list (top 12). Selected companies
  appear as "ballot slots" 1–3, each with a reason textarea (10–50, live counter) and remove button.
- Submit 「送出今天的票」 → cast_ballot → done state: 「今天的票已送出！」, the three picks with reasons,
  countdown 「明天 00:00 可以再投一次」 (Taipei midnight), buttons 看排行榜 / 看熱門理由, share row
  (「我投給了 A、B、C：過去五年最值得作為日本市場發展案例的台灣新創。你呢？」).
- Side card: 投票期間, rules checklist (每天一張 / 最多三家 / 每家一句理由), 「Email 不公開，只用來確認
  一人一天一張票。」, disclaimer.
- Errors from RPCs shown verbatim in red.
- Phase not vote: pre/nominate → 「投票將於 {vote_open} 開始。」 + link home; closed → 「投票已截止，
  {results_label}直播揭曉。」.

## 3. `/company/[domain]`
Dynamic route, revalidate 300. company_detail(domain) null or hidden → 404. Visible in phases vote/closed/results;
in pre/nominate → redirect to `/`.
Band: chip COMPANY, display name, domain link (rel="nofollow noopener"), aliases line.
Stat strip: 目前排名 #N · 票數 N · 理由 N. Section 大家為什麼投它: reason cards with reactions (same component
as home). Section 關鍵字: company word cloud (reason_corpus(domain), same renderer). CTA 投給這家公司 →
`/vote?pick=<domain>` which preselects it. Metadata title 「{name}｜台灣新創前進日本｜Taiwan → Japan 2026」.

## 4. Closed phase (`/` after vote_close, before results)
Same page as vote with: hero sub 「投票已截止，感謝參與。」, CTA → #live, reaction buttons disabled
(「投票已截止」), stat strip 投票期間 card shows 已截止.

## 5. Admin additions
Section 「投票」: admin_vote_stats table (company, picks, reaction net, bonus, adjust (editable number →
admin_set_vote_adjust), votes); ballots table from admin_ballots with paging (email, date, picks+reasons,
void toggle → admin_set_ballot_void); reason hide toggle (admin_set_reason_hidden); testers list
(add/remove email → admin_testers_set); CSV export of ballots (email, date, domain, reason, likes, dislikes).

## 6. Merge fix (from stage-1 report)
Update `admin_merge_company(p_from, p_into)` in a `BEGIN v7b` block: also move `ballot_picks.domain` from→into;
if a ballot already has a pick for `into`, keep the earlier pick, move the later pick's reactions onto the kept pick
where the (pick_id, email_key) pair does not exist yet, then delete the later pick. Add this case to
supabase/tests/v7-rollback.sql (or a new v7b test) and run it with ROLLBACK_OK.

## 7. Testing without flipping the public site
- Add a PREVIEW override: `src/lib/phase.ts` reads `process.env.PREVIEW_PHASE` ONLY when
  `process.env.VERCEL_ENV !== 'production'` and `NODE_ENV !== 'production' || process.env.ALLOW_PREVIEW === '1'`;
  run local `ALLOW_PREVIEW=1 PREVIEW_PHASE=vote next start`. Production ignores it (prove with a unit check or grep of
  the built server output path).
- Writes during tests use the tester bypass: insert `qa-vote-1@example.com` … `qa-vote-12@example.com` into testers,
  2–3 QA companies (display names start with 「QA 測試」, domains `qa-a.example`, `qa-b.example`, `qa-c.example`) with
  one nomination each — via one-statement SQL through the pooler. Cast ballots, reactions (≥10 likes from different
  tester emails to prove the +1 bonus shows on the leaderboard), check /company pages and word clouds.
- CLEANUP at the end: delete reason_reactions, ballot_picks, ballots, leaderboard_snapshots, nominations, companies
  and testers rows created by the test; prove all counts are back to the before-state.

## 8. Acceptance (execute each)
1. `npm run build`, `npm run lint` clean.
2. Live production `/` and `/nominate` unchanged in phase nominate (fetch before and after deploy-less local work:
   the deployed site is not redeployed by you, so just confirm the local build with no PREVIEW_PHASE renders the
   phase-1 home).
3. Local preview vote: screenshots 1280 + 390 of `/`, `/vote` (empty, filled, done), `/company/qa-a.example`
   saved to scratchpad/v7b/. Leaderboard shows the reaction bonus. Word cloud renders words.
4. Local preview closed: screenshot `/` 1280.
5. Grep rendered HTML of `/`, `/vote`, `/company/qa-a.example` in preview vote for: ximu, IQ Lite, IQ Elite, US$180,
   AI Representation, Benchmark — none. `10 月 8 日中午` present on `/`.
6. check-rls passes; merge test passes with ROLLBACK_OK.
7. Cleanup proven. One local commit; no push, no deploy.
