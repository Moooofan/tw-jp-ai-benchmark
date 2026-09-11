# Taiwan → Japan AI Representation Benchmark — Spec v2 (editorial redesign)

Supersedes SPEC.md wherever they conflict. The backend (Supabase project
`pjqejaxfxjtcujfamyem`, RLS/RPC architecture, OTP auth, admin gating via `admins`)
stays. The public site is rebuilt as a professional news-media special section and
the copy comes from the user's own documents. The earlier "no organizer, no ximu"
rule is REVOKED: IQ Lite and ximu are named exactly as the source copy names them.

## Sources (read all three before writing a line of copy)
- `../Reference/chatgpt_digest.md` — section structure and VERBATIM copy (use as-is).
- `../Reference/docx_copy_verbatim.md` — governance rules, mandated terms, disclaimer.
- `../Reference/design_brief.md` — research; the approved design is the prototype.
- `../prototype/editorial-v3.html` — APPROVED visual direction. Port its CSS tokens,
  type, masthead, hero, schedule panel, numbered sections, questionnaire form,
  "letters" list, accordion, colophon. Keep it single-theme light.

## Naming
- Site/app name: Taiwan → Japan AI Representation Benchmark 2026. `<title>` the same.
- Nothing on the site says 推爆東京 any more. Vercel project: `tw-jp-ai-benchmark`
  (commander handles Vercel). Package name `tw-jp-ai-benchmark`.
- Sender name for OTP mail: "AI Representation Benchmark" (update config.toml subject
  to `驗證碼 {{ .Token }}｜AI Representation Benchmark`; push with supabase config push).

## Design tokens (from prototype; do not invent others)
paper #FFFFFF · panel #F3F6FA · ink #0F2440 · brand #00508E · speed #1F8FEB ·
passion #D7263D (ONE filled CTA + "進行中" tag only) · text #1E1E1E · muted #5B6474 ·
rule #D3DBE6. Fonts: Noto Serif TC (headlines), Noto Sans TC (body/UI), Barlow Semi
Condensed (masthead, eyebrows, numerals, buttons). No shadows, radii, gradients,
emoji, confetti. Motion: 200 ms fade/slide on reveal only; respect reduced motion.

## Page `/` — one persistent URL, state by `settings.phase`
Order and copy (VERBATIM from chatgpt_digest §2 unless marked):
0. Utility row: `2026 年 9 月` · `第 1 期 · 台灣 → 日本` · language `繁體中文 | English`
   (English is a non-link placeholder for now). Masthead wordmark
   "AI Representation Benchmark / Taiwan → Japan · 2026", nav 活動方式｜提名｜規則與方法｜FAQ,
   persistent CTA by phase: 提名台灣新創 / 立即投票 / 查看結果.
1. Hero: eyebrow "Taiwan → Japan AI Representation Benchmark 2026"; H1
   「哪些台灣新創，最值得作為日本市場發展案例？」; subhead verbatim (names IQ Lite Japan
   Edition); CTAs 提名最多三家公司 (passion) + 查看活動方式; disclaimer line verbatim
   「本活動反映社群關注與市場認知，不構成企業赴日業績的客觀排名。」 Schedule panel:
   提名期間 / 投票期間 from settings (`nominate_open`, `nominate_close`, `vote_open`,
   `vote_close`), 結果公布 `10 月 14–15 日` (settings.results_label, default that).
   Highlight the current phase row.
2. Why This Matters: heading 「在台灣被看見，不代表在日本的 AI 世界也被看見」, the three
   questions verbatim, closing line verbatim (names ximu 與 Human Analyst Review).
   Lede paragraph may be the one in the prototype.
3. How It Works: 4 steps verbatim (step 4 = 「ximu 分析與公開發布」…). Mark current
   phase 進行中. Link 查看完整活動規則.
4. Nomination module (phase nominate): title/body/button verbatim
   (提名你認為最值得觀察的台灣赴日新創 / 每人最多提名三家公司… / 開始提名 → the form's
   submit is 送出提名). Fields 01 公司中文名稱 · 02 公司英文名稱 · 03 官方網址 ·
   04 提名理由 (60–200 字; enforce min 60 max 200 in UI and RPC) · 05 你的 Email.
   Email flow as before (OTP modal). Thank-you: 「感謝參與。結果預計於 10 月 14–15 日公布。」
   + 分享活動 (X / LINE / copy). Limit: 3 distinct companies per email.
   Phase vote: this module becomes 「從 Community Shortlist 選出最多三家公司」 with
   the finalists cards (logo optional, 中文名, 英文名, one-line, 產業標籤, 日本市場公開資訊,
   vote toggle; 3 picks; NO counts, NO ranking, NO "目前領先"). Phase results: hidden.
5. 社群最近提名 (phase nominate only): "letters" list — 中文名 + 英文名 + 遮罩 Email + 日期,
   reason in serif. Keep 附議 / 存疑 buttons (they write `votes`), but NEVER show
   counts or scores publicly; only the viewer's own state. Show 「N 位社群成員參與 ·
   N 家公司被提名」. Note line: 「提名經主辦團隊清理與資格檢查後，才會成為第二階段的正式選項。
   第一階段不公開即時排名或逐名票數。」 Newest first, 12 per page, 載入更多.
6. Top 3 Featured Companies 將獲得什麼: verbatim heading, list what winners get
   (IQ Lite Japan Edition, ximu Intelligence + Human Analyst Review, AI Representation
   diagnosis, 來源與引用環境檢視, 競爭定位, 優先行動, 公開案例曝光), value tag
   「IQ Lite 定價 US$180」, note 「報告將在取得必要授權後公開提供下載。」
7. 一份 IQ Lite 回答三個完整問題: See / Compare / Decide verbatim + positioning line
   「IQ Lite 提供一次性的市場 Snapshot。ximu 用於持續觀察市場、Query、競爭狀態與 AI
   Representation 的變化。」
8. Results (phase results only, placed after hero): heading 「Community Top 10 與
   3 Most Voted Featured Companies」, sentence 「本結果由社群提名與投票產生，代表市場認知
   與關注，不等於日本發展成效的客觀前三名。」, Top 3 cards (rank, names, votes, report link
   if `report_url` set), then Top 10 list. Never the phrase 日本發展最成功前三名.
9. 規則與方法: method box (編輯部說明) + accordion 資格 / 期間 / 資料用途 / 異常票處理 /
   同票處理 / 結果公告方式 (text from landing_copy_v3 §8; 期間 reads from settings).
10. FAQ accordion (landing_copy_v3 §9 but the prize answer names IQ Lite Japan Edition).
11. Conversion: 「想看見自己的市場位置？」→ button "Get Your IQ Lite — US$180" +
    「取得一份針對單一市場與商業問題的標準化 AI Representation 診斷。」;
    「想持續掌握市場如何改變？」→ "Start with ximu". Links from settings
    (`iqlite_url`, `ximu_url`; default `https://ximu.ai/` UNVERIFIED — leave editable).
12. Partner strip: heading "Ecosystem and Media Partners", text only:
    「Partner announcement coming soon」 (settings.partners_text, editable). No logos.
13. Colophon: wordmark, disclaimer, 規則與方法 / FAQ links, contact (settings.contact_email),
    © 2026 ximu.
- OG image regenerated in the new style (ink on paper, serif headline).
- robots: allow /, disallow /admin.

## Schema changes (append idempotently to `supabase/schema.sql`, apply, re-apply)
- `posts`: add `company_en text not null default ''`, `url text not null default ''`.
  `nominate(p_company, p_company_en, p_url, p_reason)` — validate url starts with
  http(s)://, reason 60–200 chars (message 「理由請寫 60 到 200 字」). Keep the old
  3-arg overload dropped.
- `posts_public`: expose `company_en`, `url`; REMOVE `score` (Phase 1 hides counts).
  Add `posts_public_count()` or extend `stats()` as needed.
- `settings`: add `nominate_open timestamptz`, `vote_open timestamptz`,
  `results_label text default '10 月 14–15 日'`, `iqlite_url text default ''`,
  `ximu_url text default ''`, `partners_text text default 'Partner announcement coming soon'`,
  `contact_email text default ''`.
- `finalists`: add `name_en text default ''`, `one_liner text default ''`,
  `industry text default ''`, `jp_info text default ''`, `url text default ''`,
  `report_url text default ''`. `finalists_public` exposes these (votes only in results).
- `admin_build_finalists()` fills `name_en`/`url` from the most-endorsed post.

## Admin `/admin` (same visual language, calmer)
- Settings: phase, the four dates, results_label, iqlite_url, ximu_url, partners_text,
  contact_email, offsets.
- Posts table: + company_en, url columns (editable), everything else as before.
- Finalists editor: + the new fields incl. report_url.
- People, CSV exports unchanged.

## Acceptance (execute each; report evidence)
1. `npm run build` clean.
2. Schema applied twice, second run no-op; `node scripts/check-rls.mjs` updated for the
   new shape passes (posts_public has no `score`, has `company_en`,`url`; finalists base
   table denied to anon).
3. `next dev`: `/` HTML contains the H1, the disclaimer, "IQ Lite", "ximu", and none of
   推爆東京 / 推上去 / 噓; `/admin` renders the gate.
4. `git grep -i "推爆\|tuibao"` returns nothing except historical notes in SETUP.md if any
   (update SETUP.md to the new name).
5. `supabase config push` succeeds with the new subject line (or documented manual step).
6. One commit; do not push, do not deploy.
