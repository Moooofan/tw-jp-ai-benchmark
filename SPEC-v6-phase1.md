# Spec v6 — Phase 1 per Campaign Memo v4.0 (極簡提名)

Source of truth: `/Users/moooofan/Downloads/TW JP Market Attack Campaign v4.0.pdf`
(CEO Internal Execution Memo v4.0, "Status: GO｜策略 98% 鎖定"). It supersedes the older
memo and ChatGPT discussion wherever they conflict. Gap analysis:
`/private/tmp/claude-501/-Users-moooofan-ximu-full-ximu-JP-MKT-Warmup-ACT/99c327e3-b86f-4c43-8de5-26d003427131/scratchpad/pdf_v4_gap.md`.

Keep the approved visual system from SPEC-v5 (puma-style bands and cards, tokens, fonts,
lucide icons). This spec changes WHAT Phase 1 shows and HOW nomination works.

## 0. What memo v4.0 requires of Phase 1 (verbatim, p2–p3)
- 核心原則：絲滑第一。這一階段只是好玩、只是收集；不做防弊，不做正式競賽。
- 對外只問一件事：「過去五年，你認為哪些台灣新創最值得作為日本市場發展案例？」
- 不提 ximu。不提 IQ Lite / IQ Elite。不預告下一階段投票。不講 Top 3 禮物。不要求理由、姓名、Email。
- 使用者只需輸入公司名稱。系統找到公司後，顯示 Display Name / Alias 與 Official Website。使用者確認後即完成提名。
- 提名同一家公司 1 次、100 次或 10,000 次，最後都只代表『這家公司已被提名』；不影響 Phase 2 正式票數。
- Company Resolver：以 Official Domain 作為 canonical identifier；同一公司不同名稱、語言、法人名稱，最後合併為同一 Company Entity；Display Name 使用市場最常見品牌名稱；必要時保留 alias。
- 畫面呈現：可呈現最近新增公司、熱門關注公司、總候選公司數、趣味性的排序變化；但需清楚標示：這是 nomination，不是正式投票結果；hourly refresh 最佳，至少 daily refresh。
- Do NOT publish (internal): IQ Elite pricing, the 15–20 pre-built candidates list, SIT / 數位時代 (not confirmed), KPIs, staff names.

## 1. Phase gating (the core architectural change)
Everything that reveals the later story is shown ONLY in later phases:
| Content | pre / nominate | vote | closed | results |
|---|---|---|---|---|
| ximu, IQ Lite, IQ Elite, US$180, "AI Representation" wording | hidden | hidden | hidden | shown |
| Why It Matters (AI section), SEE/COMPARE/DECIDE, Top 3 prize, Your Market CTAs, partner strip | hidden | hidden | hidden | shown |
| Vote dates, results date, "Top 3/Top 10", Shortlist, 投票 steps | hidden | shown (vote page's own spec comes later) | shown | shown |
Implement with one helper `reveal(phase)` in `src/lib/phase.ts` and gate each block with it;
do not delete the later-phase components — they return in results phase.
`© 2026 ximu` in the footer → `© 2026` outside results phase.

## 2. Neutral public identity (all phases until results)
- Wordmark: `TAIWAN → JAPAN` with small line `Startup Nomination · 2026`.
- `<title>`: 「過去五年，哪些台灣新創最值得作為日本市場發展案例？｜Taiwan → Japan 2026」.
- Meta description: 「輸入公司名稱就能提名。一起整理台灣新創前進日本的案例。」
- OG image: regenerate without "AI Representation Benchmark"; show the question + TAIWAN → JAPAN.
- Remove "AI Representation Benchmark" from every public string in pre/nominate/vote/closed.
  (Admin page may keep internal naming.)

## 3. Home `/` in pre / nominate
Order:
1. Header: wordmark; nav 首頁 · 前情提要 · 候選名單 · 提名說明; red button 立即提名 → /nominate.
2. Hero: chip `TAIWAN → JAPAN 2026`; H1 「過去五年，<br>你認為哪些台灣新創<br>最值得作為<span class="hl">日本市場</span>發展案例？」;
   sub 「輸入公司名稱就能提名，不用註冊，也不用留 Email。」; CTAs 立即提名 (red, → /nominate) +
   看看大家提名了誰 (outline, → #board); disclaimer line (info icon):
   「本活動反映社群關注與市場認知，不構成企業赴日業績的客觀排名。」 Keep the vertical 台灣新創 / 前進日本.
3. Stat strip (replaces the schedule strip; three white cards overlapping the hero):
   提名期間 9 月 14 日 – 9 月 27 日 (from settings) · 已被提名的公司 N 家 · 最近更新 HH:MM.
   No vote/result dates.
4. 01 前情提要 (BACKGROUND) — keep the current copy exactly (it mentions neither ximu nor voting).
5. 02 候選名單 (NOMINATION BOARD, id `board`) — the live board:
   - A notice bar (gold left rule): 「這是提名名單，不是投票結果。同一家公司被提名多次，只代表它已被提名。」
   - Three tabs/cards side by side (stack on mobile): 最近新增（最新 8 家，顯示「x 分鐘前」）；
     熱門關注（被提名次數最多的 8 家，lucide `Flame` icon + 「關注度」 bar
     proportional to count, no raw numbers — rank movement arrow ▲/▼ vs the previous hourly snapshot
     using lucide `ArrowUp`/`ArrowDown`/`Minus`）；總候選公司數 big number.
   - Each company row: display name, domain (muted, e.g. `example.com`), favicon via
     `https://www.google.com/s2/favicons?domain=<domain>&sz=64` loaded as <img> with a
     neutral fallback initial square if it fails. Add `next.config` images domain only if using
     next/image; plain <img> is fine.
   - Empty state (0 companies): 「還沒有人提名。第一個提名的人，會讓這份名單開始長出來。」 + 立即提名 button.
   - Refresh: server-render with `revalidate = 300` (5 min) on `/`; the rank-movement snapshot
     is taken hourly (see §5).
6. 03 提名說明 (HOW TO NOMINATE, id `how`) — three cards:
   STEP 01 輸入公司名稱（中文、英文、品牌名都可以）· STEP 02 確認是這家公司（我們會顯示公司名稱與官方網站）·
   STEP 03 完成提名（同一家公司可以被很多人提名，名單每小時更新）. No step about voting.
7. 04 常見問題 (FAQ) — replace with Phase-1-only items:
   - 需要註冊或留 Email 嗎？— 不需要。輸入公司名稱、確認後就完成提名。
   - 找不到我要提名的公司怎麼辦？— 輸入它的官方網站，我們會用網域辨識是哪一家公司。
   - 同一家公司被提名很多次，會比較有利嗎？— 不會。被提名一次或很多次，都只代表這家公司已被提名。
   - 什麼樣的公司可以被提名？— 台灣新創，且過去五年在日本市場有公開可查的發展。
   - 名單多久更新？— 大約每小時更新一次。
   No FAQ about prizes, voting, Top 3, reports.
8. Footer: `TAIWAN → JAPAN 2026`, disclaimer, links 候選名單 · 提名說明, `© 2026`.
Remove from pre/nominate: Why It Matters, How It Works 4 steps, Top 3 section, IQ Lite, Your
Market, partner strip, rules accordion about votes/同票/結果公告, 社群最近提名 letters with 附議/存疑.
`pre` phase: same page, the /nominate CTA shows 「提名將於 {date} 開放」 and the board shows the empty state.

## 4. `/nominate` — the resolver flow (no email, no reason)
Band: chip NOMINATE, heading 「提名台灣新創」, sub 「輸入公司名稱，確認後就完成。」
Single-column card, max-width 640px, centred in the content column (side card removed):
1. Input 「公司名稱」 placeholder 「例如：品牌名、中文名或英文名」. Debounced 250 ms search via RPC
   `resolve_company(q)` → up to 6 matches from companies table (display_name / aliases,
   case-insensitive, trigram or ilike). Each result row: favicon, display name, alias line, domain.
2. Click a result → confirm card: 「是這家公司嗎？」 favicon + Display Name + aliases + official website
   link; buttons 「對，提名這家」 (red) / 「不是，重新搜尋」.
3. No match or 「列表裡沒有」 link → second input 「官方網站」 placeholder `https://` → RPC
   `resolve_domain(url)` normalises to the registrable domain (strip scheme, `www.`, path, port;
   lower-case) and returns the existing company for that domain or a proposed new entity
   {domain, display_name = the typed name}. Confirm card as above with a note
   「我們會以官方網站辨識公司，名稱之後可能統一為市場常用的品牌名。」
4. Confirm → RPC `nominate_company(p_domain, p_display_name)`; success state:
   「提名完成！」 + the company card + 「這家公司已被提名。名單大約每小時更新。」 + buttons
   「再提名一家」 / 「看看候選名單」 + share row (X / LINE / 複製連結) with text
   「我提名了 {name}：過去五年最值得作為日本市場發展案例的台灣新創。你呢？」
No email, no identity modal, no counts of the user's own nominations, no cap.

## 5. Data model (append to supabase/schema.sql; idempotent)
- `companies(domain text primary key, display_name text not null, aliases text[] not null default '{}',
  status text not null default 'active' check (status in ('active','pending','hidden')),
  is_seed boolean not null default false, created_at timestamptz default now(),
  merged_into text references companies(domain))`. Enable `pg_trgm`; index on
  lower(display_name) and aliases.
- `nominations(id bigserial pk, domain text not null references companies(domain), session_id uuid,
  typed_name text, created_at timestamptz default now())`. `session_id` = auth.uid() of the
  anonymous session if one exists, else null (the page may call signInAnonymously silently; if
  that fails, still allow the RPC as anon).
- `board_snapshots(taken_at timestamptz, domain text, rank int, primary key(taken_at, domain))`.
  Hourly snapshot via `pg_cron` if available (`select cron.schedule(...)`); if pg_cron is not
  enabled, a `take_board_snapshot()` function called lazily by `board()` when the latest snapshot
  is older than 60 minutes.
- Public read goes ONLY through RPCs (security definer, granted to anon + authenticated):
  - `resolve_company(q text)` → active companies only, INCLUDING seed companies (resolver may
    know them) — but seed companies never appear on the board until they have ≥1 nomination.
  - `resolve_domain(url text)` → normalised domain + existing company or proposal.
  - `nominate_company(p_domain text, p_display_name text)` → phase must be `nominate`;
    upsert company (new → status 'pending', display_name = typed name); insert nomination.
    Rate limit: max 20 nominations per session_id per hour and 200 per domain per hour
    (silently accept beyond but do not insert — "不做防弊" means no visible friction).
  - `board()` → { total_companies (companies with ≥1 nomination, status≠hidden),
    recent: [{domain, display_name, first_nominated_at}] ×8,
    hot: [{domain, display_name, share (0–1 of the top count, rounded to 0.05), movement: 'up'|'down'|'same'|'new'}] ×8,
    updated_at }. Never return raw nomination counts publicly.
- Admin (is_admin()): full read/write on companies and nominations; `admin_merge_company(from, into)`
  moves nominations and adds the from display_name to into.aliases; `admin_company_stats()` with raw counts.
- Keep the old posts/votes/participants tables and RPCs in place (unused by Phase 1 UI) — do not drop.
  `nominate()` (old) must reject with 「提名方式已更新，請重新整理頁面。」.
- Seed: none. (The team will import its prepared candidates later via admin; do not invent companies.)

## 6. Admin `/admin`
Add a 「公司與提名」 section: companies table (display_name editable, aliases editable as
comma list, domain, status select active/pending/hidden, is_seed, raw nomination count, first/last
nominated), merge tool (from → into), CSV import for seed companies (columns: domain,display_name,aliases
separated by |) that sets is_seed=true, CSV export. Keep existing sections.

## 7. Acceptance (execute each)
1. `npm run build`, `npm run lint` clean.
2. Schema: the CLI `--linked` path is broken (401). Apply with
   `supabase db query --db-url "postgresql://postgres.pjqejaxfxjtcujfamyem:$(cat ../.secrets/supabase-db-password.txt)@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres" "<ONE statement>"`
   — this path accepts ONE statement per call (no multi-statement files). Write a tiny Node/shell
   splitter that runs the new schema block statement by statement (respecting `$$` bodies), or run
   each statement individually. Re-running must be a no-op. Never print the password.
3. Update `scripts/check-rls.mjs`: anon can call resolve_company/resolve_domain/board; anon cannot
   select companies/nominations/board_snapshots directly; board() output contains no integer counts
   other than total_companies; old nominate() rejects. Run it — must pass.
4. End-to-end on local `next start` against the live DB (Playwright, `channel:'chrome'`):
   nominate a new company with display name 「QA 測試公司」 and website `https://qa-test.example`
   → success state; board shows it under 最近新增 and total ≥1; nominate it again → still one
   company. Then DELETE the test rows (nominations, companies, board_snapshots for that domain) and
   prove the tables are back to their prior counts.
5. Grep the rendered HTML of `/` and `/nominate` (phase nominate) for: ximu, IQ Lite, IQ Elite,
   US$180, AI Representation, Benchmark, 投票, Top 3, Top 10, Shortlist, 10 月 8 日, 前三名 —
   all must be absent. `過去五年` must be present.
6. Screenshots 1280 + 390 of `/` and `/nominate` (with the test company present, before deletion)
   saved to scratchpad/v6/.
7. One local commit; no push, no deploy.
