# Taiwan → Japan AI Representation Benchmark 2026 — setup

Next.js 15 (App Router, TypeScript, `src/`) + Supabase (Postgres, Auth).
Everything the public site needs is the Supabase URL and the **anon** key.

**Two different identity models, on purpose.** The owner decided not to set
up a custom SMTP provider, and Supabase's built-in mailer only allows a
couple of emails per hour for the whole project — public email OTP is not
viable at that volume. So:

- **Participants** voting in Phase 2 (附議 / 存疑 / final vote) use an
  **anonymous Supabase session** (`supabase.auth.signInAnonymously()`, called
  once per browser) plus a plain Email field that is stored, never verified.
  Email is only the de-duplication key (`participants.email_key`); see §3
  and §4. **Phase 1 nomination asks for no email at all** since v6f — it
  de-duplicates on a per-browser id in `localStorage` instead.
- **`/admin`** still uses real **email OTP** — low volume, one admin
  signing in occasionally, well inside the mailer's rate limit. Nothing
  about the admin login changed; see §4.

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
cannot touch `posts`, `finalists`, `votes`, `admins`, `reports`, `final_votes`,
`participants`, or any write RPC.

### What v6f changed — Phase 1 asks for nothing but a name

The owner reverted Phase 1 to campaign memo v4.0: 「第一階段不用寫理由 也不用留
信箱 直接提名就好」. `/nominate` is now company name → confirm (optional
官方網站) → done. The v6r reason requirement and the v6e email requirement are
gone from the UI.

```bash
node scripts/apply-sql.mjs v6f   # idempotent, safe to run twice
```

The block is **additive**, so the previously deployed client (which sends a
real reason and email to the 4-arg RPC) keeps working against it:

- `nominate_company(domain, name, reason, email)` now accepts null/blank for
  reason and email and stores null. A **non-blank** reason is still held to
  10–50 characters and a non-blank email still has to be a valid address, so
  nothing the old client sends behaves differently.
- `nominate_company(domain, name, reason, email, client_id)` is new:
  `client_id` is a per-browser UUID the client keeps in `localStorage`
  (`benchmark:cid`) and stores in `nominations.client_id`.
- `nomination_rank()` counts DISTINCT `coalesce(email, client_id, row id)`, so
  「提名的人越多排名越前面」 still means people: one browser nominating the same
  company ten times counts once, and two browsers count twice.
- `/admin` → 提名紀錄 keeps the reason and Email columns for older rows,
  labelled （舊制）, and adds a 裝置 column — a short hash of `client_id`, which
  is how one browser nominating a dozen companies becomes visible. The CSV
  export carries every column, including the raw `client_id`.

**Deploy order: the SQL block first, the client second.** The reverse would
break live nominations, because the old client's reason and email would land
on a function that no longer accepts them.

### What v6s added — the Phase 2 shortlist

Only the **top 10 companies advance to Phase 2 voting**. Rank is the number of
**distinct nominators** (`nomination_rank().voters`) — the email when the row
has one, otherwise the browser id added in v6f, otherwise the row itself — so
five nominations from one person count once; ties break on the earliest
nomination. The raw row count stays visible in `/admin` as 提名次數.

```bash
node scripts/apply-sql.mjs v6s   # idempotent, safe to run twice
```

The list is **live** until someone locks it: while `public.shortlist` is empty,
`vote_candidates()` and `cast_ballot()` accept the live top 10 of the moment, so
the site still opens with a sane ballot if nobody locks anything. In
`/admin` → 公司與提名 → 第二階段名單:

- **鎖定前 10 名** freezes today's ranking into `public.shortlist`
  (`admin_lock_shortlist(10)`). Do this once nominations close.
- **加入 / 移出** rewrites the whole list by hand (`admin_set_shortlist()`),
  ranks following the order shown.
- **解除鎖定** empties the table and hands Phase 2 back to the live top 10.

A ballot for a company outside the list is refused with
「這家公司不在第二階段的前 10 名名單中。」 The `shortlist` table itself has no
grant and no policy: it is reachable only through the admin RPCs.

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

### What v3 added — no public OTP

The owner decided against setting up custom SMTP, and Supabase's built-in
mailer is capped at ~2 emails/hour project-wide, so public email OTP could
never scale to real participation. v3 replaces it with an honest tradeoff:

- `public.participants (email_key primary key, email, first_user_id,
  created_at)` — the durable record of every email used to participate.
  `email_key = lower(btrim(email))`. Admin-only read (`is_admin()`); no
  direct writes from the API at all (only the RPCs below touch it).
- `public.votes`, `public.reports`, `public.final_votes` are now keyed by
  `email_key` instead of `user_id` (new composite primary keys). `user_id`
  stays on each row as an informational audit column only.
- Every write RPC takes an explicit `p_email` argument instead of reading
  `auth.jwt() ->> 'email'` (there is no verified JWT email any more):
  `nominate(p_company, p_company_en, p_url, p_reason, p_email)`,
  `cast_vote(p_post, p_dir, p_email)`, `report_post(p_post, p_email)`,
  `cast_final_vote(p_finalist, p_email)`, `my_state(p_email)`. All still
  require a live `auth.uid()` (the anonymous session) for the audit trail,
  and all validate the email format server-side.
- The 3-distinct-companies nomination cap and the 3-picks final-vote cap are
  now enforced **per email**, not per browser session.
- `public.write_events` + `check_rate_limit()` — a plain count-based limiter:
  at most 30 writes per email per hour, and at most 60 vote-shaped writes
  (附議／存疑 and final vote) per anonymous session per hour. Over the limit
  raises `操作過於頻繁，請稍後再試。`. No CAPTCHA, no SMTP dependency.
- `admin_people()` no longer joins `auth.users` (anonymous sessions have no
  email there); it groups `participants ∪ posts ∪ votes ∪ final_votes` by
  `email_key` and returns `(email, email_key, first_seen, n_posts, n_votes,
  n_final_votes, companies)`.
- **Honest limits of this model:** the email is never verified, so nothing
  stops someone from typing an address they don't own, and nothing stops one
  person from voting multiple times under different emails. It buys
  low-friction participation without any mail infrastructure, at the cost of
  the light fraud resistance email OTP used to provide. Fine for a
  community-sentiment benchmark; would need revisiting for anything with
  real stakes attached to an individual identity.

## 4. Auth: anonymous participants + admin email OTP

**Participants never see an OTP.** `SiteClient` calls
`supabase.auth.signInAnonymously()` once per browser, the first time someone
tries to nominate, 附議/存疑, or vote — the session cookie is then reused for
every later write. The Email field on the nomination form (and the small
"留下你的 Email" modal for 附議/存疑/final vote) is stored in
`localStorage` (`benchmark:email`) and sent as `p_email` to the RPCs; it is
never verified, and no email is ever sent to a participant.

**`/admin` is unchanged: real email OTP.** `supabase/config.toml` holds the
auth settings and points at `supabase/templates/confirmation.html` and
`supabase/templates/magic_link.html`. Both templates contain `{{ .Token }}`;
both subjects are `驗證碼 {{ .Token }}｜AI Representation Benchmark`; the OTP
is 6 digits. `site_url` and `additional_redirect_urls` point at
`https://tw-jp-ai-benchmark.vercel.app` (plus `http://localhost:3000`).
`[auth] enable_anonymous_sign_ins = true` is the only change that affects
this file's auth config for v3.

```bash
supabase config push --project-ref pjqejaxfxjtcujfamyem --yes
```

This was run successfully for `enable_anonymous_sign_ins = true`; the CLI
reported `auth: updated`. Re-run `config push` after editing either OTP
template or any other `[auth]` value.

If `config push` ever fails, do the same by hand in the dashboard:
Authentication → Providers → Email → toggle **Allow anonymous sign-ins** on;
Authentication → URL Configuration → set the site URL and redirect URLs;
Authentication → Emails → *Confirm signup* and *Magic Link* → paste the two
HTML files and set both subjects to
`驗證碼 {{ .Token }}｜AI Representation Benchmark`; Authentication → Providers →
Email → set **Email OTP Length** to 6.

**Sender name.** Supabase's built-in sender cannot be renamed; the
`AI Representation Benchmark` sender name only takes effect once custom SMTP is
configured (see below). This now only matters for the rare admin login email,
not for participants — they never receive mail at all.

## 5. Email deliverability — admin login only now

Supabase's built-in email sender is **rate limited** (a couple of messages per
hour for the whole project). Because v3 removed public OTP, the only mail
this project sends any more is the occasional `/admin` sign-in code — one
admin, signing in occasionally, comfortably inside that limit. Custom SMTP
(Resend, Postmark, SendGrid, anything, configured in the dashboard under
Project Settings → Authentication → SMTP Settings) is therefore **not
required to launch the public site**. It only becomes worth doing if the
admin roster grows enough that a couple of sign-ins per hour becomes tight,
or you want the `AI Representation Benchmark` sender name to actually show up
in the admin's inbox.

Do not test the admin login more than a couple of times in quick succession
without SMTP in place; you would exhaust the hourly quota for the one admin
who needs it.

## 6. Adding an admin

Admins are rows in `public.admins`. `ray860408@gmail.com` is seeded by the
schema. To add another:

```bash
supabase db query --linked --project-ref pjqejaxfxjtcujfamyem \
  "insert into public.admins (email) values ('someone@example.com') on conflict do nothing;"
```

To remove one, `delete from public.admins where email = '…';`.

`/admin` still asks for a real email OTP (unchanged from before v3) —
participants no longer do. Anyone who signs in but is not in `admins` sees
only 這個帳號沒有後台權限。 — and the RLS policies mean a non-admin cannot
read the posts table, `participants`, or the people list even if they poke at
the API directly.

## 7. Changing phases

The whole site is driven by one row: `public.settings` where `id = 1`, but the
site and every write RPC never read `phase` directly — they all call
`public.effective_phase()`, which is the single source of truth for "what
phase is it right now":

- `phase_mode = 'auto'` (the default): `effective_phase()` derives the phase
  purely from the campaign dates — `pre` before `nominate_open`, `nominate`
  through `nominate_close`, `vote` between `vote_open` and `vote_close`, and
  `closed` after that. Nobody has to flip anything by hand.
- `phase_mode = 'manual'`: `effective_phase()` returns `settings.phase`
  verbatim — the radio in `/admin` wins outright.
- Either way, `settings.phase = 'results'` always wins. Results are only ever
  announced by hand, in both modes.

| effective phase | what the site shows |
|---|---|
| `pre` | Hero + schedule only; nomination module shows a "not open yet" notice |
| `nominate` | 提名表單（5 欄）＋ 社群最近提名 list（no counts） |
| `vote` | Community Shortlist cards, 3 picks per Email, no counts or ranking |
| `closed` | "投票已結束" notice; schedule panel highlights 結果公布 |
| `results` | Community Top 10 與 3 Most Voted Featured Companies, placed after the hero |

Change it in `/admin` → 設定: the 自動依日期 / 手動 radio picks the mode (the
panel also shows the current effective phase read-only), the phase radio below
it (now including 尚未開始 / 已結束) only takes effect in manual mode, and the
four campaign dates / text settings / two counter offsets are unchanged. Or by
hand:

```bash
# Flip to manual mode and force a phase:
supabase db query --linked --project-ref pjqejaxfxjtcujfamyem \
  "update public.settings set phase_mode = 'manual', phase = 'vote' where id = 1;"

# Back to date-driven switching:
supabase db query --linked --project-ref pjqejaxfxjtcujfamyem \
  "update public.settings set phase_mode = 'auto' where id = 1;"
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

Both URL fields fall back to `https://ximu-geo.com/zh-TW` when left empty — confirm the
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
the admin-gated `posts` table, `public.participants`, and `admin_people()`.
`/admin` → 參與名單 exports them as `benchmark-people-YYYYMMDD.csv`, and 提名
has its own CSV export with emails included. Remember these addresses are
**unverified** (v3, §3) — treat them as self-reported, not confirmed.

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
