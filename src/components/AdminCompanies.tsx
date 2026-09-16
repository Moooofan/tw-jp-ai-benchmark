"use client";

import { useCallback, useEffect, useState } from "react";
import {
  downloadCsv,
  isNameKey,
  normalizeDomain,
  stampToday,
  toCsv,
} from "@/lib/format";
import { errText, getBrowserClient } from "@/lib/supabase-browser";
import type {
  AdminCompany,
  AdminNomination,
  AdminShortlistRow,
} from "@/lib/types";

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
 * A short, stable label for nominations.client_id (v6f): same browser -> same
 * label, so the owner can see one device nominating a dozen companies. FNV-1a
 * over the id; the raw id never reaches the table.
 */
function deviceTag(cid: string | null): string {
  if (!cid) return "";
  let h = 0x811c9dc5;
  for (let i = 0; i < cid.length; i++) {
    h ^= cid.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0").slice(0, 6);
}

/**
 * 公司與提名 (spec v6 §6): companies with raw nomination counts, inline edit,
 * merge, seed CSV import (domain,display_name,aliases separated by |), export.
 * `name:` companies (nominated without a website, v6n) carry a 待確認官網
 * badge and can be filtered; attach them to a real domain with 合併.
 *
 * v6s adds 第二階段名單: the ranking that decides who reaches Phase 2 voting.
 * Companies are ranked by DISTINCT nominators — the email if the row has one
 * (older rows do), otherwise the browser id (v6f), otherwise the row itself —
 * so five nominations from one person still count once; ties break on the
 * earliest nomination. The 裝置 column shows that browser id as a short hash,
 * which is how one device nominating many companies becomes visible. Until
 * the owner locks a list the ranking is live — the top 10 of the moment is
 * what /vote will accept.
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
  const [noms, setNoms] = useState<AdminNomination[]>([]);
  const [nomFilter, setNomFilter] = useState("");
  const [onlyNameKeys, setOnlyNameKeys] = useState(false);
  const [short, setShort] = useState<AdminShortlistRow[]>([]);
  const [addDomain, setAddDomain] = useState("");

  const load = useCallback(async () => {
    const [stats, list, sl] = await Promise.all([
      supabase.rpc("admin_company_stats"),
      supabase.rpc("admin_nominations"),
      supabase.rpc("admin_shortlist"),
    ]);
    if (stats.error) onError(errText(stats.error));
    else setRows((stats.data as AdminCompany[] | null) ?? []);
    if (list.error) onError(errText(list.error));
    else setNoms((list.data as AdminNomination[] | null) ?? []);
    if (sl.error) onError(errText(sl.error));
    else setShort((sl.data as AdminShortlistRow[] | null) ?? []);
  }, [supabase, onError]);

  const nameKeyCount = rows.filter((r) => isNameKey(r.domain)).length;
  const shownRows = onlyNameKeys
    ? rows.filter((r) => isNameKey(r.domain))
    : rows;

  const shownNoms = nomFilter
    ? noms.filter((n) => n.domain === nomFilter)
    : noms;

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

  /** The list as it stands: the locked rows, or the live top 10. */
  const inList = short
    .filter((r) => r.in_shortlist)
    .sort((a, b) => (a.shortlist_rank ?? a.rank ?? 0) - (b.shortlist_rank ?? b.rank ?? 0));
  const locked = short.some((r) => r.locked);
  const lockedAt = short.find((r) => r.locked_at)?.locked_at ?? null;

  async function lockTop10() {
    if (
      !window.confirm(
        "鎖定目前提名數前 10 名為第二階段名單？\n鎖定後只有名單內的公司可以被投票，之後仍可再鎖定一次或手動調整。",
      )
    )
      return;
    const { error } = await supabase.rpc("admin_lock_shortlist", {
      p_limit: 10,
    });
    if (error) onError(errText(error));
    else {
      setMsg("已鎖定第二階段名單（前 10 名）");
      void load();
    }
  }

  /** Every manual change rewrites the whole list, ranks following the order. */
  async function writeList(domains: string[], note: string) {
    const { error } = await supabase.rpc("admin_set_shortlist", {
      p_domains: domains,
    });
    if (error) onError(errText(error));
    else {
      setMsg(note);
      setAddDomain("");
      void load();
    }
  }

  /** Every manual edit freezes the list, so say so while it is still live. */
  const freezeNote = locked ? "" : "目前名單還是即時計算的，這個動作會把它鎖定。\n";

  function removeFromList(domain: string) {
    const left = inList.length - 1;
    if (
      !window.confirm(
        `${freezeNote}把 ${domain} 移出第二階段名單？移出後名單剩 ${left} 家。`,
      )
    )
      return;
    void writeList(
      inList.filter((r) => r.domain !== domain).map((r) => r.domain),
      `已移出 ${domain}`,
    );
  }

  function addToList(domain: string) {
    if (!domain || inList.some((r) => r.domain === domain)) return;
    if (
      !window.confirm(
        `${freezeNote}把 ${domain} 加入第二階段名單？加入後名單共 ${inList.length + 1} 家。`,
      )
    )
      return;
    void writeList(
      [...inList.map((r) => r.domain), domain],
      `已加入 ${domain}`,
    );
  }

  function unlockList() {
    if (
      !window.confirm(
        "解除鎖定？第二階段會回到即時排名的前 10 名，隨提名變動。",
      )
    )
      return;
    void writeList([], "已解除鎖定，改用即時前 10 名");
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

  function exportNominationsCsv() {
    downloadCsv(
      `nominations-${stampToday()}.csv`,
      toCsv([
        [
          "id",
          "created_at",
          "domain",
          "display_name",
          "typed_name",
          "reason",
          "email",
          "client_id",
          "device",
        ],
        ...noms.map((n) => [
          n.id,
          n.created_at,
          n.domain,
          n.display_name,
          n.typed_name,
          n.reason,
          n.email,
          n.client_id,
          deviceTag(n.client_id),
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
        <label className="note">
          <input
            type="checkbox"
            checked={onlyNameKeys}
            onChange={(e) => setOnlyNameKeys(e.target.checked)}
          />{" "}
          只顯示待確認官網（{nameKeyCount}）
        </label>
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
            {shownRows.map((r) => (
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
                  {isNameKey(r.domain) ? (
                    <span className="abadge">待確認官網</span>
                  ) : null}
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
                <td className="num">
                  {r.nominations > 0 ? (
                    <button
                      className="linkish"
                      type="button"
                      title="看提名理由"
                      onClick={() => {
                        setNomFilter(r.domain);
                        document
                          .getElementById("admin-nominations")
                          ?.scrollIntoView({ behavior: "smooth" });
                      }}
                    >
                      {r.nominations}
                    </button>
                  ) : (
                    0
                  )}
                </td>
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

      <h3 id="admin-shortlist">第二階段名單（{inList.length}）</h3>
      <p className="note">
        排名依「提名人數」＝不重複的提名 Email 數，同分時先被提名的在前。
        同一個人重複提名同一家公司只算一次；「提名次數」是原始筆數，僅供參考。
      </p>
      {locked && inList.length !== 10 ? (
        <p className="note">
          ⚠ 名單目前有 {inList.length} 家，但首頁 FAQ 寫的是「前 10
          名會進入第二階段投票」。請調整名單或一併修改公開文案。
        </p>
      ) : null}
      <div className="arow">
        <span className={locked ? "abadge" : "note"}>
          {locked
            ? `已鎖定${lockedAt ? `（${fmt(lockedAt)}）` : ""}`
            : "尚未鎖定：第二階段目前跟著即時排名的前 10 名走"}
        </span>
        <button className="abtn" type="button" onClick={() => void lockTop10()}>
          鎖定前 10 名
        </button>
        {locked ? (
          <button className="abtn" type="button" onClick={unlockList}>
            解除鎖定
          </button>
        ) : null}
        <label className="afield">
          <span>手動加入公司</span>
          <select
            value={addDomain}
            onChange={(e) => setAddDomain(e.target.value)}
          >
            <option value="">選擇一個</option>
            {short
              .filter((r) => !r.in_shortlist)
              .map((r) => (
                <option key={r.domain} value={r.domain}>
                  {r.display_name ?? r.domain}（{r.domain}）
                </option>
              ))}
          </select>
        </label>
        <button
          className="abtn"
          type="button"
          disabled={!addDomain}
          onClick={() => addToList(addDomain)}
        >
          加入名單
        </button>
      </div>
      <div className="tablewrap">
        <table className="at">
          <thead>
            <tr>
              <th>排名</th>
              <th>公司</th>
              <th>提名人數</th>
              <th>提名次數</th>
              <th>首次提名</th>
              <th>第二階段</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {short.map((r) => (
              <tr key={r.domain}>
                <td className="num">
                  {r.in_shortlist && r.shortlist_rank !== null
                    ? r.shortlist_rank
                    : (r.rank ?? "")}
                </td>
                <td>
                  {r.display_name ?? r.domain}
                  <div className="note">{r.domain}</div>
                </td>
                <td className="num">{r.voters}</td>
                <td className="num">{r.noms}</td>
                <td>{fmt(r.first_at)}</td>
                <td>
                  {r.in_shortlist ? (
                    <span className="abadge">入選</span>
                  ) : (
                    <span className="note">未入選</span>
                  )}
                </td>
                <td>
                  {r.in_shortlist ? (
                    <button
                      className="abtn"
                      type="button"
                      onClick={() => removeFromList(r.domain)}
                    >
                      移出
                    </button>
                  ) : (
                    <button
                      className="abtn"
                      type="button"
                      onClick={() => addToList(r.domain)}
                    >
                      加入
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {short.length === 0 ? (
              <tr>
                <td colSpan={7} className="note">
                  還沒有任何提名，排名是空的。
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <h3 id="admin-nominations">提名紀錄（{shownNoms.length}）</h3>
      <div className="arow">
        <label className="afield">
          <span>公司</span>
          <select
            value={nomFilter}
            onChange={(e) => setNomFilter(e.target.value)}
          >
            <option value="">全部</option>
            {rows
              .filter((r) => r.nominations > 0)
              .map((r) => (
                <option key={r.domain} value={r.domain}>
                  {r.display_name}（{r.domain}）
                </option>
              ))}
          </select>
        </label>
        <button className="abtn" type="button" onClick={exportNominationsCsv}>
          匯出提名 CSV（含舊制理由與 Email、裝置）
        </button>
      </div>
      <div className="tablewrap">
        <table className="at">
          <thead>
            <tr>
              <th>時間</th>
              <th>公司</th>
              <th>輸入的名稱</th>
              <th>裝置</th>
              <th>提名理由（舊制）</th>
              <th>Email（舊制）</th>
            </tr>
          </thead>
          <tbody>
            {shownNoms.map((n) => (
              <tr key={n.id}>
                <td>{fmt(n.created_at)}</td>
                <td>
                  {n.display_name ?? n.domain}
                  <div className="note">{n.domain}</div>
                </td>
                <td>{n.typed_name ?? ""}</td>
                <td>
                  {n.client_id ? (
                    <code className="note" title="同一個瀏覽器的提名會有相同代碼">
                      {deviceTag(n.client_id)}
                    </code>
                  ) : (
                    <span className="note">—</span>
                  )}
                </td>
                <td>
                  {n.reason ?? <span className="note">—</span>}
                </td>
                <td>
                  {n.email ?? <span className="note">—</span>}
                </td>
              </tr>
            ))}
            {shownNoms.length === 0 ? (
              <tr>
                <td colSpan={6} className="note">
                  還沒有提名。
                </td>
              </tr>
            ) : null}
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
                {isNameKey(r.domain) ? "【待確認官網】" : ""}
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
