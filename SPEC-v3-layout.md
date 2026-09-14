# Spec v3 — layout discipline + dedicated /nominate and /vote pages

Owner feedback on the live page (2026-09-15): 「排版很醜、不整齊，提名應該進入到另一個頁面」.
Diagnosis from the full-page screenshot: every section uses a different width
(full 1120px, 760px, 3 columns, 2 columns), so nothing lines up; the hero's schedule
panel sits low with dead space above it; the empty 社群最近提名 shows "0 位 / 0 家";
the form is stretched across the full width in the middle of the editorial page.
Visual language (tokens, fonts, colours, no shadows/radii) is unchanged. This spec is
only about structure.

## 1. One grid for every section on `/`
- Container 1120px, 24px side padding (unchanged).
- Every numbered section is a two-column grid: `grid-template-columns: 300px minmax(0, 1fr)`,
  column gap 48px. LEFT column = section number, heading (serif, 26px, line-height 1.3)
  and, when present, a short lede (15px, muted). RIGHT column = the content, with
  `max-width: 720px` for running text. The left column's top rule and the right
  column's first item start on the same y. This vertical seam is the page's spine —
  a reader must be able to draw one straight line down the page through every section
  heading.
- Section vertical rhythm: 64px top padding, 2px ink rule above the section grid,
  16px below the rule before content. No section may add its own extra margins.
- Mobile (≤ 820px): single column, heading above content, 40px rhythm.

## 2. Hero
- Grid `minmax(0, 7fr) minmax(0, 5fr)`, gap 48px, `align-items: start` (NOT end).
- Left: eyebrow, H1 (three deliberate lines as now), standfirst (max-width 36em),
  CTA row, then the disclaimer line under a 1px rule.
- Right: schedule panel whose top aligns with the eyebrow baseline; rows 提名期間 /
  投票期間 / 結果公布 with the current phase row tinted `--panel`. Under the panel, a
  small stat line in muted 13px (only when counts > 0): 「N 位社群成員參與 · N 家公司被提名」.
- The hero's bottom edge is a 2px ink rule shared with section 01.

## 3. Sections on `/` (in order) and how each uses the grid
01 在台灣被看見… — left: number, heading, lede (the existing paragraph). Right: the
   three numbered questions as a ruled list (unchanged style) then the closing line.
02 活動方式 — right column holds the four steps as a 2×2 grid (not 4 across): each
   cell number + title + one line, 1px rules between; 進行中 tag as now.
03 提名 (phase nominate) — right column is a CALL-TO-ACTION block, not the form:
   title 「提名你認為最值得觀察的台灣赴日新創」 (serif 22px), the one-sentence body
   「每人最多提名三家公司。請提供公司中英文名稱、官方網址，以及你認為它值得被觀察的理由。」,
   a bordered text row 「提名期間 9 月 14 日 – 9 月 27 日」, and the button 開始提名 →
   links to `/nominate`. Phase vote: same block reads 「從 Community Shortlist 選出最多三家公司」
   + 「投票期間 …」 + 立即投票 → `/vote`. Phase pre/closed/results: the notice text as today.
04 社群最近提名 (phase nominate only) — right column: the letters list, newest first,
   6 entries, then 「查看全部提名 →」 linking to `/nominate#recent`. When there are 0
   entries, the WHOLE section is hidden (no zeros, no empty-state).
05 Top 3 Featured Companies 將獲得什麼 — right column: the intro paragraph, then the
   seven items as a two-column ruled list (`grid-template-columns: 1fr 1fr`, 1px rules),
   then the value tag 「IQ Lite 定價 US$180」 and the authorization note.
06 一份 IQ Lite 回答三個完整問題 — right column: SEE / COMPARE / DECIDE as three stacked
   ruled rows (label in condensed caps 13px on the left 120px, text on the right), then
   the positioning line.
07 規則與方法 — right column: the 編輯部說明 box on top (full right width), then the
   accordion under it. (No side-by-side.)
08 FAQ — right column: accordion.
09 從 Benchmark 到你自己的市場位置 — right column: two ruled rows (prompt + one line +
   text button), not two floating columns.
Partner strip and colophon: full width as now, but the colophon's three columns must
use the same 300px/1fr split (left: wordmark + disclaimer; right: links + contact).

## 4. `/nominate` page (new)
- Same utility row + masthead + colophon as `/` (extract a shared `SiteChrome`).
- Content grid `300px minmax(0, 1fr)`: LEFT sticky column (top 24px) with heading
  「提名台灣新創」, the 3-company rule as a checklist of what to prepare (中英文名稱 /
  官方網址 / 60–200 字理由), the period line, and the disclaimer. RIGHT column, max-width
  640px: the five numbered fields exactly as today, then 送出提名. After success: replace
  the form with the thank-you block (verbatim thanks line, share buttons, 「再提名一家」
  if the email still has quota, 「回到首頁」). Below the form (id `recent`): 社群最近提名
  full list, 12 per page with 載入更多, same letters style with 附議/存疑.
- Phase not nominate → the page shows the pre/closed notice and a link home.
- `<title>` 提名｜Taiwan → Japan AI Representation Benchmark 2026.

## 5. `/vote` page (new, phase vote)
- Same chrome. Left sticky column: 「社群正式投票」, rule 「每個 Email 最多投三家公司」,
  the pips (3) + 「還有 N 票」, period line, disclaimer. Right: candidate cards in a
  2-column ruled grid (no shadows): 中文名, 英文名 (condensed caps), one-liner, 產業標籤,
  日本市場公開資訊, 投票 / 已投 text button. No counts anywhere. After 3 picks a
  confirmation line 「已完成投票。結果預計於 10 月 14–15 日公布。」 + share.
- Phase not vote → notice + link home.

## 6. Header CTA and nav
- Header CTA by phase: nominate → 開始提名 (`/nominate`); vote → 立即投票 (`/vote`);
  otherwise 查看活動方式 (`/#how`). Nav: 活動方式 (`/#how`) · 提名 (`/nominate`) ·
  規則與方法 (`/#rules`) · FAQ (`/#faq`). Anchors must work from `/nominate` too.

## 7. Acceptance (execute each)
1. `npm run build` clean, `npm run lint` clean.
2. Full-page screenshots at 1280 and 390 of `/`, `/nominate`, `/vote` (set
   `phase_mode='manual'` + the needed phase via SQL for `/vote`, then RESTORE
   `phase_mode='auto', phase='nominate'` and prove it with a select). Save under
   /private/tmp/claude-501/-Users-moooofan-ximu-full-ximu-JP-MKT-Warmup-ACT/99c327e3-b86f-4c43-8de5-26d003427131/scratchpad/v3/ .
3. Spine check on the 1280 `/` screenshot: measure the x of every section heading's
   left edge and every right-column first element's left edge via DOM bounding boxes —
   each set must be identical (±1px). Report the numbers.
4. With 0 posts, section 04 is absent from the `/` HTML; the hero stat line is absent.
5. `/nominate` form submits through the existing `nominate` RPC (no schema change);
   `scripts/check-rls.mjs` still passes.
6. One local commit; do not push or deploy.
