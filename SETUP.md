# 推爆東京 — setup

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
`settings`, `stats()` and `company_suggest()`, and that they cannot touch
`posts`, `votes`, `admins`, `reports`, `final_votes` or any write RPC.

## 4. Auth email templates and OTP settings

`supabase/config.toml` holds the auth settings and points at
`supabase/templates/confirmation.html` and `supabase/templates/magic_link.html`.
Both templates contain `{{ .Token }}`; both subjects are `驗證碼 {{ .Token }}`;
the OTP is 6 digits.

```bash
supabase config push --project-ref pjqejaxfxjtcujfamyem --yes
```

This was run successfully; the CLI reported `auth: updated`. Re-run it after
editing either template or any `[auth]` value.

If `config push` ever fails, do the same by hand in the dashboard:
Authentication → Emails → *Confirm signup* and *Magic Link* → paste the two
HTML files, set both subjects to `驗證碼 {{ .Token }}`; Authentication →
Providers → Email → set **Email OTP Length** to 6.

**Sender name.** Supabase's built-in sender cannot be renamed; the `推爆東京`
sender name only takes effect once custom SMTP is configured (see below).

## 5. Email deliverability (do this before launch)

Supabase's built-in email sender is **rate limited** (a couple of messages per
hour for the whole project) and is only meant for development. Before the site
is public, configure custom SMTP — Resend, Postmark, SendGrid, anything — in
the dashboard under Project Settings → Authentication → SMTP Settings, then
raise Authentication → Rate Limits → "Emails sent per hour". Set the SMTP
sender name to `推爆東京` there. Without this, most people who ask for a code
will never get one.

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
but is not in `admins` sees only 這裡沒有東西。 — and the RLS policies mean a
non-admin cannot read the posts table or the people list even if they poke at
the API directly.

## 7. Changing phases

The whole site is driven by one row: `public.settings` where `id = 1`.

| phase | what the site shows |
|---|---|
| `nominate` | poster + nomination form + 推薦牆 (default) |
| `vote` | 被推爆的十家 grid, 3 votes per person, form hidden |
| `results` | 被推爆的三家 podium + the remaining 7 |

Change it in `/admin` → 設定 (phase radio, the two countdown deadlines, and the
`people_offset` / `companies_offset` numbers that pad the two counters), or by
hand:

```bash
supabase db query --linked --project-ref pjqejaxfxjtcujfamyem \
  "update public.settings set phase = 'vote' where id = 1;"
```

Before switching to `vote`, press 用目前總表自動產生前 10 in `/admin` →
決賽名單 so `finalists` is populated (it rebuilds from the top 10 company keys
by summed score, and it clears any existing finalists and final votes).

## 8. Adjusting numbers

- Per-post: `/admin` → 貼文 → 調整 column (saves on blur). Score = 推 − 噓 + 調整.
- Headline counters: `/admin` → 設定 → 人數加成 / 公司數加成.
- Hiding a post takes it out of the public wall, the ticker, `stats()` and the
  finalist builder, without deleting it.

## 9. Emails and privacy

The public API never exposes an address: `posts_public` only returns
`masked_email` (`p***@example.com`). Full addresses are readable only through
the admin-gated `posts` table and `admin_people()`. `/admin` → 名單 exports
them as `tuibao-people-YYYYMMDD.csv`, and 貼文 has its own CSV export with
emails included.

## 10. Deploy

Vercel project `tuibao-tokyo`, framework preset Next.js, no build overrides.
Set the two `NEXT_PUBLIC_*` variables. After the first deploy, set the auth
`site_url` in `supabase/config.toml` to the real domain if it is not
`https://tuibao-tokyo.vercel.app`, and push the config again.

## 11. Known audit noise

`npm audit` reports two advisories against the `postcss` copy that Next 15
bundles. The only offered fix is Next 16, which the spec pins away from, and
the advisories are build-time source-map issues that never touch this app's
runtime. Left as-is deliberately; revisit whenever the project moves to Next 16.
