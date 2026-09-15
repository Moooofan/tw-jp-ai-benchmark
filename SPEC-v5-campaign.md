# Spec v5 — campaign style (puma.taipei reference) + 前情提要

Owner feedback 2026-09-15: reference https://puma.taipei/ ; add a background section
(台灣新創越來越多往日本發展、已有不少成功例子、我們持續關注台灣新創如何在國際市場站穩腳步、
所以做了這份調查).

APPROVED PROTOTYPE: `../prototype/campaign-v5.html`. Port it faithfully. It supersedes the
visual/structural rules of SPEC-v3 (300px spine) and SPEC-v4 (icon table). SPEC-v2 copy
rules still bind; the prototype's new 前情提要 copy is now also binding verbatim.
All dynamic behaviour already built stays: phases (pre/nominate/vote/closed/results via
effective_phase), dates/labels/links from settings, letters list, /nominate and /vote
flows, anonymous-session + email dedupe, admin.

## Visual system (from the prototype — use its exact tokens)
ground #F3F6FA · white · ink #0F2440 · brand #00508E · gold #F2C744 · gold-soft #FFE38A ·
passion #D7263D · text #1E2733 · muted #5B6474 · line #D8E1EC · shadow #DDE6F1.
Fonts: Noto Sans TC (400/500/700/900) for all Chinese incl. headings; Barlow Semi Condensed
(600–800) for English chips, NO./STEP labels, wordmark, SEE/COMPARE/DECIDE. Drop Noto Serif TC.
- Sticky white header: wordmark left; nav 首頁 · 前情提要 · 活動方式 · 規則與方法 · FAQ; phase CTA
  as a red small button (開始提名 → /nominate, 立即投票 → /vote, else 查看活動方式).
- Hero: full-bleed brand band with 115° stripe overlay, outlined ghost text "TAIWAN → JAPAN",
  gold-soft chip, H1 (日本市場 in gold-soft), standfirst, CTAs 提名最多三家公司 (red) +
  先看前情提要 (white outline → #background), disclaimer with info icon, vertical 台灣新創 /
  前進日本 on the right (hidden ≤860px).
- Schedule strip: three white cards overlapping the hero bottom (-68px), 4px top border,
  current phase card red border + 進行中 tag (driven by effective phase; closed/results →
  結果公布 card current).
- Every section: `.band` header (brand, stripes clipped to right half, gold-soft English chip,
  white 900 heading, 5px gold bottom border) then `.body` content. Cards: white, 4px brand top
  border, 6px 6px 0 flat shadow in --shadow, no radius, NO./STEP/Q label + 30px icon top row.
- Icons: lucide-react, strokeWidth 1.5, 22px inline / 30px in card headers, colour brand.
  Map prototype symbols → lucide: pen→PenLine, check→SquareCheckBig, mega→Megaphone,
  trend→TrendingUp, flag→Flag, layers→Layers, search→Search, msg→MessageSquareText,
  link→Link, filter→ListFilter, file→FileText, user→UserCheck, cross→Crosshair,
  scale→Scale, list→ListChecks, news→Newspaper, eye→Eye, target→Target, compass→Compass,
  pulse→Activity, pin→MapPin, info→Info, arrow→ArrowRight.
- Footer: brand band with stripes, big "TAIWAN → JAPAN 2026" (arrow gold-soft), disclaimer,
  links, © 2026 ximu.

## `/` order
Hero → schedule strip → 01 前情提要 (BACKGROUND) → 02 在台灣被看見… (WHY IT MATTERS) →
03 活動方式 (HOW IT WORKS) → 04 提名/投票/notice panel (NOMINATE; panel right side shows the
current period and the phase CTA; pre/closed/results show the existing notice text inside the
same panel) → 社群最近提名 (only if posts > 0; cards in a 3-col grid, masked email, reason,
附議/存疑, no counts) → Results section when phase=results (keep existing copy) → 05 Top 3
Featured Companies (FEATURED COMPANIES; list card + price tag + 一份 IQ Lite 回答三個完整問題
sub-heading + SEE/COMPARE/DECIDE cards + note) → 06 規則與方法 (RULES & METHOD; ink method
card + accordion card; 期間 from settings) → 07 FAQ (heading 常見問題) → 08 從 Benchmark 到你自己
的市場位置 (YOUR MARKET; two conv cards) + partner strip → footer.
Section anchor ids: background, why, how, nominate, recent, results, prize, rules, faq, convert.

## `/nominate` and `/vote`
Same header/footer. A compact brand band (chip NOMINATE / VOTE, heading 提名台灣新創 /
社群正式投票) instead of the hero. Below: two-column layout `minmax(0,1fr) 320px` — left the
form card (white, flat shadow, fields as today with icons from the checklist on labels) /
the candidate cards grid; right an ink side card with period, rules checklist, remaining
votes (vote), disclaimer. Recent nominations on /nominate as the same 3-col card grid.
≤860px single column.

## Acceptance (execute each)
1. `npm run build`, `npm run lint` clean.
2. Screenshots 1280 + 390 full page of `/`, `/nominate`; `/vote` notice state (do NOT flip
   the live DB phase this time). Save to scratchpad/v5/. Compare `/` at 1280 against
   `../prototype/campaign-v5.html` rendered at 1280 and fix visible deviations.
3. Copy audit: every CJK run ≥6 chars in the prototype's static copy appears in `/` HTML
   (dates may differ in formatting); nothing from SPEC-v2 dropped (diff against current `/`).
4. No horizontal overflow at 390 on all three pages.
5. `scripts/check-rls.mjs` still passes (no schema change expected).
6. One local commit; no push, no deploy.
