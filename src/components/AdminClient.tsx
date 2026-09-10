"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  downloadCsv,
  fromLocalInput,
  stampToday,
  toCsv,
  toLocalInput,
} from "@/lib/format";
import { errText, getBrowserClient } from "@/lib/supabase-browser";
import type {
  AdminFinalist,
  AdminPerson,
  AdminPost,
  Phase,
  Settings,
} from "@/lib/types";
import { useEmailGate } from "./EmailGate";

type PostSort = "score" | "new" | "flagged";

export default function AdminClient() {
  const supabase = getBrowserClient();
  const gate = useEmailGate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  // Open the login modal as soon as we know there is no session.
  const { ready, signedIn, require } = gate;
  useEffect(() => {
    if (ready && !signedIn) require(() => {});
  }, [ready, signedIn, require]);

  useEffect(() => {
    if (!gate.signedIn) {
      setIsAdmin(null);
      return;
    }
    void supabase.rpc("is_admin").then(({ data }) => setIsAdmin(!!data));
  }, [gate.signedIn, supabase]);

  if (!gate.signedIn) {
    return (
      <div className="admin">
        <h1>推爆東京</h1>
        <p className="sub">後台。先登入。</p>
        <button
          className="abtn abtn--go"
          type="button"
          onClick={() => gate.require(() => {})}
        >
          登入
        </button>
        {gate.modal}
        <footer>
          <span>純社群投票，好玩用的，不代表任何排名。</span>
        </footer>
      </div>
    );
  }

  if (isAdmin === null) {
    return (
      <div className="admin">
        <p className="sub">看一下…</p>
        {gate.modal}
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="nothing">
        這裡沒有東西。
        {gate.modal}
      </div>
    );
  }

  return <AdminBoard />;
}

function AdminBoard() {
  const supabase = getBrowserClient();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [posts, setPosts] = useState<AdminPost[]>([]);
  const [finalists, setFinalists] = useState<AdminFinalist[]>([]);
  const [people, setPeople] = useState<AdminPerson[]>([]);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    const [s, p, f, ppl] = await Promise.all([
      supabase.from("settings").select("*").eq("id", 1).single(),
      supabase
        .from("posts")
        .select(
          "id, company, company_key, reason, email, up, down, adjust, hidden, flagged, created_at",
        )
        .order("created_at", { ascending: false }),
      supabase.from("finalists").select("*").order("sort", { ascending: true }),
      supabase.rpc("admin_people"),
    ]);
    if (s.data) setSettings(s.data as Settings);
    if (p.data) setPosts(p.data as AdminPost[]);
    if (f.data) setFinalists(f.data as AdminFinalist[]);
    if (ppl.data) setPeople(ppl.data as AdminPerson[]);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.reload();
  }

  return (
    <div className="admin">
      <h1>推爆東京 後台</h1>
      <p className="sub">
        推爆東京的資料都在這裡。{" "}
        <button className="abtn" type="button" onClick={() => void load()}>
          重新整理
        </button>{" "}
        <button className="abtn" type="button" onClick={() => void signOut()}>
          登出
        </button>
      </p>
      {note ? <p className="err">{note}</p> : null}

      <SettingsSection
        settings={settings}
        onSaved={(s) => {
          setSettings(s);
          setNote("");
        }}
        onError={setNote}
      />

      <PostsSection posts={posts} reload={load} onError={setNote} />

      <CompanySection posts={posts} />

      <FinalistsSection
        finalists={finalists}
        reload={load}
        onError={setNote}
      />

      <PeopleSection people={people} />

      <footer>
        <span>純社群投票，好玩用的，不代表任何排名。</span>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ 設定 */

function SettingsSection({
  settings,
  onSaved,
  onError,
}: {
  settings: Settings | null;
  onSaved: (s: Settings) => void;
  onError: (m: string) => void;
}) {
  const supabase = getBrowserClient();
  const [draft, setDraft] = useState<Settings | null>(settings);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState("");

  useEffect(() => setDraft(settings), [settings]);

  if (!draft) {
    return (
      <section>
        <h2>設定</h2>
        <p className="sub">讀取中…</p>
      </section>
    );
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    setOk("");
    const { data, error } = await supabase
      .from("settings")
      .update({
        phase: draft.phase,
        nominate_close: draft.nominate_close,
        vote_close: draft.vote_close,
        people_offset: draft.people_offset,
        companies_offset: draft.companies_offset,
      })
      .eq("id", 1)
      .select()
      .single();
    setBusy(false);
    if (error) {
      onError(errText(error));
      return;
    }
    onSaved(data as Settings);
    setOk("存好了。");
  }

  return (
    <section>
      <h2>設定</h2>
      <div className="arow">
        {(
          [
            ["nominate", "推薦中"],
            ["vote", "決賽投票"],
            ["results", "結果"],
          ] as const
        ).map(([value, label]) => (
          <label className="radio" key={value}>
            <input
              type="radio"
              name="phase"
              checked={draft.phase === value}
              onChange={() => setDraft({ ...draft, phase: value as Phase })}
            />
            {label}（{value}）
          </label>
        ))}
      </div>
      <div className="arow">
        <label className="afield">
          <span>推薦截止</span>
          <input
            type="datetime-local"
            value={toLocalInput(draft.nominate_close)}
            onChange={(e) =>
              setDraft({
                ...draft,
                nominate_close: fromLocalInput(e.target.value),
              })
            }
          />
        </label>
        <label className="afield">
          <span>投票截止</span>
          <input
            type="datetime-local"
            value={toLocalInput(draft.vote_close)}
            onChange={(e) =>
              setDraft({ ...draft, vote_close: fromLocalInput(e.target.value) })
            }
          />
        </label>
        <label className="afield">
          <span>人數加成</span>
          <input
            type="number"
            value={draft.people_offset}
            onChange={(e) =>
              setDraft({ ...draft, people_offset: Number(e.target.value) || 0 })
            }
          />
        </label>
        <label className="afield">
          <span>公司數加成</span>
          <input
            type="number"
            value={draft.companies_offset}
            onChange={(e) =>
              setDraft({
                ...draft,
                companies_offset: Number(e.target.value) || 0,
              })
            }
          />
        </label>
        <button
          className="abtn abtn--go"
          type="button"
          disabled={busy}
          onClick={() => void save()}
        >
          儲存
        </button>
        {ok ? <span className="note">{ok}</span> : null}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ 貼文 */

function PostsSection({
  posts,
  reload,
  onError,
}: {
  posts: AdminPost[];
  reload: () => Promise<void>;
  onError: (m: string) => void;
}) {
  const supabase = getBrowserClient();
  const [q, setQ] = useState("");
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [onlyHidden, setOnlyHidden] = useState(false);
  const [sort, setSort] = useState<PostSort>("new");
  const [mergeFrom, setMergeFrom] = useState("");
  const [mergeTo, setMergeTo] = useState("");

  const score = (p: AdminPost) => p.up - p.down + p.adjust;

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = posts.filter((p) => {
      if (onlyFlagged && p.flagged <= 0) return false;
      if (onlyHidden && !p.hidden) return false;
      if (!needle) return true;
      return (
        p.company.toLowerCase().includes(needle) ||
        p.reason.toLowerCase().includes(needle) ||
        p.email.toLowerCase().includes(needle)
      );
    });
    list = list.slice();
    if (sort === "score") list.sort((a, b) => score(b) - score(a));
    else if (sort === "flagged") list.sort((a, b) => b.flagged - a.flagged);
    else
      list.sort(
        (a, b) => +new Date(b.created_at) - +new Date(a.created_at),
      );
    return list;
  }, [posts, q, onlyFlagged, onlyHidden, sort]);

  const companyKeys = useMemo(
    () => Array.from(new Set(posts.map((p) => p.company_key))).sort(),
    [posts],
  );

  async function patch(id: string, patchBody: Partial<AdminPost>) {
    const { error } = await supabase.from("posts").update(patchBody).eq("id", id);
    if (error) {
      onError(errText(error));
      return;
    }
    await reload();
  }

  async function remove(p: AdminPost) {
    if (!window.confirm(`刪掉「${p.company}」這則？`)) return;
    const { error } = await supabase.from("posts").delete().eq("id", p.id);
    if (error) {
      onError(errText(error));
      return;
    }
    await reload();
  }

  async function merge() {
    const from = mergeFrom.trim();
    const to = mergeTo.trim();
    if (!from || !to) {
      onError("合併要選來源，也要填目標公司名。");
      return;
    }
    const { error } = await supabase
      .from("posts")
      .update({ company: to })
      .eq("company_key", from);
    if (error) {
      onError(errText(error));
      return;
    }
    setMergeFrom("");
    setMergeTo("");
    await reload();
  }

  function exportPosts() {
    const rowsOut: (string | number)[][] = [
      [
        "id",
        "company",
        "reason",
        "email",
        "up",
        "down",
        "adjust",
        "score",
        "flagged",
        "hidden",
        "created_at",
      ],
      ...rows.map((p) => [
        p.id,
        p.company,
        p.reason,
        p.email,
        p.up,
        p.down,
        p.adjust,
        score(p),
        p.flagged,
        p.hidden ? "1" : "0",
        p.created_at,
      ]),
    ];
    downloadCsv(`tuibao-posts-${stampToday()}.csv`, toCsv(rowsOut));
  }

  return (
    <section>
      <h2>貼文（{rows.length} / {posts.length}）</h2>
      <div className="arow">
        <label className="afield">
          <span>搜尋</span>
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="公司、理由、信箱"
          />
        </label>
        <label className="radio">
          <input
            type="checkbox"
            checked={onlyFlagged}
            onChange={(e) => setOnlyFlagged(e.target.checked)}
          />
          只看被檢舉
        </label>
        <label className="radio">
          <input
            type="checkbox"
            checked={onlyHidden}
            onChange={(e) => setOnlyHidden(e.target.checked)}
          />
          只看隱藏
        </label>
        <label className="afield">
          <span>排序</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as PostSort)}
          >
            <option value="new">最新</option>
            <option value="score">分數</option>
            <option value="flagged">被檢舉</option>
          </select>
        </label>
        <button className="abtn" type="button" onClick={exportPosts}>
          匯出 CSV（含信箱）
        </button>
      </div>

      <div className="arow">
        <label className="afield">
          <span>合併公司：來源</span>
          <select
            value={mergeFrom}
            onChange={(e) => setMergeFrom(e.target.value)}
          >
            <option value="">選一個</option>
            {companyKeys.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <label className="afield">
          <span>改成</span>
          <input
            type="text"
            value={mergeTo}
            onChange={(e) => setMergeTo(e.target.value)}
            placeholder="目標公司名"
          />
        </label>
        <button className="abtn" type="button" onClick={() => void merge()}>
          合併
        </button>
      </div>

      <div className="tablewrap">
        <table className="at">
          <thead>
            <tr>
              <th>公司</th>
              <th>理由</th>
              <th>信箱</th>
              <th>推</th>
              <th>噓</th>
              <th>調整</th>
              <th>分數</th>
              <th>檢舉</th>
              <th>隱藏</th>
              <th>時間</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className={p.hidden ? "is-hidden" : undefined}>
                <td>{p.company}</td>
                <td>{p.reason}</td>
                <td>{p.email}</td>
                <td className="num">{p.up}</td>
                <td className="num">{p.down}</td>
                <td className="num">
                  <input
                    type="number"
                    defaultValue={p.adjust}
                    onBlur={(e) => {
                      const v = Number(e.target.value) || 0;
                      if (v !== p.adjust) void patch(p.id, { adjust: v });
                    }}
                  />
                </td>
                <td className="num">{score(p)}</td>
                <td className="num">{p.flagged}</td>
                <td className="num">
                  <input
                    type="checkbox"
                    checked={p.hidden}
                    onChange={(e) =>
                      void patch(p.id, { hidden: e.target.checked })
                    }
                  />
                </td>
                <td className="num">
                  {new Date(p.created_at).toLocaleString("zh-TW")}
                </td>
                <td>
                  <button
                    className="abtn"
                    type="button"
                    onClick={() => void remove(p)}
                  >
                    刪除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">
        調整欄改完點別的地方就會存。分數 = 推 − 噓 + 調整。
      </p>
    </section>
  );
}

/* -------------------------------------------------------------- 公司總表 */

function CompanySection({ posts }: { posts: AdminPost[] }) {
  const rows = useMemo(() => {
    const map = new Map<
      string,
      { company: string; n: number; score: number; topReason: string; top: number }
    >();
    for (const p of posts) {
      if (p.hidden) continue;
      const s = p.up - p.down + p.adjust;
      const cur = map.get(p.company_key);
      if (!cur) {
        map.set(p.company_key, {
          company: p.company,
          n: 1,
          score: s,
          topReason: p.reason,
          top: s,
        });
      } else {
        cur.n += 1;
        cur.score += s;
        if (s > cur.top) {
          cur.top = s;
          cur.topReason = p.reason;
        }
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => b.score - a.score || b.n - a.n,
    );
  }, [posts]);

  return (
    <section>
      <h2>公司總表（{rows.length}）</h2>
      <div className="tablewrap">
        <table className="at">
          <thead>
            <tr>
              <th>#</th>
              <th>公司</th>
              <th>則數</th>
              <th>總分</th>
              <th>最高分理由</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.company + i}>
                <td className="num">{i + 1}</td>
                <td>{r.company}</td>
                <td className="num">{r.n}</td>
                <td className="num">{r.score}</td>
                <td>{r.topReason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">隱藏的貼文不算在裡面。</p>
    </section>
  );
}

/* -------------------------------------------------------------- 決賽名單 */

function FinalistsSection({
  finalists,
  reload,
  onError,
}: {
  finalists: AdminFinalist[];
  reload: () => Promise<void>;
  onError: (m: string) => void;
}) {
  const supabase = getBrowserClient();
  const [busy, setBusy] = useState(false);

  async function build() {
    if (
      !window.confirm("這會清掉現在的決賽名單和決賽票，用目前總表重建前 10。要嗎？")
    ) {
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("admin_build_finalists");
    setBusy(false);
    if (error) {
      onError(errText(error));
      return;
    }
    await reload();
  }

  async function saveRow(row: AdminFinalist) {
    const { error } = await supabase
      .from("finalists")
      .update({
        company: row.company,
        blurb: row.blurb,
        top_reason: row.top_reason,
        sort: row.sort,
        adjust: row.adjust,
      })
      .eq("id", row.id);
    if (error) {
      onError(errText(error));
      return;
    }
    await reload();
  }

  async function removeRow(row: AdminFinalist) {
    if (!window.confirm(`把「${row.company}」從決賽名單拿掉？`)) return;
    const { error } = await supabase
      .from("finalists")
      .delete()
      .eq("id", row.id);
    if (error) {
      onError(errText(error));
      return;
    }
    await reload();
  }

  async function addRow() {
    const nextSort =
      finalists.reduce((max, f) => Math.max(max, f.sort), 0) + 1;
    const { error } = await supabase
      .from("finalists")
      .insert({ company: "新的一家", sort: nextSort });
    if (error) {
      onError(errText(error));
      return;
    }
    await reload();
  }

  return (
    <section>
      <h2>決賽名單（{finalists.length}）</h2>
      <div className="arow">
        <button
          className="abtn abtn--go"
          type="button"
          disabled={busy}
          onClick={() => void build()}
        >
          用目前總表自動產生前 10
        </button>
        <button className="abtn" type="button" onClick={() => void addRow()}>
          加一列
        </button>
      </div>
      <div className="tablewrap">
        <table className="at">
          <thead>
            <tr>
              <th>順序</th>
              <th>公司</th>
              <th>一句話</th>
              <th>代表理由</th>
              <th>調整</th>
              <th>票數</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {finalists.map((f) => (
              <FinalistRow
                key={f.id}
                row={f}
                onSave={saveRow}
                onDelete={removeRow}
              />
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">票數是實際投出來的，調整只是備註用的欄位。</p>
    </section>
  );
}

function FinalistRow({
  row,
  onSave,
  onDelete,
}: {
  row: AdminFinalist;
  onSave: (row: AdminFinalist) => Promise<void>;
  onDelete: (row: AdminFinalist) => Promise<void>;
}) {
  const [draft, setDraft] = useState<AdminFinalist>(row);
  useEffect(() => setDraft(row), [row]);

  return (
    <tr>
      <td className="num">
        <input
          type="number"
          value={draft.sort}
          onChange={(e) =>
            setDraft({ ...draft, sort: Number(e.target.value) || 0 })
          }
        />
      </td>
      <td>
        <input
          type="text"
          value={draft.company}
          onChange={(e) => setDraft({ ...draft, company: e.target.value })}
        />
      </td>
      <td>
        <input
          type="text"
          value={draft.blurb ?? ""}
          onChange={(e) => setDraft({ ...draft, blurb: e.target.value })}
        />
      </td>
      <td>
        <input
          type="text"
          value={draft.top_reason ?? ""}
          onChange={(e) => setDraft({ ...draft, top_reason: e.target.value })}
        />
      </td>
      <td className="num">
        <input
          type="number"
          value={draft.adjust}
          onChange={(e) =>
            setDraft({ ...draft, adjust: Number(e.target.value) || 0 })
          }
        />
      </td>
      <td className="num">{row.votes}</td>
      <td>
        <button className="abtn" type="button" onClick={() => void onSave(draft)}>
          存
        </button>{" "}
        <button
          className="abtn"
          type="button"
          onClick={() => void onDelete(row)}
        >
          刪除
        </button>
      </td>
    </tr>
  );
}

/* ------------------------------------------------------------------ 名單 */

function PeopleSection({ people }: { people: AdminPerson[] }) {
  function exportPeople() {
    const rowsOut: (string | number)[][] = [
      [
        "email",
        "user_id",
        "created_at",
        "last_sign_in_at",
        "n_posts",
        "n_votes",
        "n_final_votes",
        "companies",
      ],
      ...people.map((p) => [
        p.email,
        p.user_id,
        p.created_at,
        p.last_sign_in_at ?? "",
        p.n_posts,
        p.n_votes,
        p.n_final_votes,
        (p.companies ?? []).join(" / "),
      ]),
    ];
    downloadCsv(`tuibao-people-${stampToday()}.csv`, toCsv(rowsOut));
  }

  return (
    <section>
      <h2>名單（{people.length}）</h2>
      <div className="arow">
        <button className="abtn abtn--ink" type="button" onClick={exportPeople}>
          匯出 CSV
        </button>
      </div>
      <div className="tablewrap">
        <table className="at">
          <thead>
            <tr>
              <th>信箱</th>
              <th>user_id</th>
              <th>註冊</th>
              <th>最後登入</th>
              <th>推文</th>
              <th>推噓</th>
              <th>決賽票</th>
              <th>推過的公司</th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.user_id}>
                <td>{p.email}</td>
                <td>{p.user_id}</td>
                <td className="num">
                  {new Date(p.created_at).toLocaleString("zh-TW")}
                </td>
                <td className="num">
                  {p.last_sign_in_at
                    ? new Date(p.last_sign_in_at).toLocaleString("zh-TW")
                    : "—"}
                </td>
                <td className="num">{p.n_posts}</td>
                <td className="num">{p.n_votes}</td>
                <td className="num">{p.n_final_votes}</td>
                <td>{(p.companies ?? []).join("、")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
