# SPEC v7c — Phase 2 ballot picks up Phase 1's nomination flow

Supersedes the Phase-2 picking rules in `SPEC-v7-phase2.md` and the shortlist rules
added by the `v6s` schema block. Source of truth: **TW JP Market Attack Campaign
v4.0**, page 3 (四、Phase 2｜Vote & Perception｜9/28–10/6) and page 6
(十一、給產品團隊 / 十二、給市場團隊).

## 1. What v4.0 actually mandates for Phase 2

Verbatim from p.3, 1. 正式投票規則:

- 必須輸入 Email。
- 每人每天 1 張 ballot。
- 每張 ballot 最多投 3 家公司。
- 每次投票必須留下『為什麼』。
- 投票截止：10/6。

p.3, 2. 讚／倒讚正式影響票數:

- 每一個投票理由可按讚或倒讚。
- 以淨反應計算：Likes − Dislikes。
- 每累積淨 +10 個反應 = +1 票；每累積淨 −10 個反應 = −1 票。
- 因為會影響正式票數，一個 Email 對同一理由只能表態一次。

p.3, 3. Phase 2 網站重點: Leaderboard / rank movement、投票理由與熱門理由、
Company word cloud、整體日本市場 perception word cloud、Like / Dislike /
Community Resonance、總票數、總理由數、趨勢。

p.6, 十一 (給產品團隊) Phase 2 row: 「Voting Engine、Email、每日一 ballot、
最多 3 家、理由、Like/Dislike、UGC、word cloud」.

p.6, 十二 (給市場團隊) Phase 2 row: Narrative「現在真正來投票，並告訴我們為什麼。」
市場動作「排行、理由、讚／倒讚、word cloud、10/8 預告」.

**Two things v4.0 does NOT say anywhere:** it never defines a shortlist, and it
never restricts the ballot to Phase-1 nominees. `Company Resolver` +
`Official Domain canonical ID` are listed as Phase-1 deliverables but they are
shared infrastructure, not a Phase-1-only gate.

## 2. Owner's ruling (wins over earlier specs)

> 「Phase 2 v4.0 有把整個流程寫清楚了。Phase 1 大家不會寫為什麼，只會提名，
> 所以 Phase 2 大家投票時候要有提名環節。」

Phase 1 (p.3, 三、1) explicitly asks for **no reason, no name, no email**. So the
Phase-1 candidate pool is a low-signal list. Phase 2 is where reasons appear, and a
voter must not be blocked from voting for a company simply because nobody typed its
name during Phase 1.

## 3. Rules

### R1 — The ballot picker is the nomination picker

`/vote` uses the same picking experience as `/nominate`:

1. Type a name (400 ms debounce).
2. Matches from our own DB (`vote_candidates`) render first.
3. External suggestions follow, under the separator `其他可能的公司`, each with a
   source chip: `網站驗證` (live-site verified) or `公開資料` (Wikidata).
4. The last item is always `找不到？直接提名「{typed}」` when the typed name is
   ≥ 2 characters, the search has settled, and no exact name/alias match exists.
5. The external and typed paths open a confirm sub-step with an editable website
   field: `官方網站` (external — a domain is already known) or
   `官方網站（選填）` (typed — a website is optional).

### R2 — Picking an unknown company nominates it

When a pick resolves to a company that does not exist yet, the server:

- creates the `companies` row with `status = 'pending'` (identical to Phase 1),
  keyed by the normalised official domain, or by the `name:<key>` pseudo-domain
  when the voter supplied no website;
- inserts a `nominations` row for it (so the company becomes `is_candidate` and can
  appear on the leaderboard and in search);
- then records the ballot pick as normal.

A company that already exists is reused, following any `merged_into` chain. Official
Domain stays the canonical identifier (v4.0 p.3, 三、3).

### R3 — The shortlist is advisory, off by default

v4.0 defines no shortlist, so `cast_ballot` and `vote_candidates` no longer gate on
it by default. `settings.shortlist_enforced boolean not null default false` controls
it; the gate runs **only** when that flag is true. The `shortlist` table,
`shortlist_domains()`, `admin_lock_shortlist()`, `admin_set_shortlist()` and
`admin_shortlist()` all stay in place for editorial use. `/admin` exposes a switch
that states plainly that v4.0 does not require a shortlist.

### R4 — Everything else in v4.0 Phase 2 is unchanged

Email required; one ballot per person per Taipei day; at most 3 companies per
ballot; a 10–50 character 「為什麼」 per picked company; one reaction per email per
reason; every net ±10 reactions = ±1 vote (`settings.reaction_votes_per`); voting
closes 10/6 (`settings.vote_close`); leaderboard with rank movement; hot + latest
reasons; company word cloud; overall Japan-market word cloud; totals and a daily
trend.

### R5 — Phase 1 output is frozen

The live site is in phase `nominate`. Nothing in this change may alter what `/`,
`/nominate` or `/vote` render while the phase is `pre` or `nominate`.
`NominateClient.tsx`, `HomePhase1.tsx`, `VoteClient.tsx`, `SiteChrome.tsx`,
`src/lib/phase.ts` and the `stats()` RPC are therefore untouched; the new picker is
a separate component rather than a refactor of the Phase-1 one, and
`shortlist_enforced` is deliberately not added to `stats()`, so it never reaches a
Phase-1 payload.

## 4. Implementation

All DB work is additive and lives in the `-- BEGIN v7c` block at the **end** of
`supabase/schema.sql`, applied with `node scripts/apply-sql.mjs v7c` (idempotent —
safe to run twice). The block must stay last in the file: `create or replace
function` resolution here is decided by file order, and the `v6s`/`v6f`/`v6g` blocks
physically sit after `v7`/`v7b`.

| Object | Change |
| --- | --- |
| `settings.shortlist_enforced` | new column, `boolean not null default false` |
| `shortlist_is_enforced()` | internal reader for the flag |
| `ensure_vote_company(domain, name, email, client_id)` | internal; resolves or creates the company + its nomination row |
| `cast_ballot(email, picks, client_id)` | new 3-arg form; picks carry `domain` / `name` / `site` / `reason` |
| `cast_ballot(email, picks)` | kept as a thin wrapper so the deployed client keeps working |
| `vote_candidates(q)` | shortlist gate now conditional on the flag |
| `admin_set_shortlist_enforced(enabled)` | new admin RPC |
| `admin_shortlist()` | returns the flag alongside its existing payload |

Client: `src/components/CompanyPicker.tsx` (new), `src/lib/client-id.ts` (new),
`src/components/BallotClient.tsx`, `src/components/AdminVote.tsx`.

Tests: `supabase/tests/v7c-vote.sql`, rolled back with `raise exception 'ROLLBACK_OK'`.
