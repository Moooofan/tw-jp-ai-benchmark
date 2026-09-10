# 推爆東京

哪家台灣新創在東京最值得推？留一句理由，讓大家推。推最多的十家進決賽。

純社群投票，好玩用的，不代表任何排名。

---

Next.js 15 App Router + Supabase. Three phases (`nominate` / `vote` /
`results`) driven by one settings row.

- `SPEC.md` — the build spec this repo implements (kept in the working folder, not tracked).
- `SETUP.md` — how to run it, apply the schema, push the auth config, change
  phases, add an admin.
- `supabase/schema.sql` — the entire data model, RLS and RPCs, idempotent.
- `scripts/check-rls.mjs` — asserts the anonymous surface against the live
  project.

```bash
npm install
npm run dev
```
