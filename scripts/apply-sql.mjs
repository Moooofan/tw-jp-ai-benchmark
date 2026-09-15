#!/usr/bin/env node
/**
 * Applies one marked block of supabase/schema.sql to the live database,
 * ONE statement per `supabase db query --db-url` call (that path rejects
 * multi-statement input; `--linked` currently answers 401).
 *
 *   node scripts/apply-sql.mjs v6            # runs "BEGIN v6" .. "END v6"
 *   node scripts/apply-sql.mjs --sql "select 1"
 *
 * Password: ../.secrets/supabase-db-password.txt. It is passed to the child
 * process only and scrubbed from every line of output.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const PW = readFileSync(
  new URL("../../.secrets/supabase-db-password.txt", import.meta.url),
  "utf8",
).trim();
const DB_URL = `postgresql://postgres.pjqejaxfxjtcujfamyem:${encodeURIComponent(PW)}@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`;
const scrub = (s) =>
  String(s).split(PW).join("***").split(encodeURIComponent(PW)).join("***");

/** Split on `;` at end of statement, ignoring `;` inside $$ bodies, quotes and -- comments. */
export function splitSql(sql) {
  const out = [];
  let cur = "";
  let inDollar = false;
  let inQuote = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (!inQuote && !inDollar && ch === "-" && sql[i + 1] === "-") {
      const nl = sql.indexOf("\n", i);
      i = nl === -1 ? sql.length : nl;
      cur += "\n";
      continue;
    }
    if (!inQuote && sql.startsWith("$$", i)) {
      inDollar = !inDollar;
      cur += "$$";
      i++;
      continue;
    }
    if (!inDollar && ch === "'") inQuote = !inQuote;
    if (!inDollar && !inQuote && ch === ";") {
      if (cur.trim()) out.push(cur.trim() + ";");
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function run(stmt) {
  try {
    const res = execFileSync(
      "supabase",
      ["db", "query", "--db-url", DB_URL, stmt],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    return { ok: true, out: scrub(res) };
  } catch (e) {
    return {
      ok: false,
      out: scrub((e.stdout || "") + (e.stderr || "") || e.message),
    };
  }
}

const args = process.argv.slice(2);
if (args[0] === "--sql") {
  const r = run(args[1]);
  console.log(r.out);
  process.exit(r.ok ? 0 : 1);
}

const tag = args[0];
if (!tag) {
  console.error("usage: node scripts/apply-sql.mjs <tag> | --sql <statement>");
  process.exit(2);
}
const file = readFileSync(
  new URL("../supabase/schema.sql", import.meta.url),
  "utf8",
);
const start = file.indexOf(`BEGIN ${tag}`);
const end = file.indexOf(`-- END ${tag}`);
if (start < 0 || end < 0) {
  console.error(`markers BEGIN ${tag} / END ${tag} not found`);
  process.exit(2);
}
const block = file.slice(file.indexOf("\n", start) + 1, end);
const stmts = splitSql(block);
console.log(`${stmts.length} statements`);
let n = 0;
for (const s of stmts) {
  n++;
  const head = s.replace(/\s+/g, " ").slice(0, 90);
  const r = run(s);
  if (!r.ok) {
    console.log(`FAIL [${n}] ${head}\n${r.out}`);
    process.exit(1);
  }
  console.log(`ok   [${n}] ${head}`);
}
console.log("all statements applied");
