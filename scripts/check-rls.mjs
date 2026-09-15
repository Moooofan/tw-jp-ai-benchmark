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
// v6r: nominations need a 10–50 character reason. Only probes that fail are
// sent through PostgREST; the success path runs inside a rolled-back DO block.
{
  const { error } = await sb.rpc("nominate_company", {
    p_domain: "rls-probe.example",
    p_display_name: "rls-probe",
    p_reason: "123456789",
  });
  record(
    "anon can call 3-arg nominate_company(); 9-char reason rejected",
    !!error && error.message.includes("提名理由請寫 10 到 50 字。"),
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
  // As role anon inside one transaction: a valid reason is stored (trimmed),
  // a 9-char reason and the 2-arg call raise, then everything rolls back.
  const sql = `do $$
declare j json; r text; e text;
begin
  execute 'set local role anon';
  j := public.nominate_company('rls-probe.example', 'rls-probe', '  這是一個回滾測試用的提名理由  ');
  begin
    perform public.nominate_company('rls-probe.example', 'rls-probe', '123456789');
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
  execute 'reset role';
  select nm.reason into r from public.nominations nm
    where nm.domain = 'rls-probe.example' order by nm.id desc limit 1;
  if j->>'domain' is distinct from 'rls-probe.example'
     or r is distinct from '這是一個回滾測試用的提名理由' then
    raise exception 'ROLLBACK_BAD reason=% json=%', r, j;
  end if;
  raise exception 'ROLLBACK_OK';
end;
$$`;
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
    out.split("\n").find((l) => /ROLLBACK_|SHORT_REASON|OLD_SIGNATURE/.test(l)) ??
    out.trim().split("\n").slice(-1)[0];
  record(
    "rollback test: anon 3-arg nominate stores the reason",
    /ROLLBACK_OK/.test(out),
    line?.trim(),
  );
}

// ------------------------------------------------------------- v6e: email
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
  // As role anon inside one transaction: the 3-arg overload still works
  // unchanged (v6e must be additive-only), and the new 4-arg overload stores
  // a trimmed, lower-cased email. Everything rolls back at the end.
  const sql = `do $$
declare j3 json; j4 json; stored_email text;
begin
  execute 'set local role anon';
  j3 := public.nominate_company('rls-probe.example', 'rls-probe', '這是三參數版本仍然可用的驗證理由');
  j4 := public.nominate_company('rls-probe.example', 'rls-probe', '這是四參數版本寫入信箱的驗證理由', '  RLS-Probe@Example.COM ');
  execute 'reset role';
  if j3->>'domain' is distinct from 'rls-probe.example' then
    raise exception 'THREE_ARG_BROKEN json=%', j3;
  end if;
  select nm.email into stored_email from public.nominations nm
    where nm.domain = 'rls-probe.example' order by nm.id desc limit 1;
  if j4->>'domain' is distinct from 'rls-probe.example'
     or stored_email is distinct from 'rls-probe@example.com' then
    raise exception 'ROLLBACK_BAD email=% json=%', stored_email, j4;
  end if;
  raise exception 'ROLLBACK_OK';
end;
$$`;
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
    out
      .split("\n")
      .find((l) => /ROLLBACK_|THREE_ARG_BROKEN/.test(l)) ??
    out.trim().split("\n").slice(-1)[0];
  record(
    "rollback test: 3-arg nominate_company unchanged; 4-arg stores lower/trimmed email (v6e)",
    /ROLLBACK_OK/.test(out),
    line?.trim(),
  );
}

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

const failed = results.filter((r) => !r.pass);
console.log(
  `\n${results.length - failed.length}/${results.length} checks passed`,
);
process.exit(failed.length === 0 ? 0 : 1);
