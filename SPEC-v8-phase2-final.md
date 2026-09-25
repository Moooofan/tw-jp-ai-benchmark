# Spec v8 — Phase 2 最終執行版 (locked doc v1.0, 2026-09-24)

Source of truth: `/Users/moooofan/Downloads/TW_JP_Phase2_Voting_Strategy_and_Page_Copy_v1_0_20260924.docx`
(decision maker JT). Where this repo and that document disagree, the document wins — it says so itself.
Phase 1 is frozen; no further work on it. Today is 2026-09-26, vote opens 9/28, so everything is
built and demoed behind the existing preview gate (`?preview=vote&key=…`) with seeded data.

## 0. What changes vs. what is already deployed
1. Reaction bonus: was per-company `net/10`; becomes **per reason** `floor(likes/10)`. Dislikes never
   subtract and never offset. Doc cases: two reasons of 19 likes → +2 (not +3); one reason 26 likes
   8 dislikes → +2 (not +1).
2. New candidates ("遺珠") no longer enter the pool instantly. They need **11 distinct emails**, then
   enter with **1 vote** (the supports do not convert to votes).
3. The vote question, and therefore every line of copy on the phase-2 pages, is replaced.
4. Eligibility is explicitly widened: size / age / listing status are not exclusions (the doc names
   鼎泰豐 as a legitimate case). Only "具台灣背景" still matters.
5. Result area must not read as a final ranking (no 01/02/03 rank numerals).

## 1. Vote maths (authoritative)
```
company votes = picks on non-voided ballots
              + Σ over that company's visible reasons: floor(likes(reason) / reaction_votes_per)
              + vote_base            -- 1 for a company that entered via 遺珠 support, else 0
              + vote_adjust          -- admin override, default 0
```
`settings.reaction_votes_per` (default 10) now means "likes per extra vote, per reason".
Dislikes are stored and displayed, never counted.

## 2. Data model (append as `BEGIN v8` … `END v8`, idempotent, `node scripts/apply-sql.mjs v8`)
- `settings`: add `support_threshold int not null default 11`.
- `companies`: add `vote_base int not null default 0`,
  `pool_entered_at timestamptz` (null = not in the official pool),
  `proposed_at timestamptz`, `proposed_note text` (what the proposer typed).
- Backfill: every company with ≥1 nomination gets `pool_entered_at = coalesce(pool_entered_at, now())`
  and keeps `vote_base = 0` (Phase 1 counts do not carry over — nothing else to do, votes are
  computed from ballots only).
- `candidate_supports(domain text references companies(domain) on delete cascade, email_key text,
  email text not null, session_id uuid, created_at timestamptz default now(),
  primary key (domain, email_key))` — RLS on, no direct access.
- `company_votes()` rewritten per §1. Keep the existing output columns, add `vote_base`,
  `supports int`, `in_pool boolean`.

## 3. RPCs (security definer, `set search_path = public`, granted to anon+authenticated)
- `propose_candidate(p_name text, p_url text, p_email text, p_note text)` → creates the company in
  pending state (`proposed_at = now()`, `pool_entered_at = null`), resolves/creates the domain with the
  existing resolver rules, records the proposer as support #1, returns
  `{domain, display_name, supports, remaining, in_pool}`. Rejects a name that already resolves to a
  pooled company by returning that company with `in_pool = true`.
- `support_candidate(p_domain text, p_email text)` → inserts one support (idempotent per email_key).
  When `supports >= settings.support_threshold` and the company is still pending, set
  `pool_entered_at = now()`, `vote_base = 1`. Returns `{supports, remaining, in_pool, just_entered}`.
- `pending_candidates()` → `[{domain, display_name, supports, remaining, proposed_at, proposed_note}]`
  ordered by supports desc, newest first; pending only.
- `candidate_detail(p_domain text)` → one pending or pooled candidate for the share page.
- `vote_candidates(q)` / `vote_board()` / `company_detail()` — **pooled companies only**
  (`pool_entered_at is not null`). Pending candidates never appear on the board.
- `cast_ballot` — unchanged rules (1 ballot/email/Taipei day, ≤3 picks, reason 10–50) except every
  picked domain must be pooled. The v7c "nominate while voting" path is removed; the UI sends people
  to the 遺珠 flow instead.
- `react_reason` — unchanged (one reaction per email per reason, switching replaces, own reason ignored).

## 4. Copy — use the document verbatim
All phase-2 copy comes from the document's 「完整投票頁面文案」 section. Do not paraphrase.
- Hero: 眉標 `TAIWAN → JAPAN 2026`; H1 「如果你準備進入日本市場，哪一家台灣企業的做法最值得借鏡？」;
  sub 「無論是剛起步的新創、平台型企業、上市櫃公司，或已經成熟的品牌，只要它正在或已經進入日本市場，
  就可能有值得我們學習的方法。不是因為它大就更好，也不是因為它小就該被忽略。」;
  primary CTA 「開始投票」→ /vote; secondary 「提名遺珠之憾」→ /candidates.
- Sections in this order: 為什麼要做這次投票 · 這次要回答的問題（含五個回答角度：市場進入／在地化／
  品牌與信任／通路與夥伴／組織與執行／其他）· 誰可以被投票（含鼎泰豐段落）· 目前的社群判斷（結果區）·
  沒有看到你心中的遺珠 · 為值得認同的理由按讚 · 關於媒體參與 · 這個結果代表什麼 · 頁尾 CTA · FAQ（文件七題，
  取代現有六題）.
- 介面微文案（七條）used verbatim at: 投票完成 / 理由欄位 placeholder / 已達每日上限 / 遺珠支持成功 /
  遺珠入池成功 / 按讚滿 10 / 倒讚說明.
- Banned anywhere on the site: 「倒讚將扣票」「淨值」「扣票」, and any wording implying 大＝好, 新＝好,
  or that media votes count more.

## 5. Result area (結果區)
Ordered by official votes, but **no rank numerals**. Section label 「目前的社群判斷」, not 排行榜.
Each row: company name (link), 分類 tag, votes, reasons count, proportional bar. Under it, verbatim:
「排序依正式票數即時計算；每一則理由每滿 10 個有效按讚，替該公司增加 1 票。倒讚僅供回饋，不扣票。」
and 「這個結果代表社群認為最值得借鏡的方法，不是營收、估值或公司成敗的排名。」
Movement arrows stay (they describe change, not a final rank). Nav item 排行榜 → 目前結果.

## 6. 遺珠 pages
- `/candidates` — 待確認遺珠 list (progress 0–11 bar, 「再獲得 {remaining} 個有效支持，就能進入正式投票。」,
  支持 button, share button) + the propose form (公司名稱 / 官網（選填）/ Email / 一句話說明（選填），
  button 「提名一個遺珠」). Pending candidates are listed separately from and never mixed with the result area.
- `/candidates/[domain]` — one candidate's share page: name, note, progress, 支持 CTA, share row.
  `/vote?pick=<domain>` still works once it is pooled.
- Doc-mandated states: 10 supports → still pending, 尚差 1 人; 11th distinct email → 「這家公司已取得 11 個
  有效支持，正式進入投票池，並以 1 票起算。」

## 7. Eligibility cleanup
Clear `needs_review` for everything flagged only for being big / old / listed / not-a-startup
(鼎泰豐, 補習班, 幼兒園, 自由系統, 貢茶, 老虎堂, 茶湯會 …). Keep it only for companies that are not
Taiwanese-backed: 京鼎樓 (jin-din-rou.net) and 和心村 (washinmura.jp) are Japanese legal entities.

## 8. Demo data (preview only, 9/26 — vote opens 9/28)
Wipe the v7b-era ballots and reseed under the new rules so the preview is honest:
- ~40 voter emails, ballots across the last few days, ≤3 picks each, distinct realistic reasons
  (no duplicated reason text — the current seed repeats lines).
- Likes distributed so the bonus is visible and checkable: at least one reason at 26 likes (+2),
  one company with two reasons at 19 likes each (+2), several reasons under 10 (+0). Dislikes present
  but provably not subtracting.
- 遺珠: three pending candidates at 3 / 7 / 10 supports, plus one that crossed 11 and shows 1 vote.

## 9. Acceptance (execute every item)
1. `npm run build` and `npm run lint` clean.
2. Apply v8 twice; second run changes no rows.
3. One transactional `do $$ … raise exception 'ROLLBACK_OK' $$` test covering the doc's five cases:
   10 supports → pending; 11th → pooled with 1 vote; reason 26 likes 8 dislikes → +2; two reasons
   19 likes each → +2; a company nominated 300 times in Phase 1 → 0 carried votes.
4. `scripts/check-rls.mjs` passes, extended for candidate_supports and the new RPCs.
5. Preview screenshots at 1280 and 390 of `/`, `/vote`, `/candidates`, `/candidates/[domain]`,
   `/company/[domain]` saved to scratchpad/v8/.
6. Grep the rendered preview HTML: no ximu / IQ Lite / IQ Elite / US$180 / AI Representation /
   Benchmark / 扣票 / 淨值; the new H1 and the 鼎泰豐 paragraph are present.
7. Public (non-preview) `/` still renders Phase 1 unchanged.
