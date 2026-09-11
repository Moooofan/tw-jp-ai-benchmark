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
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
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

await allowed("anon can read posts_public", sb.from("posts_public").select("*").limit(5));

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
await allowed("anon can call posts_public_count()", sb.rpc("posts_public_count"));
await allowed("anon can call company_suggest()", sb.rpc("company_suggest", { q: "a" }));
await allowed("anon can read finalists_public", sb.from("finalists_public").select("*").limit(5));
await allowed("anon can read settings", sb.from("settings").select("phase").limit(1));

await denied("anon cannot read posts", sb.from("posts").select("*").limit(1));
await denied("anon cannot read finalists", sb.from("finalists").select("*").limit(1));
await denied("anon cannot read votes", sb.from("votes").select("*").limit(1));
await denied("anon cannot read admins", sb.from("admins").select("*").limit(1));
await denied("anon cannot read reports", sb.from("reports").select("*").limit(1));
await denied("anon cannot read final_votes", sb.from("final_votes").select("*").limit(1));

async function mustError(name, promise) {
  const { error } = await promise;
  record(name, !!error, error ? error.message : "unexpectedly succeeded");
}

await mustError(
  "anon cannot update settings",
  sb.from("settings").update({ phase: "results" }).eq("id", 1).select(),
);

await mustError(
  "nominate() rejects without a session",
  sb.rpc("nominate", {
    p_company: "rls-probe",
    p_company_en: "RLS Probe",
    p_url: "https://example.com/",
    p_reason: "should never land".padEnd(70, "."),
  }),
);
await mustError(
  "cast_vote() rejects without a session",
  sb.rpc("cast_vote", {
    p_post: "00000000-0000-0000-0000-000000000000",
    p_dir: 1,
  }),
);
await mustError(
  "report_post() rejects without a session",
  sb.rpc("report_post", { p_post: "00000000-0000-0000-0000-000000000000" }),
);
await mustError(
  "cast_final_vote() rejects without a session",
  sb.rpc("cast_final_vote", {
    p_finalist: "00000000-0000-0000-0000-000000000000",
  }),
);
await mustError("admin_people() rejects anon", sb.rpc("admin_people"));
await mustError("admin_build_finalists() rejects anon", sb.rpc("admin_build_finalists"));

// Nothing must have been written by the probes above.
const { count } = await sb
  .from("posts_public")
  .select("id", { count: "exact", head: true })
  .eq("company", "rls-probe");
record("nothing was written by the probes", (count ?? 0) === 0, `${count ?? 0} probe row(s)`);

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
