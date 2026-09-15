"use client";

import { useCallback, useEffect, useState } from "react";
import { downloadCsv, normalizeDomain, stampToday, toCsv } from "@/lib/format";
import { errText, getBrowserClient } from "@/lib/supabase-browser";
import type { AdminCompany } from "@/lib/types";

const STATUSES: AdminCompany["status"][] = ["active", "pending", "hidden"];

/** Minimal RFC-4180 CSV reader (quotes, doubled quotes, CRLF). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("zh-TW", { hour12: false }) : "";

/**
 * 公司與提名 (spec v6 §6): companies with raw nomination counts, inline edit,
 * merge, seed CSV import (domain,display_name,aliases separated by |), export.
 */
export default function AdminCompanies({
  onError,
}: {
  onError: (m: string) => void;
}) {
  const supabase = getBrowserClient();
  const [rows, setRows] = useState<AdminCompany[]>([]);
  const [from, setFrom] = useState("");
  const [into, setInto] = useState("");
  const [csv, setCsv] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("admin_company_stats");
    if (error) onError(errText(error));
    else setRows((data as AdminCompany[] | null) ?? []);
  }, [supabase, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(r: AdminCompany) {
    const { error } = await supabase
      .from("companies")
      .update({
        display_name: r.display_name.trim(),
        aliases: r.aliases,
        status: r.status,
      })
      .eq("domain", r.domain);
    if (error) onError(errText(error));
    else {
      setMsg(`已儲存 ${r.domain}`);
      void load();
    }
  }

  async function merge() {
    if (!from || !into) return;
    if (!window.confirm(`把 ${from} 合併到 ${into}？提名會一起搬過去。`))
      return;
    const { error } = await supabase.rpc("admin_merge_company", {
      p_from: from,
      p_into: into,
    });
    if (error) onError(errText(error));
    else {
      setMsg(`已合併 ${from} → ${into}`);
      setFrom("");
      setInto("");
      void load();
    }
  }

  async function importCsv() {
    const parsed = parseCsv(csv);
    if (parsed.length > 0 && /domain/i.test(parsed[0][0] ?? "")) parsed.shift();
    const seen = new Set<string>();
    const payload: Pick<
      AdminCompany,
      "domain" | "display_name" | "aliases" | "status" | "is_seed"
    >[] = [];
    const bad: string[] = [];
    for (const [d = "", name = "", aliases = ""] of parsed) {
      const domain = normalizeDomain(d);
      if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain) || !name.trim()) {
        bad.push(d || "(空白)");
        continue;
      }
      if (seen.has(domain)) continue;
      seen.add(domain);
      payload.push({
        domain,
        display_name: name.trim(),
        aliases: aliases
          .split("|")
          .map((a) => a.trim())
          .filter(Boolean),
        status: "active",
        is_seed: true,
      });
    }
    if (payload.length === 0) {
      onError(
        `沒有可匯入的列。${bad.length ? `格式錯誤：${bad.join("、")}` : ""}`,
      );
      return;
    }
    const { error } = await supabase
      .from("companies")
      .upsert(payload, { onConflict: "domain" });
    if (error) onError(errText(error));
    else {
      setMsg(
        `已匯入 ${payload.length} 家${bad.length ? `；略過 ${bad.join("、")}` : ""}`,
      );
      setCsv("");
      void load();
    }
  }

  function exportCsv() {
    downloadCsv(
      `companies-${stampToday()}.csv`,
      toCsv([
        [
          "domain",
          "display_name",
          "aliases",
          "status",
          "is_seed",
          "nominations",
          "first_nominated_at",
          "last_nominated_at",
          "merged_into",
        ],
        ...rows.map((r) => [
          r.domain,
          r.display_name,
          r.aliases.join("|"),
          r.status,
          r.is_seed ? "true" : "false",
          r.nominations,
          r.first_nominated_at,
          r.last_nominated_at,
          r.merged_into,
        ]),
      ]),
    );
  }

  const patch = (domain: string, p: Partial<AdminCompany>) =>
    setRows((rs) => rs.map((r) => (r.domain === domain ? { ...r, ...p } : r)));

  return (
    <section>
      <h2>公司與提名（{rows.length}）</h2>
      <div className="arow">
        <button className="abtn" type="button" onClick={() => void load()}>
          重新整理
        </button>
        <button className="abtn" type="button" onClick={exportCsv}>
          匯出 CSV
        </button>
        {msg ? <span className="note">{msg}</span> : null}
      </div>

      <div className="tablewrap">
        <table className="at">
          <thead>
            <tr>
              <th>名稱</th>
              <th>別名（逗號分隔）</th>
              <th>網域</th>
              <th>狀態</th>
              <th>種子</th>
              <th>提名數</th>
              <th>首次 / 最近提名</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.domain}>
                <td>
                  <input
                    type="text"
                    value={r.display_name}
                    onChange={(e) =>
                      patch(r.domain, { display_name: e.target.value })
                    }
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={r.aliases.join(", ")}
                    onChange={(e) =>
                      patch(r.domain, {
                        aliases: e.target.value
                          .split(/[,，]/)
                          .map((a) => a.trim())
                          .filter(
                            (a, i, all) => a !== "" || i === all.length - 1,
                          ),
                      })
                    }
                  />
                </td>
                <td>
                  {r.domain}
                  {r.merged_into ? (
                    <div className="note">→ {r.merged_into}</div>
                  ) : null}
                </td>
                <td>
                  <select
                    value={r.status}
                    onChange={(e) =>
                      patch(r.domain, {
                        status: e.target.value as AdminCompany["status"],
                      })
                    }
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{r.is_seed ? "是" : ""}</td>
                <td className="num">{r.nominations}</td>
                <td>
                  {fmt(r.first_nominated_at)}
                  <br />
                  {fmt(r.last_nominated_at)}
                </td>
                <td>
                  <button
                    className="abtn"
                    type="button"
                    onClick={() =>
                      void save({ ...r, aliases: r.aliases.filter(Boolean) })
                    }
                  >
                    儲存
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="arow">
        <label className="afield">
          <span>合併：來源</span>
          <select value={from} onChange={(e) => setFrom(e.target.value)}>
            <option value="">選擇一個</option>
            {rows.map((r) => (
              <option key={r.domain} value={r.domain}>
                {r.display_name}（{r.domain}）
              </option>
            ))}
          </select>
        </label>
        <label className="afield">
          <span>併入</span>
          <select value={into} onChange={(e) => setInto(e.target.value)}>
            <option value="">選擇一個</option>
            {rows
              .filter((r) => r.domain !== from && !r.merged_into)
              .map((r) => (
                <option key={r.domain} value={r.domain}>
                  {r.display_name}（{r.domain}）
                </option>
              ))}
          </select>
        </label>
        <button
          className="abtn"
          type="button"
          disabled={!from || !into}
          onClick={() => void merge()}
        >
          合併
        </button>
      </div>

      <div className="arow">
        <label className="afield" style={{ flex: 1 }}>
          <span>匯入種子公司 CSV（domain,display_name,aliases 以 | 分隔）</span>
          <textarea
            rows={4}
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            placeholder={
              "domain,display_name,aliases\nexample.com,Example,範例|Example Inc."
            }
          />
        </label>
        <label className="afield">
          <span>或選擇檔案</span>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void f.text().then(setCsv);
            }}
          />
        </label>
        <button
          className="abtn"
          type="button"
          disabled={!csv.trim()}
          onClick={() => void importCsv()}
        >
          匯入
        </button>
      </div>
      <p className="note">
        種子公司可以被搜尋到，但在被提名至少一次之前不會出現在公開名單。hidden
        的公司不出現在公開名單與搜尋。
      </p>
    </section>
  );
}
