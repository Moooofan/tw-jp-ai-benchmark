"use client";

import { useCallback, useEffect, useState } from "react";
import { downloadCsv, stampToday, toCsv } from "@/lib/format";
import { errText, getBrowserClient } from "@/lib/supabase-browser";
import type { AdminBallots, AdminVoteStat } from "@/lib/types";

const PAGE = 50;
const EXPORT_PAGE = 500;

/**
 * `admin_shortlist()` carries `shortlist_enforced` on every row (same trick
 * as `locked`/`locked_at`), so any row works to read the current flag.
 */
type ShortlistFlagRow = { shortlist_enforced?: boolean };

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("zh-TW", { hour12: false }) : "";

/**
 * 投票 (spec v7b §5): per-company tally with vote adjust, ballots with void
 * and reason-hide toggles, testers, ballot CSV export.
 */
export default function AdminVote({
  onError,
}: {
  onError: (m: string) => void;
}) {
  const supabase = getBrowserClient();
  const [stats, setStats] = useState<AdminVoteStat[]>([]);
  const [adjust, setAdjust] = useState<Record<string, string>>({});
  const [ballots, setBallots] = useState<AdminBallots>({ total: 0, ballots: [] });
  const [page, setPage] = useState(0);
  const [testers, setTesters] = useState<string[]>([]);
  const [newTester, setNewTester] = useState("");
  const [msg, setMsg] = useState("");
  const [exporting, setExporting] = useState(false);
  const [shortlistEnforced, setShortlistEnforced] = useState(false);
  const [shortlistBusy, setShortlistBusy] = useState(false);

  const loadStats = useCallback(async () => {
    const { data, error } = await supabase.rpc("admin_vote_stats");
    if (error) return onError(errText(error));
    const rows = (data as AdminVoteStat[] | null) ?? [];
    setStats(rows);
    setAdjust(Object.fromEntries(rows.map((r) => [r.domain, String(r.adjust)])));
  }, [supabase, onError]);

  const loadBallots = useCallback(
    async (p: number) => {
      const { data, error } = await supabase.rpc("admin_ballots", {
        p_limit: PAGE,
        p_offset: p * PAGE,
      });
      if (error) return onError(errText(error));
      setBallots((data as AdminBallots | null) ?? { total: 0, ballots: [] });
    },
    [supabase, onError],
  );

  const loadTesters = useCallback(async () => {
    const { data, error } = await supabase.rpc("admin_testers_set", {
      p_email: "",
      p_on: false,
    });
    if (error) return onError(errText(error));
    setTesters((data as string[] | null) ?? []);
  }, [supabase, onError]);

  const loadShortlistFlag = useCallback(async () => {
    const { data, error } = await supabase.rpc("admin_shortlist");
    if (error) return onError(errText(error));
    const rows = (data as ShortlistFlagRow[] | null) ?? [];
    setShortlistEnforced(rows[0]?.shortlist_enforced ?? false);
  }, [supabase, onError]);

  useEffect(() => {
    void loadStats();
    void loadTesters();
    void loadShortlistFlag();
  }, [loadStats, loadTesters, loadShortlistFlag]);

  useEffect(() => {
    void loadBallots(page);
  }, [loadBallots, page]);

  async function saveAdjust(domain: string) {
    const n = Number.parseInt(adjust[domain] ?? "0", 10);
    if (!Number.isFinite(n)) return onError("調整票數需要是整數。");
    const { error } = await supabase.rpc("admin_set_vote_adjust", {
      p_domain: domain,
      p_adjust: n,
    });
    if (error) return onError(errText(error));
    setMsg(`已調整 ${domain}：${n >= 0 ? "+" : ""}${n}`);
    void loadStats();
  }

  async function setVoid(id: number, voided: boolean) {
    const { error } = await supabase.rpc("admin_set_ballot_void", {
      p_id: id,
      p_voided: voided,
    });
    if (error) return onError(errText(error));
    setMsg(voided ? `選票 #${id} 已作廢` : `選票 #${id} 已恢復`);
    void loadBallots(page);
    void loadStats();
  }

  async function setHidden(pickId: number, hidden: boolean) {
    const { error } = await supabase.rpc("admin_set_reason_hidden", {
      p_pick_id: pickId,
      p_hidden: hidden,
    });
    if (error) return onError(errText(error));
    setMsg(hidden ? `理由 #${pickId} 已隱藏` : `理由 #${pickId} 已公開`);
    void loadBallots(page);
    void loadStats();
  }

  async function setShortlistEnforcedFlag(enabled: boolean) {
    setShortlistBusy(true);
    const { error } = await supabase.rpc("admin_set_shortlist_enforced", {
      p_enabled: enabled,
    });
    setShortlistBusy(false);
    if (error) return onError(errText(error));
    setShortlistEnforced(enabled);
    setMsg(
      enabled
        ? "已開啟：投票僅限第二階段名單前 10 名"
        : "已關閉：第二階段名單只是參考，任何公司都能被投票（含尚未被提名的公司）",
    );
  }

  async function tester(email: string, on: boolean) {
    const { data, error } = await supabase.rpc("admin_testers_set", {
      p_email: email,
      p_on: on,
    });
    if (error) return onError(errText(error));
    setTesters((data as string[] | null) ?? []);
    if (on) setNewTester("");
  }

  async function exportBallots() {
    setExporting(true);
    const rows: (string | number)[][] = [
      ["email", "date", "domain", "reason", "likes", "dislikes", "voided", "hidden"],
    ];
    for (let offset = 0; ; offset += EXPORT_PAGE) {
      const { data, error } = await supabase.rpc("admin_ballots", {
        p_limit: EXPORT_PAGE,
        p_offset: offset,
      });
      if (error) {
        setExporting(false);
        return onError(errText(error));
      }
      const chunk = (data as AdminBallots).ballots;
      for (const b of chunk) {
        for (const p of b.picks) {
          rows.push([
            b.email,
            b.ballot_date,
            p.domain,
            p.reason,
            p.likes,
            p.dislikes,
            b.voided ? "yes" : "",
            p.hidden ? "yes" : "",
          ]);
        }
      }
      if (chunk.length < EXPORT_PAGE) break;
    }
    downloadCsv(`ballots-${stampToday()}.csv`, toCsv(rows));
    setExporting(false);
  }

  const pages = Math.max(1, Math.ceil(ballots.total / PAGE));

  return (
    <section>
      <h2>投票</h2>
      {msg ? <p className="note">{msg}</p> : null}

      <h3 className="asub">第二階段名單的效力</h3>
      <p className="note">
        行銷手冊 v4.0 沒有規定第二階段一定要有候選名單，所以預設關閉：「第二階段名單」（見「公司與提名」分頁）只是即時排名前
        10 名的參考名單，投票人仍可以投給名單外、甚至還沒被提名過的公司——選了就會同時建立這家公司與一筆提名。開啟後，投票會被限制在名單前
        10 名之內。
      </p>
      <label className="radio">
        <input
          type="checkbox"
          checked={shortlistEnforced}
          disabled={shortlistBusy}
          onChange={(e) => void setShortlistEnforcedFlag(e.target.checked)}
        />
        限制投票僅限第二階段名單前 10 名
      </label>

      <h3 className="asub">公司票數（{stats.length}）</h3>
      <p className="note">
        票數 = 有效選票的選擇數 + 推噓加成（淨數 ÷ 10，捨去小數）+ 手動調整。
      </p>
      <div className="tablewrap">
        <table className="at">
          <thead>
            <tr>
              <th>#</th>
              <th>公司</th>
              <th>選擇數</th>
              <th>理由</th>
              <th>讚淨數</th>
              <th>加成</th>
              <th>調整</th>
              <th>票數</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((r) => (
              <tr key={r.domain} className={r.is_candidate ? undefined : "is-hidden"}>
                <td className="num">{r.rank ?? "—"}</td>
                <td>
                  {r.display_name}
                  <br />
                  <small>{r.domain}</small>
                </td>
                <td className="num">{r.picks}</td>
                <td className="num">{r.reasons}</td>
                <td className="num">{r.reaction_net}</td>
                <td className="num">{r.bonus}</td>
                <td>
                  <span className="arow arow--tight">
                    <input
                      type="number"
                      step={1}
                      value={adjust[r.domain] ?? "0"}
                      onChange={(e) =>
                        setAdjust((a) => ({ ...a, [r.domain]: e.target.value }))
                      }
                    />
                    <button
                      className="abtn"
                      type="button"
                      disabled={String(r.adjust) === (adjust[r.domain] ?? "0")}
                      onClick={() => void saveAdjust(r.domain)}
                    >
                      儲存
                    </button>
                  </span>
                </td>
                <td className="num">
                  <b>{r.votes}</b>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="asub">選票（{ballots.total}）</h3>
      <div className="arow">
        <button
          className="abtn"
          type="button"
          disabled={page === 0}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
        >
          上一頁
        </button>
        <span className="note">
          第 {page + 1} / {pages} 頁
        </span>
        <button
          className="abtn"
          type="button"
          disabled={page + 1 >= pages}
          onClick={() => setPage((p) => p + 1)}
        >
          下一頁
        </button>
        <button
          className="abtn abtn--ink"
          type="button"
          disabled={exporting}
          onClick={() => void exportBallots()}
        >
          {exporting ? "匯出中…" : "匯出選票 CSV"}
        </button>
      </div>
      <div className="tablewrap">
        <table className="at">
          <thead>
            <tr>
              <th>#</th>
              <th>Email</th>
              <th>日期</th>
              <th>選擇與理由</th>
              <th>作廢</th>
            </tr>
          </thead>
          <tbody>
            {ballots.ballots.map((b) => (
              <tr key={b.id} className={b.voided ? "is-hidden" : undefined}>
                <td className="num">{b.id}</td>
                <td>
                  {b.email}
                  <br />
                  <small>{fmt(b.created_at)}</small>
                </td>
                <td>{b.ballot_date}</td>
                <td>
                  <ul className="apicks">
                    {b.picks.map((p) => (
                      <li key={p.pick_id} className={p.hidden ? "is-hidden" : undefined}>
                        <b>{p.display_name}</b>：{p.reason}{" "}
                        <small>
                          推 {p.likes} · 噓 {p.dislikes}
                        </small>{" "}
                        <label className="radio">
                          <input
                            type="checkbox"
                            checked={p.hidden}
                            onChange={(e) => void setHidden(p.pick_id, e.target.checked)}
                          />
                          隱藏理由
                        </label>
                      </li>
                    ))}
                  </ul>
                </td>
                <td>
                  <label className="radio">
                    <input
                      type="checkbox"
                      checked={b.voided}
                      onChange={(e) => void setVoid(b.id, e.target.checked)}
                    />
                    作廢
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="asub">測試帳號（{testers.length}）</h3>
      <p className="note">
        測試 Email 在任何階段都可以投票與按讚，只用於上線前測試；測試完請移除。
      </p>
      <div className="arow">
        <label className="afield afield--wide">
          Email
          <input
            type="email"
            value={newTester}
            placeholder="qa@example.com"
            onChange={(e) => setNewTester(e.target.value)}
          />
        </label>
        <button
          className="abtn abtn--go"
          type="button"
          disabled={!newTester.trim()}
          onClick={() => void tester(newTester, true)}
        >
          新增
        </button>
      </div>
      {testers.length > 0 ? (
        <ul className="apicks">
          {testers.map((t) => (
            <li key={t}>
              {t}{" "}
              <button className="abtn" type="button" onClick={() => void tester(t, false)}>
                移除
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
