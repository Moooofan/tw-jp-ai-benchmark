# Spec v4 — 留白與圖示 (breathing room + a disciplined icon set)

Owner feedback on the live site (2026-09-15): 「目前看起來很亂，整體的字有點排得太滿了，
可以多用一點圖示」. Two jobs: (A) give the type room so the page stops reading as a wall
of text, (B) introduce ONE icon system used consistently, not decoration sprinkled around.

Everything in SPEC-v2 (verbatim copy, colour tokens, fonts) and SPEC-v3 (the single
`300px minmax(0,1fr)` spine) still binds. Do not change any copy. Do not add colours.

---

## A. Density — where the page is too tight

### A1. Move running text out of the narrow left column
Today section 01's lede sits in the 300px side column and reads as a cramped 6-line
block. New rule, applied everywhere including `/nominate` and `/vote`:
- LEFT column carries ONLY: the section number, the heading, and (optional) a single
  short line of at most ~20 CJK characters.
- Every paragraph of running text moves to the RIGHT column, above the other content.
- Where a section previously had a left-column lede (01, and the nominate/vote side
  panels' longer sentences), move it. Keep the wording identical.

### A2. Type
- Body line-height 1.75 → **1.9**; list and card text 1.7 → **1.85**.
- Add `letter-spacing: 0.02em` to CJK body copy (`body`, `p`, `li`, `dd`, form labels).
  Do NOT add letter-spacing to the serif headings (they already have -0.01em) or to the
  Barlow condensed labels (they already have their own tracking).
- Serif headings line-height 1.3 → **1.45**.
- Running-text measure: cap paragraphs at **34em** (not the full 720px). The 720px
  content column stays; paragraphs simply don't fill it.
- Minimum body size on the page is 15px; nothing below 13px except the utility row,
  eyebrows and the colophon.

### A3. Space
- Section rhythm: top padding 64 → **96px** (mobile 40 → **56px**); the gap between a
  section's top rule and its first content 16 → **24px**.
- Paragraph spacing inside a section: **20px** between block elements (use `gap` on a
  flex/grid column, not margins).
- Ruled list rows: vertical padding 18 → **22px**.
- Boxes (schedule panel rows, 編輯部說明, the form card, letters): inner padding
  → **28px** desktop / 20px mobile.
- Accordion summary rows: padding 16 → **20px**.
- Hero: 56px top → **72px**; gap between the standfirst and the CTA row → **32px**.

### A4. Fewer competing marks
- The prize list's `✓` glyphs are replaced by icons (below) — remove the glyph.
- Keep one rule weight for hairlines (1px `--rule`) and one for section tops (2px ink).
  Delete any other border widths introduced along the way.

---

## B. The icon system

**Library**: `npm install lucide-react` (MIT, tree-shaken, no CDN at runtime). Import
only the icons named below. No emoji, no other icon set, no decorative illustrations.

**One appearance for every icon on the site**, expressed once in a small wrapper
component `src/components/Icon.tsx`:
- `size={20}` inline in lists and labels; `size={24}` for the four step cards.
- `strokeWidth={1.5}`, `absoluteStrokeWidth` on, `aria-hidden="true"`, `focusable="false"`.
- Colour: `color: var(--brand)` by default; inside a `--passion` context inherit.
- Never filled, never in a coloured circle or rounded square, never larger than 24px.
- Icons are decorative: every icon sits beside text that already says the same thing,
  and no icon is the only carrier of meaning.

**Where icons appear (and nowhere else):**

| Place | Icon (lucide name) |
|---|---|
| Hero schedule row 提名期間 | `pen-line` |
| Hero schedule row 投票期間 | `square-check-big` |
| Hero schedule row 結果公布 | `megaphone` |
| Step 1 社群公開提名 | `pen-line` |
| Step 2 形成 Shortlist | `list-filter` |
| Step 3 社群正式投票 | `square-check-big` |
| Step 4 ximu 分析與公開發布 | `file-text` |
| Section 01 question 01 | `search` |
| Section 01 question 02 | `message-square-quote` |
| Section 01 question 03 | `link` |
| SEE | `eye` |
| COMPARE | `scale` |
| DECIDE | `target` |
| Prize item IQ Lite Japan Edition 報告一份 | `file-text` |
| Prize item ximu Intelligence 分析與 Human Analyst Review | `microscope` |
| Prize item 日本市場的 AI Representation 診斷 | `radar` |
| Prize item 來源與引用環境檢視 | `link` |
| Prize item 競爭定位比較 | `scale` |
| Prize item 目前最值得處理的優先行動 | `list-checks` |
| Prize item 公開案例曝光 | `newspaper` |
| Conversion 想看見自己的市場位置？ | `compass` |
| Conversion 想持續掌握市場如何改變？ | `line-chart` |
| `/nominate` checklist 公司中英文名稱 | `building-2` |
| `/nominate` checklist 官方網址 | `link` |
| `/nominate` checklist 60–200 字的提名理由 | `align-left` |
| `/vote` side panel 每個 Email 最多投三家公司 | `square-check-big` |

If a name above does not exist in the installed lucide-react version, substitute the
nearest equivalent, and SAY SO in the report — do not silently drop an icon.

**Layout with icons** — one pattern, used everywhere: a two-column row
`grid-template-columns: 24px minmax(0, 1fr)`, `column-gap: 14px`, icon on the first
line's optical baseline (`margin-top: 2px`), text unchanged. The four step cards put the
icon on its own line above the step number instead.

---

## C. Do not
- No icons in the masthead, nav, buttons, accordions, FAQ, footer, or the disclaimer.
- No icon repeated twice within one visible block except where the table above does it
  deliberately (`link`, `scale`, `square-check-big` recur across different sections).
- No new animation. No hover effects on icons.

---

## D. Acceptance (execute each, report evidence)
1. `npm run build` and `npm run lint` clean; `lucide-react` pinned in package.json.
2. Full-page screenshots at 1280 and 390 of `/` and `/nominate`, plus `/vote` with
   `phase_mode='manual', phase='vote'` — then RESTORE `phase_mode='auto', phase='nominate'`
   and prove it with a select. Save under
   `/private/tmp/claude-501/-Users-moooofan-ximu-full-ximu-JP-MKT-Warmup-ACT/99c327e3-b86f-4c43-8de5-26d003427131/scratchpad/v4/`.
   NOTE: `supabase db query --linked` currently fails with a 401 (expired Management API
   token). Use `--db-url` with the session pooler and the password in
   `../.secrets/supabase-db-password.txt`, or ask for the phase flip to be skipped and
   screenshot `/vote`'s notice state instead — do not spend more than two attempts on this.
3. Spine still exact: measure every section heading's left x and every right-column first
   child's left x on the 1280 `/` screenshot via DOM boxes; all must be identical. Report
   the two numbers.
4. Density check, reported as numbers from `getComputedStyle` on the live DOM: body
   line-height ≥ 1.9, CJK `letter-spacing` = 0.02em, section top padding = 96px, no
   paragraph wider than 34em.
5. Icon audit: count `<svg>` elements rendered on `/` and list which icon appears in which
   section; confirm every one is 20 or 24px with stroke-width 1.5 and `aria-hidden`.
6. Copy audit: script-diff every CJK run of ≥6 characters in the page before and after —
   nothing added, nothing removed.
7. One local commit; do not push, do not deploy.
