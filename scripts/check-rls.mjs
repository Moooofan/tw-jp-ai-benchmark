#!/usr/bin/env node
/**
 * Pokes the LIVE Supabase project with the anon key, no session, and asserts
 * that the public surface is exactly what it should be.
 *
 *   node scripts/check-rls.mjs
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY from the
 * environment, falling back to .env.local. Never prints the key.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  const env = { ...process.env };
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    try {
      for (const line of readFileSync(".env.local", "utf8").split("\n")) {
        const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
        if (m && !env[m[1]]) env[m[1]] = m[2];
      }
    } catch {
      /* no .env.local, rely on the environment */
    }
  }
  return env;
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !anon) {
  console.error("missing NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY");
  process.exit(2);
}

const sb = createClient(url, anon, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(
    `${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`,
  );
}

async function allowed(name, promise) {
  const { error } = await promise;
  record(name, !error, error ? error.message : "readable");
}

async function denied(name, promise) {
  const { data, error } = await promise;
  const rows = Array.isArray(data) ? data.length : data == null ? 0 : 1;
  // The table grant is revoked for anon, so PostgREST must answer with a
  // permission error. An empty set would also be safe but weaker, so say so.
  const hardDenied = !!error && /permission denied/i.test(error.message);
  record(
    name,
    hardDenied || rows === 0,
    error ? error.message : `${rows} row(s) (RLS-filtered, grant still open)`,
  );
}

console.log(`project: ${url}  (anon key, no session)\n`);

await allowed(
  "anon can read posts_public",
  sb.from("posts_public").select("*").limit(5),
);

// Phase 1 governance: the public view must carry the v2 columns and must NOT
// carry any endorsement score.
{
  const { data, error } = await sb.from("posts_public").select("*").limit(1);
  const cols = new Set(
    Array.isArray(data) && data.length > 0 ? Object.keys(data[0]) : [],
  );
  const probe = await sb.from("posts_public").select("score").limit(1);
  const noScore = !!probe.error && /score/i.test(probe.error.message);
  record(
    "posts_public exposes no score",
    noScore,
    probe.error ? probe.error.message : "score column is still selectable",
  );
  const hasNew =
    cols.size === 0 ? null : cols.has("company_en") && cols.has("url");
  record(
    "posts_public exposes company_en and url",
    hasNew !== false,
    hasNew === null
      ? "no rows yet; column check skipped"
      : error
        ? error.message
        : [...cols].join(", "),
  );
}
await allowed("anon can call stats()", sb.rpc("stats"));
await allowed("anon can call effective_phase()", sb.rpc("effective_phase"));
await allowed(
  "anon can call posts_public_count()",
  sb.rpc("posts_public_count"),
);
await allowed(
  "anon can call company_suggest()",
  sb.rpc("company_suggest", { q: "a" }),
);
await allowed(
  "anon can read finalists_public",
  sb.from("finalists_public").select("*").limit(5),
);
await allowed(
  "anon can read settings",
  sb.from("settings").select("phase").limit(1),
);

await denied("anon cannot read posts", sb.from("posts").select("*").limit(1));
await denied(
  "anon cannot read finalists",
  sb.from("finalists").select("*").limit(1),
);
await denied("anon cannot read votes", sb.from("votes").select("*").limit(1));
await denied("anon cannot read admins", sb.from("admins").select("*").limit(1));
await denied(
  "anon cannot read reports",
  sb.from("reports").select("*").limit(1),
);
await denied(
  "anon cannot read final_votes",
  sb.from("final_votes").select("*").limit(1),
);
await denied(
  "anon cannot read participants",
  sb.from("participants").select("*").limit(1),
);

async function mustErrorLater(name, thunk) {
  return mustError(name, thunk());
}

async function mustError(name, promise) {
  const { error } = await promise;
  record(name, !!error, error ? error.message : "unexpectedly succeeded");
}

await mustError(
  "anon cannot update settings",
  sb.from("settings").update({ phase: "results" }).eq("id", 1).select(),
);

// v6: the email-based nomination is retired and must say so.
{
  const { error } = await sb.rpc("nominate", {
    p_company: "rls-probe",
    p_company_en: "RLS Probe",
    p_url: "https://example.com/",
    p_reason: "should never land".padEnd(20, "."),
    p_email: "rls-probe@example.com",
  });
  record(
    "old nominate() rejects with 提名方式已更新",
    !!error && error.message.includes("提名方式已更新，請重新整理頁面。"),
    error ? error.message : "unexpectedly succeeded",
  );
}

// ---------------------------------------------------------------- v6 Phase 1
await allowed(
  "anon can call resolve_company()",
  sb.rpc("resolve_company", { q: "a" }),
);
await allowed(
  "anon can call resolve_domain()",
  sb.rpc("resolve_domain", {
    url: "https://www.rls-probe.example/path",
    name: "rls-probe",
  }),
);
{
  const { data } = await sb.rpc("resolve_domain", {
    url: "HTTPS://www.RLS-probe.example:8443/x?y=1",
  });
  record(
    "resolve_domain() normalises to the bare domain",
    data?.domain === "rls-probe.example",
    JSON.stringify(data),
  );
}
/**
 * Runs one `do $$ … raise exception 'ROLLBACK_OK' $$` statement through
 * scripts/apply-sql.mjs: the statement always aborts, so nothing it wrote
 * persists. PASS only when the ROLLBACK_OK marker comes back.
 */
function rollbackTest(name, sql) {
  let out = "";
  try {
    out = execFileSync("node", ["scripts/apply-sql.mjs", "--sql", sql], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120000,
    });
  } catch (e) {
    out = String((e.stdout || "") + (e.stderr || "") || e.message);
  }
  const line =
    out.split("\n").find((l) => /ROLLBACK_|_ACCEPTED|_BROKEN|_BAD/.test(l)) ??
    out.trim().split("\n").slice(-1)[0];
  record(name, /ROLLBACK_OK/.test(out), line?.trim());
}

// v6r + v6e-retire: a nomination that DOES carry a reason and an email is
// still held to 10–50 characters and a valid address (v6f only made them
// optional); the 2-arg and 3-arg overloads only tell stale tabs to reload.
// Only probes that fail are sent through PostgREST; success paths run in
// rolled-back DO blocks.
{
  const { error } = await sb.rpc("nominate_company", {
    p_domain: "rls-probe.example",
    p_display_name: "rls-probe",
    p_reason: "這是三參數版本應該被拒絕的理由",
  });
  record(
    "3-arg nominate_company() raises 提名方式已更新 (v6e-retire)",
    !!error && error.message.includes("提名方式已更新，請重新整理頁面。"),
    error ? error.message : "unexpectedly succeeded",
  );
}
{
  const { error } = await sb.rpc("nominate_company", {
    p_domain: "rls-probe.example",
    p_display_name: "rls-probe",
  });
  record(
    "2-arg nominate_company() raises 提名方式已更新",
    !!error && error.message.includes("提名方式已更新，請重新整理頁面。"),
    error ? error.message : "unexpectedly succeeded",
  );
}
{
  const { error } = await sb.rpc("nominate_company", {
    p_domain: "rls-probe.example",
    p_display_name: "rls-probe",
    p_reason: "123456789",
    p_email: "rls-probe@example.com",
  });
  record(
    "anon can call 4-arg nominate_company(); 9-char reason rejected",
    !!error && error.message.includes("提名理由請寫 10 到 50 字。"),
    error ? error.message : "unexpectedly succeeded",
  );
}
{
  // The 4-arg overload is callable by anon (no permission error) and an
  // invalid email is rejected before any write.
  const { error } = await sb.rpc("nominate_company", {
    p_domain: "rls-probe.example",
    p_display_name: "rls-probe",
    p_reason: "1234567890",
    p_email: "not-an-email",
  });
  record(
    "anon can call 4-arg nominate_company(); invalid email rejected",
    !!error && error.message.includes("請填寫正確的 Email。"),
    error ? error.message : "unexpectedly succeeded",
  );
}
{
  // v6n: a blank website with a 1-character name is rejected before any write.
  const { error } = await sb.rpc("nominate_company", {
    p_domain: "",
    p_display_name: " x ",
    p_reason: "1234567890",
    p_email: "rls-probe@example.com",
  });
  record(
    "4-arg nominate_company(); blank website + 1-char name rejected (v6n)",
    !!error && error.message.includes("請填寫公司名稱。"),
    error ? error.message : "unexpectedly succeeded",
  );
}

// As role anon: a valid reason is stored trimmed, a 9-char reason, the 2-arg
// and the 3-arg calls raise, then everything rolls back.
rollbackTest(
  "rollback test: anon 4-arg nominate stores the reason; 2/3-arg raise",
  `do $$
declare j json; r text;
begin
  execute 'set local role anon';
  j := public.nominate_company('rls-probe.example', 'rls-probe', '  這是一個回滾測試用的提名理由  ', 'rls-probe@example.com');
  begin
    perform public.nominate_company('rls-probe.example', 'rls-probe', '123456789', 'rls-probe@example.com');
    raise exception 'SHORT_REASON_ACCEPTED';
  exception when others then
    if sqlerrm not like '%10 到 50 字%' then raise; end if;
  end;
  begin
    perform public.nominate_company('rls-probe.example', 'rls-probe');
    raise exception 'OLD_SIGNATURE_ACCEPTED';
  exception when others then
    if sqlerrm not like '%提名方式已更新%' then raise; end if;
  end;
  begin
    perform public.nominate_company('rls-probe.example', 'rls-probe', '這是三參數版本應該被拒絕的理由');
    raise exception 'THREE_ARG_ACCEPTED';
  exception when others then
    if sqlerrm not like '%提名方式已更新%' then raise; end if;
  end;
  execute 'reset role';
  select nm.reason into r from public.nominations nm
    where nm.domain = 'rls-probe.example' order by nm.id desc limit 1;
  if j->>'domain' is distinct from 'rls-probe.example'
     or r is distinct from '這是一個回滾測試用的提名理由' then
    raise exception 'ROLLBACK_BAD reason=% json=%', r, j;
  end if;
  raise exception 'ROLLBACK_OK';
end;
$$`,
);

// The domain path the deployed client uses is unchanged after v6n: a messy
// URL normalises to the bare domain, a pending company is created and the
// email is stored trimmed and lower-cased.
rollbackTest(
  "rollback test: 4-arg domain path unchanged; stores lower/trimmed email (v6e/v6n)",
  `do $$
declare j json; st text; stored_email text;
begin
  execute 'set local role anon';
  j := public.nominate_company('HTTPS://www.RLS-Probe.example/about', 'rls-probe', '這是四參數版本寫入信箱的驗證理由', '  RLS-Probe@Example.COM ');
  execute 'reset role';
  select c.status into st from public.companies c where c.domain = 'rls-probe.example';
  select nm.email into stored_email from public.nominations nm
    where nm.domain = 'rls-probe.example' order by nm.id desc limit 1;
  if j->>'domain' is distinct from 'rls-probe.example' or st is distinct from 'pending'
     or stored_email is distinct from 'rls-probe@example.com' then
    raise exception 'ROLLBACK_BAD email=% status=% json=%', stored_email, st, j;
  end if;
  raise exception 'ROLLBACK_OK';
end;
$$`,
);

// v6n (a): a blank website creates a pending name: company and a nomination.
rollbackTest(
  "rollback test: blank website creates a name: company + nomination (v6n)",
  `do $$
declare j json; st text; dn text; n int;
begin
  execute 'set local role anon';
  j := public.nominate_company('   ', '  RLS   Probe Co ', '這是只有名稱沒有官網的回滾測試理由', 'rls-probe@example.com');
  execute 'reset role';
  select c.status, c.display_name into st, dn from public.companies c where c.domain = 'name:rls probe co';
  select count(*) into n from public.nominations nm where nm.domain = 'name:rls probe co';
  if j->>'domain' is distinct from 'name:rls probe co' or st is distinct from 'pending'
     or dn is distinct from 'RLS Probe Co' or n <> 1 then
    raise exception 'ROLLBACK_BAD status=% name=% n=% json=%', st, dn, n, j;
  end if;
  if not exists (select 1 from public.resolve_company('rls probe') r where r.domain = 'name:rls probe co') then
    raise exception 'ROLLBACK_BAD resolve_company misses the name: company';
  end if;
  raise exception 'ROLLBACK_OK';
end;
$$`,
);

// v6n (b): the same name twice (other case / spacing, null website) reuses it.
rollbackTest(
  "rollback test: same name twice reuses the name: company (v6n)",
  `do $$
declare j1 json; j2 json; nc int; nn int;
begin
  execute 'set local role anon';
  j1 := public.nominate_company(null, 'RLS Probe Co', '第一次只用名稱提名的回滾測試理由', 'rls-probe@example.com');
  j2 := public.nominate_company('', 'rls  probe CO', '第二次同名但大小寫不同的測試理由', 'rls-probe-2@example.com');
  execute 'reset role';
  select count(*) into nc from public.companies c where c.domain = 'name:rls probe co';
  select count(*) into nn from public.nominations nm where nm.domain = 'name:rls probe co';
  if j1->>'domain' is distinct from 'name:rls probe co' or j2->>'domain' is distinct from 'name:rls probe co'
     or j2->>'display_name' is distinct from 'RLS Probe Co' or nc <> 1 or nn <> 2 then
    raise exception 'ROLLBACK_BAD companies=% nominations=% j1=% j2=%', nc, nn, j1, j2;
  end if;
  raise exception 'ROLLBACK_OK';
end;
$$`,
);

// v6n (c): with the phase forced to vote inside the transaction, a name:
// company is a candidate: vote_candidates lists it, cast_ballot accepts it,
// company_detail resolves the key.
rollbackTest(
  "rollback test: cast_ballot accepts a name: candidate in phase vote (v6n)",
  `do $$
declare b json; d json; ph text;
begin
  execute 'set local role anon';
  perform public.nominate_company('', 'RLS Probe Co', '先用名稱提名再投票的回滾測試理由', 'rls-probe@example.com');
  execute 'reset role';
  update public.settings set phase_mode = 'manual', phase = 'vote' where id = 1;
  ph := public.effective_phase();
  execute 'set local role anon';
  if not exists (select 1 from public.vote_candidates('rls probe') v where v.domain = 'name:rls probe co') then
    raise exception 'ROLLBACK_BAD vote_candidates misses the name: company (phase=%)', ph;
  end if;
  b := public.cast_ballot('rls-probe@example.com', '[{"domain":"name:rls probe co","reason":"只有名稱的候選公司也可以被投票"}]'::jsonb);
  d := public.company_detail('name:rls probe co');
  execute 'reset role';
  if ph is distinct from 'vote' or b->'picks'->0->>'domain' is distinct from 'name:rls probe co'
     or d->>'domain' is distinct from 'name:rls probe co' or (d->>'votes')::int <> 1 then
    raise exception 'ROLLBACK_BAD phase=% ballot=% detail=%', ph, b, d;
  end if;
  raise exception 'ROLLBACK_OK';
end;
$$`,
);

await allowed("anon can call board()", sb.rpc("board"));
await denied(
  "anon cannot read companies",
  sb.from("companies").select("*").limit(1),
);
await denied(
  "anon cannot read nominations",
  sb.from("nominations").select("*").limit(1),
);
await denied(
  "anon cannot read board_snapshots",
  sb.from("board_snapshots").select("*").limit(1),
);
await mustErrorLater("anon cannot insert companies", () =>
  sb
    .from("companies")
    .insert({ domain: "rls-probe.example", display_name: "rls-probe" }),
);
await mustErrorLater("anon cannot call take_board_snapshot()", () =>
  sb.rpc("take_board_snapshot"),
);
await mustErrorLater("admin_company_stats() rejects anon", () =>
  sb.rpc("admin_company_stats"),
);
await mustErrorLater("admin_nominations() rejects anon", () =>
  sb.rpc("admin_nominations"),
);
await mustErrorLater("admin_merge_company() rejects anon", () =>
  sb.rpc("admin_merge_company", { p_from: "a.example", p_into: "b.example" }),
);
{
  // board() must never publish raw counts: total_companies is the only
  // integer; hot[].share is a 0–1 fraction (1 for the top company is fine).
  const { data, error } = await sb.rpc("board");
  const offenders = [];
  const walk = (v, path) => {
    if (typeof v === "number") {
      const key = path[path.length - 1];
      if (key === "total_companies" && path.length === 1) return;
      if (key === "share" && v >= 0 && v <= 1) return;
      offenders.push(`${path.join(".")}=${v}`);
    } else if (Array.isArray(v))
      v.forEach((x, i) => walk(x, [...path, String(i)]));
    else if (v && typeof v === "object")
      for (const [k, x] of Object.entries(v)) walk(x, [...path, k]);
  };
  walk(data, []);
  const keys = data ? Object.keys(data).sort().join(",") : "";
  record(
    "board() has no counts other than total_companies",
    !error && Number.isInteger(data?.total_companies) && offenders.length === 0,
    error
      ? error.message
      : `keys: ${keys}${offenders.length ? `; offenders: ${offenders.join(", ")}` : ""}`,
  );
}

await mustError(
  "cast_vote() rejects without a session",
  sb.rpc("cast_vote", {
    p_post: "00000000-0000-0000-0000-000000000000",
    p_dir: 1,
    p_email: "rls-probe@example.com",
  }),
);
await mustError(
  "report_post() rejects without a session",
  sb.rpc("report_post", {
    p_post: "00000000-0000-0000-0000-000000000000",
    p_email: "rls-probe@example.com",
  }),
);
await mustError(
  "cast_final_vote() rejects without a session",
  sb.rpc("cast_final_vote", {
    p_finalist: "00000000-0000-0000-0000-000000000000",
    p_email: "rls-probe@example.com",
  }),
);
await mustError("admin_people() rejects anon", sb.rpc("admin_people"));
await mustError(
  "admin_build_finalists() rejects anon",
  sb.rpc("admin_build_finalists"),
);

// ---------------------------------------------------------------- v7 Phase 2
await allowed("anon can call vote_board()", sb.rpc("vote_board"));
await allowed(
  "anon can call company_detail()",
  sb.rpc("company_detail", { p_domain: "rls-probe.example" }),
);
await allowed("anon can call reason_corpus()", sb.rpc("reason_corpus"));
await allowed(
  "anon can call vote_candidates()",
  sb.rpc("vote_candidates", { q: "" }),
);
await allowed(
  "anon can call my_vote_state()",
  sb.rpc("my_vote_state", { p_email: "rls-probe@example.com" }),
);
for (const t of [
  "ballots",
  "ballot_picks",
  "reason_reactions",
  "testers",
  "leaderboard_snapshots",
]) {
  await denied(`anon cannot read ${t}`, sb.from(t).select("*").limit(1));
}
await mustErrorLater("anon cannot insert ballots", () =>
  sb.from("ballots").insert({
    email_key: "rls-probe@example.com",
    email: "rls-probe@example.com",
    ballot_date: "2026-09-28",
  }),
);
{
  // Only meaningful while the live phase is not 'vote' (stage 1 runs in nominate).
  const { data: phase } = await sb.rpc("effective_phase");
  if (phase === "vote") {
    record("cast_ballot/react_reason phase gate", true, "skipped: live phase is vote");
  } else {
    const cast = await sb.rpc("cast_ballot", {
      p_email: "rls-probe@example.com",
      p_picks: [{ domain: "rls-probe.example", reason: "rls probe reason text" }],
    });
    record(
      `cast_ballot() rejects a non-tester in phase ${phase}`,
      !!cast.error && /投票尚未開放|投票已截止/.test(cast.error.message),
      cast.error ? cast.error.message : "unexpectedly succeeded",
    );
    const react = await sb.rpc("react_reason", {
      p_pick_id: 1,
      p_email: "rls-probe@example.com",
      p_value: 1,
    });
    record(
      `react_reason() rejects a non-tester in phase ${phase}`,
      !!react.error && /投票尚未開放|投票已截止/.test(react.error.message),
      react.error ? react.error.message : "unexpectedly succeeded",
    );
  }
}
for (const [fn, args] of [
  ["admin_ballots", { p_limit: 1, p_offset: 0 }],
  ["admin_set_ballot_void", { p_id: 1, p_voided: true }],
  ["admin_set_reason_hidden", { p_pick_id: 1, p_hidden: true }],
  ["admin_set_vote_adjust", { p_domain: "rls-probe.example", p_adjust: 1 }],
  ["admin_testers_set", { p_email: "rls-probe@example.com", p_on: true }],
  ["admin_vote_stats", undefined],
  ["company_votes", undefined],
  ["take_leaderboard_snapshot", undefined],
]) {
  await mustErrorLater(`${fn}() rejects anon`, () => sb.rpc(fn, args));
}
{
  // vote_board() must never carry an email address.
  const { data } = await sb.rpc("vote_board");
  const text = JSON.stringify(data ?? {});
  record(
    "vote_board() exposes no email",
    !/@/.test(text) && !/email/i.test(text),
    `keys: ${data ? Object.keys(data).sort().join(",") : ""}`,
  );
}

// ------------------------------------------------ v6f Phase 1 without a form
// Campaign memo v4.0 is back: no reason, no email. The 4-arg overload the
// CURRENTLY DEPLOYED client calls must keep validating whatever it sends, and
// must now also accept null/blank for both; a 5-arg overload adds the
// per-browser client_id that keeps the ranking about people.
{
  // Null reason and email get past the reason/email checks — the call now
  // fails on the website instead, which proves both checks were skipped.
  const { error } = await sb.rpc("nominate_company", {
    p_domain: "not a domain!",
    p_display_name: "rls-probe",
    p_reason: null,
    p_email: null,
  });
  record(
    "v6f: 4-arg nominate_company() accepts null reason and email",
    !!error && error.message.includes("請輸入正確的官方網站"),
    error ? error.message : "unexpectedly succeeded",
  );
}
{
  const { error } = await sb.rpc("nominate_company", {
    p_domain: "not a domain!",
    p_display_name: "rls-probe",
    p_reason: "",
    p_email: "   ",
    p_client_id: "rls-probe-cid",
  });
  record(
    "v6f: anon can call 5-arg nominate_company(); blank reason/email allowed",
    !!error && error.message.includes("請輸入正確的官方網站"),
    error ? error.message : "unexpectedly succeeded",
  );
}

// As role anon: blank/null reason and email store null, while the exact call
// the deployed client makes (real reason, real email) still validates and
// still stores the trimmed, lower-cased values. Then everything rolls back.
rollbackTest(
  "rollback test: v6f 4-arg stores null reason/email; deployed client unchanged",
  `do $$
declare n int; nulls int; r text; e text;
begin
  execute 'set local role anon';
  perform public.nominate_company('rls-probe.example', 'rls-probe', null, null);
  perform public.nominate_company('rls-probe.example', 'rls-probe', '   ', '  ');
  begin
    perform public.nominate_company('rls-probe.example', 'rls-probe', '123456789', 'ok@example.com');
    raise exception 'SHORT_REASON_ACCEPTED';
  exception when others then
    if sqlerrm not like '%10 到 50 字%' then raise; end if;
  end;
  begin
    perform public.nominate_company('rls-probe.example', 'rls-probe', '這是部署中的前端會送出的提名理由', 'not-an-email');
    raise exception 'BAD_EMAIL_ACCEPTED';
  exception when others then
    if sqlerrm not like '%正確的 Email%' then raise; end if;
  end;
  perform public.nominate_company('rls-probe.example', 'rls-probe', '  這是部署中的前端會送出的提名理由  ', '  Deployed@Example.COM ');
  execute 'reset role';
  select count(*) into n from public.nominations nm where nm.domain = 'rls-probe.example';
  select count(*) into nulls from public.nominations nm
    where nm.domain = 'rls-probe.example' and nm.reason is null and nm.email is null;
  select nm.reason, nm.email into r, e from public.nominations nm
    where nm.domain = 'rls-probe.example' order by nm.id desc limit 1;
  if n <> 3 or nulls <> 2
     or r is distinct from '這是部署中的前端會送出的提名理由'
     or e is distinct from 'deployed@example.com' then
    raise exception 'ROLLBACK_BAD n=% nulls=% reason=% email=%', n, nulls, r, e;
  end if;
  raise exception 'ROLLBACK_OK';
end;
$$`,
);

// The ranking after v6f: one browser nominating the same company three times
// is one voter, a second browser is a second, and a row with neither email
// nor client_id still counts as exactly one.
rollbackTest(
  "rollback test: v6f 5-arg stores client_id alongside the raw count",
  `do $$
declare v_voters int; v_noms int; v_cid text; v_cids int;
begin
  execute 'set local role anon';
  perform public.nominate_company('rls-probe.example', 'rls-probe', null, null, 'cid-aaa');
  perform public.nominate_company('rls-probe.example', 'rls-probe', null, null, 'cid-aaa');
  perform public.nominate_company('rls-probe.example', 'rls-probe', null, null, '  cid-aaa  ');
  perform public.nominate_company('rls-probe.example', 'rls-probe', null, null, 'cid-bbb');
  perform public.nominate_company('rls-probe.example', 'rls-probe', null, null);
  execute 'reset role';
  select count(*) into v_cids from public.nominations nm
    where nm.domain = 'rls-probe.example' and nm.client_id = 'cid-aaa';
  select nm.client_id into v_cid from public.nominations nm
    where nm.domain = 'rls-probe.example' order by nm.id desc limit 1;
  select r.voters, r.noms into v_voters, v_noms
    from public.nomination_rank() r where r.domain = 'rls-probe.example';
  -- v6g: the owner ranks by raw nomination count, so voters is informational
  -- only and five rows from one browser count as five nominations.
  if v_cids <> 3 or v_cid is not null or v_voters <> 3 or v_noms <> 5 then
    raise exception 'ROLLBACK_BAD cids=% last_cid=% voters=% noms=%', v_cids, v_cid, v_voters, v_noms;
  end if;
  raise exception 'ROLLBACK_OK';
end;
$$`,
);

// ------------------------------------------------ v6s Phase 2 shortlist
// The shortlist table has no grant and no policy, and nomination_rank() /
// shortlist_domains() are internal helpers with no grant at all, so anon
// must be refused outright rather than merely filtered.
await denied(
  "anon cannot read shortlist",
  sb.from("shortlist").select("*").limit(1),
);
await mustErrorLater("anon cannot insert shortlist", () =>
  sb.from("shortlist").insert({ domain: "rls-probe.example", rank: 1 }),
);
await mustErrorLater("anon cannot delete shortlist", () =>
  sb.from("shortlist").delete().eq("domain", "rls-probe.example"),
);
for (const [fn, args] of [
  ["nomination_rank", undefined],
  ["shortlist_domains", undefined],
  ["admin_shortlist", undefined],
  ["admin_lock_shortlist", { p_limit: 10 }],
  ["admin_set_shortlist", { p_domains: ["rls-probe.example"] }],
]) {
  await mustErrorLater(`${fn}() rejects anon`, () => sb.rpc(fn, args));
}
// The whole v6s story — distinct-email ranking, tie-break, lock = exactly 10,
// a ballot outside the shortlist refused in Chinese, and the live top-10
// fallback — runs as one aborted transaction.
rollbackTest(
  "rollback test: v6s shortlist ranking, lock, override and ballot gate",
  readFileSync("supabase/tests/v6s-shortlist.sql", "utf8").replace(
    /^[\s\S]*?(?=^do )/m,
    "",
  ),
);

// ---------------------------------------------- v7c shortlist made advisory
// shortlist_is_enforced() and ensure_vote_company() are internal helpers
// (called only from cast_ballot()/vote_candidates()/admin_shortlist()) with
// no grant at all, so anon must be refused outright. admin_set_shortlist_enforced()
// joins the existing admin_*-rejects-anon list.
for (const [fn, args] of [
  ["shortlist_is_enforced", undefined],
  [
    "ensure_vote_company",
    {
      p_domain: "rls-probe.example",
      p_name: "rls-probe",
      p_email: "rls-probe@example.com",
      p_client_id: "rls-probe-cid",
    },
  ],
  ["admin_set_shortlist_enforced", { p_enabled: true }],
]) {
  await mustErrorLater(`${fn}() rejects anon`, () => sb.rpc(fn, args));
}

// Nothing must have been written by the probes above.
const { count } = await sb
  .from("posts_public")
  .select("id", { count: "exact", head: true })
  .eq("company", "rls-probe");
record(
  "nothing was written by the probes",
  (count ?? 0) === 0,
  `${count ?? 0} probe row(s)`,
);

// v6 probes must not have created a company either (resolve_domain is read-only).
{
  const { data } = await sb.rpc("resolve_domain", { url: "rls-probe.example" });
  record(
    "no probe company exists",
    data?.exists === false,
    JSON.stringify(data),
  );
}

// …nor a name: company (v6n rollback tests).
{
  const { data, error } = await sb.rpc("resolve_company", { q: "rls probe co" });
  const hits = (data ?? []).filter?.((r) => r.domain === "name:rls probe co") ?? [];
  record(
    "no probe name: company exists",
    !error && hits.length === 0,
    error ? error.message : `${hits.length} hit(s)`,
  );
}

const failed = results.filter((r) => !r.pass);
console.log(
  `\n${results.length - failed.length}/${results.length} checks passed`,
);
process.exit(failed.length === 0 ? 0 : 1);
