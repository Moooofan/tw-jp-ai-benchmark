# Taiwan → Japan AI Representation Benchmark 2026 — setup

Next.js 15 (App Router, TypeScript, `src/`) + Supabase (Postgres, Auth email OTP).
Everything the public site needs is the Supabase URL and the **anon** key.

## 1. Environment variables

Create `.env.local` in this directory (it is gitignored — never commit it):

```
NEXT_PUBLIC_SUPABASE_URL=https://pjqejaxfxjtcujfamyem.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<the legacy "anon" key>
```

The anon key lives in `../.secrets/supabase-keys.json` (`type: legacy, name: anon`).
The same two variables are the only ones the Vercel project needs.

The `service_role` key is **not** used by this app anywhere. Do not put it in
`.env.local`, in Vercel, or in the repo.

## 2. Run locally

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # production build + type check
```

## 3. Apply the database schema

`supabase/schema.sql` is the whole data model: tables, triggers, views, RLS
policies and RPCs. It is idempotent — running it again is a no-op.

```bash
# once per machine
supabase link --project-ref pjqejaxfxjtcujfamyem -p "$(cat ../.secrets/supabase-db-password.txt)"

# apply
supabase db query --linked --project-ref pjqejaxfxjtcujfamyem -f supabase/schema.sql
```

Verify the public surface afterwards (anon key, no session — reads
`.env.local`, never prints the key):

```bash
node scripts/check-rls.mjs
```

It asserts that anonymous callers can read `posts_public`, `finalists_public`,
`settings`, `stats()`, `posts_public_count()` and `company_suggest()`; that
`posts_public` carries `company_en` and `url` but **no** `score`; and that anon
cannot touch `posts`, `finalists`, `votes`, `admins`, `reports`, `final_votes`
or any write RPC.

### What v2 added

- `posts.company_en`, `posts.url`; `reason` is now 60–200 characters.
- `nominate(p_company, p_company_en, p_url, p_reason)` — the old two-argument
  overload is dropped. It rejects a URL that does not start with `http(s)://`
  and a reason outside 60–200 characters (`理由請寫 60 到 200 字`).
- `posts_public` no longer exposes `score`. Phase 1 must never publish live
  rankings or per-name vote counts; the viewer's own 附議／存疑 state comes
  back from `my_state()`, and `cast_vote()` returns only the caller's own
  value.
- `settings.nominate_open`, `vote_open`, `results_label`, `iqlite_url`,
  `ximu_url`, `partners_text`, `contact_email`.
- `finalists.name_en`, `one_liner`, `industry`, `jp_info`, `url`, `report_url`,
  all exposed through `finalists_public`; `votes` stays null until the phase is
  `results`.
- `posts_public_count()` for paging the 社群最近提名 list.

## 4. Auth email templates and OTP settings

`supabase/config.toml` holds the auth settings and points at
`supabase/templates/confirmation.html` and `supabase/templates/magic_link.html`.
Both templates contain `{{ .Token }}`; both subjects are
`驗證碼 {{ .Token }}｜AI Representation Benchmark`; the OTP is 6 digits.
`site_url` and `additional_redirect_urls` point at
`https://tw-jp-ai-benchmark.vercel.app` (plus `http://localhost:3000`).

```bash
supabase config push --project-ref pjqejaxfxjtcujfamyem --yes
```

This was run successfully; the CLI reported `auth: updated`. Re-run it after
editing either template or any `[auth]` value.

If `config push` ever fails, do the same by hand in the dashboard:
Authentication → URL Configuration → set the site URL and redirect URLs;
Authentication → Emails → *Confirm signup* and *Magic Link* → paste the two
HTML files and set both subjects to
`驗證碼 {{ .Token }}｜AI Representation Benchmark`; Authentication → Providers →
Email → set **Email OTP Length** to 6.

**Sender name.** Supabase's built-in sender cannot be renamed; the
`AI Representation Benchmark` sender name only takes effect once custom SMTP is
configured (see below).

## 5. Email deliverability (do this before launch)

Supabase's built-in email sender is **rate limited** (a couple of messages per
hour for the whole project) and is only meant for development. Before the site
is public, configure custom SMTP — Resend, Postmark, SendGrid, anything — in
the dashboard under Project Settings → Authentication → SMTP Settings, then
raise Authentication → Rate Limits → "Emails sent per hour". Set the SMTP
sender name to `AI Representation Benchmark` there. Without this, most people
who ask for a code will never get one.

Do not test with real OTP emails more than a couple of times before SMTP is in
place; you will exhaust the hourly quota for everybody.

## 6. Adding an admin

Admins are rows in `public.admins`. `ray860408@gmail.com` is seeded by the
schema. To add another:

```bash
supabase db query --linked --project-ref pjqejaxfxjtcujfamyem \
  "insert into public.admins (email) values ('someone@example.com') on conflict do nothing;"
```

To remove one, `delete from public.admins where email = '…';`.

`/admin` asks for an email OTP like the public site does. Anyone who signs in
but is not in `admins` sees only 這個帳號沒有後台權限。 — and the RLS policies
mean a non-admin cannot read the posts table or the people list even if they
poke at the API directly.

## 7. Changing phases

The whole site is driven by one row: `public.settings` where `id = 1`.

| phase | what the site shows |
|---|---|
| `nominate` | 提名表單（5 欄）＋ 社群最近提名 list（no counts） |
| `vote` | Community Shortlist cards, 3 picks per Email, no counts or ranking |
| `results` | Community Top 10 與 3 Most Voted Featured Companies, placed after the hero |

Change it in `/admin` → 設定 (phase radio, the four campaign dates, the text
settings and the two counter offsets), or by hand:

```bash
supabase db query --linked --project-ref pjqejaxfxjtcujfamyem \
  "update public.settings set phase = 'vote' where id = 1;"
```

Before switching to `vote`, press 依公司總表自動產生前 10 in `/admin` →
Community Shortlist so `finalists` is populated (it rebuilds from the top 10
company keys by summed endorsement score, carrying over each company's English
name and URL, and it clears any existing shortlist and votes). Then fill in
一句話描述 / 產業標籤 / 日本市場公開資訊 for each card.

## 8. Editable copy in `/admin` → 設定

| field | shows up as |
|---|---|
| 提名開始／截止、投票開始／截止 | the hero schedule panel and 規則與方法 → 期間 |
| `results_label` | 結果公布 row, thank-you modal, 期間 (default `10 月 14–15 日`) |
| `iqlite_url` | `Get Your IQ Lite — US$180` button |
| `ximu_url` | `Start with ximu` button |
| `partners_text` | the Ecosystem and Media Partners strip (text only, no logos) |
| `contact_email` | the colophon contact line (hidden when empty) |

Both URL fields fall back to `https://ximu.ai/` when left empty — confirm the
real destinations before launch.

## 9. Adjusting numbers

- Per-post: `/admin` → 提名 → 調整 column (saves on blur). Score = 附議 − 存疑
  + 調整, and it is **admin-only** — the public site never renders it.
- Headline counters: `/admin` → 設定 → 參與人數加成 / 公司數加成.
- Hiding a post takes it out of the public list, `stats()` and the shortlist
  builder, without deleting it.

## 10. Emails and privacy

The public API never exposes an address: `posts_public` only returns
`masked_email` (`p***@example.com`). Full addresses are readable only through
the admin-gated `posts` table and `admin_people()`. `/admin` → 參與名單 exports
them as `benchmark-people-YYYYMMDD.csv`, and 提名 has its own CSV export with
emails included.

## 11. Deploy

Vercel project `tw-jp-ai-benchmark`, framework preset Next.js, no build
overrides. Set the two `NEXT_PUBLIC_*` variables. If the production domain ends
up being anything other than `https://tw-jp-ai-benchmark.vercel.app`, update
`site_url` and `additional_redirect_urls` in `supabase/config.toml` and push the
config again.

## 12. Known audit noise

`npm audit` reports two advisories against the `postcss` copy that Next 15
bundles. The only offered fix is Next 16, which the spec pins away from, and
the advisories are build-time source-map issues that never touch this app's
runtime. Left as-is deliberately; revisit whenever the project moves to Next 16.
