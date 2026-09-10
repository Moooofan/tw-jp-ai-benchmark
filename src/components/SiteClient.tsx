"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { confetti } from "@/lib/confetti";
import { daysLeft, timeAgo } from "@/lib/format";
import { errText, getBrowserClient } from "@/lib/supabase-browser";
import {
  EMPTY_STATE,
  type MyState,
  type PublicFinalist,
  type PublicPost,
  type Stats,
} from "@/lib/types";
import { useEmailGate } from "./EmailGate";
import Modal from "./Modal";

const REFRESH_MS = 20_000;
const SUGGEST_MS = 250;
const FOOTER_LINE = "純社群投票，好玩用的，不代表任何排名。";

type Sort = "new" | "top" | "boo";

export default function SiteClient({
  stats,
  posts: serverPosts,
  finalists,
}: {
  stats: Stats;
  posts: PublicPost[];
  finalists: PublicFinalist[];
}) {
  const supabase = getBrowserClient();
  const router = useRouter();
  const gate = useEmailGate();

  const [posts, setPosts] = useState<PublicPost[]>(serverPosts);
  const [mine, setMine] = useState<MyState>(EMPTY_STATE);
  const [sort, setSort] = useState<Sort>("new");
  const [newId, setNewId] = useState<string | null>(null);
  const [pop, setPop] = useState<{ id: string; dir: number } | null>(null);
  const [share, setShare] = useState<{ company: string; reason: string } | null>(
    null,
  );

  useEffect(() => setPosts(serverPosts), [serverPosts]);

  // 20 s poll for fresh server data.
  useEffect(() => {
    const t = setInterval(() => router.refresh(), REFRESH_MS);
    return () => clearInterval(t);
  }, [router]);

  // The caller's own votes / picks / reports.
  const loadMine = useCallback(async () => {
    if (!gate.signedIn) {
      setMine(EMPTY_STATE);
      return;
    }
    const { data } = await supabase.rpc("my_state");
    if (data) {
      const d = data as Partial<MyState>;
      setMine({
        votes: d.votes ?? {},
        picks: d.picks ?? [],
        reports: d.reports ?? [],
      });
    }
  }, [gate.signedIn, supabase]);

  useEffect(() => {
    void loadMine();
  }, [loadMine]);

  const phase = stats.phase;
  const closeAt = phase === "nominate" ? stats.nominate_close : stats.vote_close;

  const hotId = useMemo(() => {
    let best: PublicPost | null = null;
    for (const p of posts) {
      if (p.score <= 0) continue;
      if (!best || p.score > best.score) best = p;
    }
    return best?.id ?? null;
  }, [posts]);

  const sorted = useMemo(() => {
    const list = posts.slice();
    if (sort === "new") {
      list.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    } else if (sort === "top") {
      list.sort((a, b) => b.score - a.score);
    } else {
      list.sort((a, b) => a.score - b.score);
    }
    return list;
  }, [posts, sort]);

  function flashPop(id: string, dir: number) {
    setPop({ id, dir });
    setTimeout(() => setPop((p) => (p && p.id === id ? null : p)), 700);
  }

  function vote(post: PublicPost, dir: 1 | -1) {
    gate.require(async () => {
      const prev = mine.votes[post.id] ?? 0;
      const next = prev === dir ? 0 : dir;
      setMine((m) => ({ ...m, votes: { ...m.votes, [post.id]: next } }));
      setPosts((list) =>
        list.map((p) =>
          p.id === post.id ? { ...p, score: p.score + (next - prev) } : p,
        ),
      );
      if (next !== 0) flashPop(post.id, next);
      if (next > 0) {
        confetti(document.querySelector(`[data-post="${post.id}"] .vote`));
      }
      const { data, error } = await supabase.rpc("cast_vote", {
        p_post: post.id,
        p_dir: dir,
      });
      if (error) {
        setMine((m) => ({ ...m, votes: { ...m.votes, [post.id]: prev } }));
        setPosts((list) =>
          list.map((p) =>
            p.id === post.id ? { ...p, score: p.score - (next - prev) } : p,
          ),
        );
        window.alert(errText(error));
        return;
      }
      const score = typeof data === "number" ? data : post.score;
      setPosts((list) =>
        list.map((p) => (p.id === post.id ? { ...p, score } : p)),
      );
    });
  }

  function report(post: PublicPost) {
    gate.require(async () => {
      setMine((m) => ({ ...m, reports: [...m.reports, post.id] }));
      const { error } = await supabase.rpc("report_post", { p_post: post.id });
      if (error) window.alert(errText(error));
    });
  }

  return (
    <>
      <Ticker posts={posts} />

      <main className="wrap">
        <div className="grid">
          <section className="poster">
            <h1 className="title">
              <span className="kuang">推</span>
              <span className="bao">爆</span>
              <span className="kuang">東京</span>
              <span className="sticker">第 1 屆</span>
            </h1>
            <p className="q">
              哪家台灣新創在東京
              <br />
              最值得推？
            </p>
            <p className="sub">
              {phase === "nominate"
                ? "留一句理由，讓大家推。推最多的十家進決賽。"
                : phase === "vote"
                  ? "每人 3 票，推出你的東京前三。"
                  : "推爆的結果出來了。"}
            </p>
            <div className="stats">
              <span className="stat">
                <b>{stats.people}</b>人推了
              </span>
              <span className="stat">
                <b>{stats.companies}</b>家
              </span>
              {phase === "results" ? null : (
                <span className="stat" suppressHydrationWarning>
                  還剩 <b>{daysLeft(closeAt)}</b>天
                </span>
              )}
            </div>

            {phase === "nominate" ? (
              <NominateForm
                gate={gate}
                onDone={(company, reason, id) => {
                  setNewId(id);
                  setSort("new");
                  setShare({ company, reason });
                  router.refresh();
                  void loadMine();
                }}
              />
            ) : null}
          </section>

          {phase === "nominate" ? (
            <section>
              <div className="wallhead">
                <h2>推薦牆</h2>
                <div className="tabs" role="tablist">
                  {(
                    [
                      ["new", "最新"],
                      ["top", "最推"],
                      ["boo", "最噓"],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      role="tab"
                      type="button"
                      aria-selected={sort === key}
                      onClick={() => setSort(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="posts">
                {sorted.length === 0 ? (
                  <p className="empty">還沒有人推。第一個推的就是你。</p>
                ) : (
                  sorted.map((p) => (
                    <article
                      key={p.id}
                      data-post={p.id}
                      className={p.id === newId ? "post new" : "post"}
                    >
                      <div className="vote">
                        <button
                          type="button"
                          aria-label="推"
                          className={
                            mine.votes[p.id] === 1 ? "up on" : "up"
                          }
                          onClick={() => vote(p, 1)}
                        >
                          推
                        </button>
                        <span
                          className={
                            p.score < 0
                              ? "score neg"
                              : p.id === hotId
                                ? "score hot"
                                : "score"
                          }
                        >
                          {p.score}
                        </span>
                        <button
                          type="button"
                          aria-label="噓"
                          className={
                            mine.votes[p.id] === -1 ? "down on" : "down"
                          }
                          onClick={() => vote(p, -1)}
                        >
                          噓
                        </button>
                        {pop && pop.id === p.id ? (
                          <span className={pop.dir < 0 ? "pop blue" : "pop"}>
                            {pop.dir > 0 ? "推！" : "噓…"}
                          </span>
                        ) : null}
                      </div>
                      <div>
                        <p className="post__co">
                          {p.company}
                          {p.id === hotId ? <span className="tag">爆</span> : null}
                        </p>
                        <p className="post__why">{p.reason}</p>
                        <p className="post__meta">
                          <span suppressHydrationWarning>
                            {p.masked_email} · {timeAgo(p.created_at)}
                          </span>
                          <button
                            type="button"
                            disabled={mine.reports.includes(p.id)}
                            onClick={() => report(p)}
                          >
                            {mine.reports.includes(p.id) ? "收到" : "檢舉"}
                          </button>
                        </p>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>
          ) : phase === "vote" ? (
            <FinalVote
              gate={gate}
              finalists={finalists}
              picks={mine.picks}
              onPicks={(picks) => setMine((m) => ({ ...m, picks }))}
            />
          ) : (
            <Results finalists={finalists} />
          )}
        </div>

        <footer>
          <span>{FOOTER_LINE}</span>
        </footer>
      </main>

      {gate.modal}

      <Modal open={!!share} onClose={() => setShare(null)}>
        {share ? (
          <>
            <h3>推上去了</h3>
            <div className="sharecard">
              我推了 {share.company} 去東京：
              <br />
              「{share.reason}」<small>推爆東京</small>
            </div>
            <ShareRow company={share.company} reason={share.reason} />
            <button
              className="btn btn--ink btn--sm"
              type="button"
              onClick={() => setShare(null)}
            >
              好了
            </button>
          </>
        ) : null}
      </Modal>
    </>
  );
}

function ShareRow({ company, reason }: { company: string; reason: string }) {
  const [copied, setCopied] = useState(false);
  const text = `我推了 ${company} 去東京：「${reason}」 #推爆東京`;
  const open = (url: string) => window.open(url, "_blank", "noopener");
  return (
    <div className="share">
      <button
        type="button"
        onClick={() =>
          open("https://x.com/intent/post?text=" + encodeURIComponent(text))
        }
      >
        分享到 X
      </button>
      <button
        type="button"
        onClick={() =>
          open("https://line.me/R/share?text=" + encodeURIComponent(text))
        }
      >
        分享到 LINE
      </button>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard?.writeText(text);
          setCopied(true);
        }}
      >
        {copied ? "複製了" : "複製"}
      </button>
    </div>
  );
}

function Ticker({ posts }: { posts: PublicPost[] }) {
  const items = posts.slice(0, 8);
  if (items.length === 0) return <div className="ticker" aria-hidden="true" />;
  const line = items.map((p) => (
    <span key={p.id}>
      <b>推</b> {p.company}：{p.reason}
    </span>
  ));
  return (
    <div className="ticker" aria-hidden="true">
      <div className="ticker__track">
        {line}
        {items.map((p) => (
          <span key={`${p.id}-2`}>
            <b>推</b> {p.company}：{p.reason}
          </span>
        ))}
      </div>
    </div>
  );
}

function NominateForm({
  gate,
  onDone,
}: {
  gate: ReturnType<typeof useEmailGate>;
  onDone: (company: string, reason: string, id: string) => void;
}) {
  const supabase = getBrowserClient();
  const [company, setCompany] = useState("");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [suggest, setSuggest] = useState<string[]>([]);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const q = company.trim();
    if (q.length < 1) {
      setSuggest([]);
      return;
    }
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc("company_suggest", { q });
      const names = ((data as { company: string }[] | null) ?? [])
        .map((r) => r.company)
        .filter((n) => n.toLowerCase() !== q.toLowerCase())
        .slice(0, 4);
      setSuggest(names);
    }, SUGGEST_MS);
    return () => clearTimeout(t);
  }, [company, supabase]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const c = company.trim();
    const w = reason.trim();
    if (!c) {
      setErr("公司名要填。");
      return;
    }
    if (w.length < 4) {
      setErr("理由至少寫一句，四個字也算。");
      return;
    }
    gate.require(async () => {
      setBusy(true);
      const { data, error } = await supabase.rpc("nominate", {
        p_company: c,
        p_reason: w,
      });
      setBusy(false);
      if (error) {
        setErr(errText(error));
        return;
      }
      setCompany("");
      setReason("");
      setSuggest([]);
      setErr("");
      confetti(formRef.current);
      onDone(c, w, String(data));
    });
  }

  return (
    <form className="card form" ref={formRef} noValidate onSubmit={submit}>
      <div>
        <label htmlFor="co">公司</label>
        <input
          id="co"
          name="co"
          placeholder="公司名，中文英文都可以"
          autoComplete="off"
          maxLength={40}
          value={company}
          onChange={(e) => {
            setCompany(e.target.value);
            setErr("");
          }}
        />
        <div className="suggest">
          {suggest.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => {
                setCompany(n);
                setSuggest([]);
              }}
            >
              已有人推：{n}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label htmlFor="why">為什麼推它？</label>
        <textarea
          id="why"
          name="why"
          placeholder="一句話就好"
          maxLength={120}
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setErr("");
          }}
        />
        <div className="count">{reason.length}/120</div>
      </div>
      <p className="err">{err}</p>
      <button className="btn" type="submit" disabled={busy}>
        {busy ? "推送中…" : "推上去"}
      </button>
      <p className="fine">一個信箱推 3 家，推噓不限。信箱不公開。</p>
    </form>
  );
}

function FinalVote({
  gate,
  finalists,
  picks,
  onPicks,
}: {
  gate: ReturnType<typeof useEmailGate>;
  finalists: PublicFinalist[];
  picks: string[];
  onPicks: (picks: string[]) => void;
}) {
  const supabase = getBrowserClient();
  const [msg, setMsg] = useState<string | null>(null);

  const used = picks.length;
  const line =
    msg ?? (used >= 3 ? "3 票用完了，可以改" : `還有 ${3 - used} 票`);

  function toggle(f: PublicFinalist, el: Element | null) {
    gate.require(async () => {
      setMsg(null);
      if (!picks.includes(f.id) && picks.length >= 3) {
        setMsg("3 票用完了，先取消一個。");
        return;
      }
      const { data, error } = await supabase.rpc("cast_final_vote", {
        p_finalist: f.id,
      });
      if (error) {
        setMsg(errText(error));
        return;
      }
      const next = (data as string[] | null) ?? [];
      onPicks(next);
      if (next.includes(f.id)) confetti(el);
    });
  }

  return (
    <section>
      <div className="wallhead">
        <h2>被推爆的十家</h2>
        <span className="sub">每人 3 票，推出你的東京前三。</span>
      </div>
      <div className="votebar">
        <span className="sub">你的票</span>
        <div className="pips">
          {[0, 1, 2].map((i) => (
            <span key={i} className={i < used ? "pip on" : "pip"} />
          ))}
        </div>
        <span className="sub">{line}</span>
      </div>
      <div className="finals">
        {finalists.length === 0 ? (
          <p className="empty">名單還沒出來。</p>
        ) : (
          finalists.map((f, i) => {
            const on = picks.includes(f.id);
            return (
              <div className="fcard" key={f.id}>
                <span className="rank">{i + 1}</span>
                <h3>{f.company}</h3>
                {f.blurb ? <p className="sub">{f.blurb}</p> : null}
                {f.top_reason ? (
                  <blockquote>「{f.top_reason}」</blockquote>
                ) : null}
                <button
                  className={on ? "btn btn--sm on" : "btn btn--sm"}
                  type="button"
                  onClick={(e) => toggle(f, e.currentTarget)}
                >
                  {on ? "推了" : "推"}
                </button>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

function Results({ finalists }: { finalists: PublicFinalist[] }) {
  const ranked = finalists
    .slice()
    .sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0) || a.sort - b.sort);
  const top = ranked.slice(0, 3);
  const rest = ranked.slice(3, 10);

  return (
    <section>
      <div className="wallhead">
        <h2>被推爆的三家</h2>
      </div>
      <div className="podium">
        {top.map((f, i) => (
          <div className="pcard" key={f.id}>
            <span className="rank">{i + 1}</span>
            <h3>{f.company}</h3>
            {f.top_reason ? <blockquote>「{f.top_reason}」</blockquote> : null}
            <span className="num">{f.votes ?? 0} 票</span>
          </div>
        ))}
      </div>
      {rest.length > 0 ? (
        <div className="rest">
          {rest.map((f, i) => (
            <div className="rcard" key={f.id}>
              <span className="n">{i + 4}</span>
              <b>{f.company}</b>
              <span className="v">{f.votes ?? 0}</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
