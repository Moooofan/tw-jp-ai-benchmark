# Taiwan → Japan AI Representation Benchmark 2026

哪些台灣新創，最值得作為日本市場發展案例？由台灣新創社群共同提名與投票，選出
Community Top 10。前三高票公司將獲得 IQ Lite Japan Edition。

本活動反映社群關注與市場認知，不構成企業赴日業績的客觀排名。

---

Next.js 15 App Router + Supabase, presented as a news-media special section.
One persistent URL; three phases (`nominate` / `vote` / `results`) driven by a
single `settings` row. Phase 1 never exposes endorsement counts or scores to
the public — the view, the RPCs and the HTML all withhold them.

- `SPEC-v2.md` — the build spec this repo implements (supersedes `SPEC.md`).
- `SETUP.md` — how to run it, apply the schema, push the auth config, change
  phases, add an admin.
- `supabase/schema.sql` — the entire data model, RLS and RPCs, idempotent.
- `scripts/check-rls.mjs` — asserts the anonymous surface against the live
  project.
- `../prototype/editorial-v3.html` — the approved visual direction the CSS is
  ported from.

```bash
npm install
npm run dev
```
