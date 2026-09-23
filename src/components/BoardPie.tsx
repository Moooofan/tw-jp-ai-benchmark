"use client";

import { useMemo, useState } from "react";
import type { Board } from "@/lib/types";

type Mode = "company" | "sector" | "listing";

const MODES: { k: Mode; label: string }[] = [
  { k: "company", label: "公司" },
  { k: "sector", label: "產業" },
  { k: "listing", label: "上市狀態" },
];

const LISTING_LABEL: Record<string, string> = {
  listed: "上市櫃",
  private: "未上市",
  subsidiary: "集團子公司",
  unknown: "未確認",
};

// Brand-family colours, dark to light, so slices stay legible next to each other.
const COLORS = [
  "#13458B",
  "#2563EB",
  "#3B82F6",
  "#6E90BF",
  "#0F3A75",
  "#7FA8DC",
  "#A9C8F5",
  "#52637A",
  "#9FB6CE",
  "#CFD9E8",
];

type Slice = { key: string; label: string; n: number };

function group(board: Board, mode: Mode): Slice[] {
  const rows = board.hot;
  if (mode === "company") {
    const top = rows.slice(0, 9).map((r) => ({
      key: r.domain,
      label: r.display_name,
      n: r.noms,
    }));
    const restN = rows.slice(9).reduce((s, r) => s + r.noms, 0);
    return restN > 0
      ? [...top, { key: "__rest", label: `其他 ${rows.length - 9} 家`, n: restN }]
      : top;
  }
  const map = new Map<string, Slice>();
  for (const r of rows) {
    const key = mode === "sector" ? r.sector : r.listing;
    const label = mode === "sector" ? r.sector : (LISTING_LABEL[r.listing] ?? r.listing);
    const cur = map.get(key);
    if (cur) cur.n += r.noms;
    else map.set(key, { key, label, n: r.noms });
  }
  return [...map.values()].sort((a, b) => b.n - a.n);
}

/** Donut of the nomination split, by company, sector or listing status. */
export default function BoardPie({ board }: { board: Board }) {
  const [mode, setMode] = useState<Mode>("company");
  const slices = useMemo(() => group(board, mode), [board, mode]);
  const total = slices.reduce((s, x) => s + x.n, 0);

  if (total === 0) return null;

  const R = 80;
  const C = 2 * Math.PI * R;
  let offset = 0;

  return (
    <div className="pie">
      <div className="pie__tabs" role="tablist" aria-label="分類方式">
        {MODES.map((m) => (
          <button
            key={m.k}
            type="button"
            role="tab"
            aria-selected={mode === m.k}
            className={mode === m.k ? "is-on" : undefined}
            onClick={() => setMode(m.k)}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="pie__body">
        <svg viewBox="0 0 220 220" className="pie__svg" role="img" aria-label="提名比例">
          <g transform="translate(110,110) rotate(-90)">
            {slices.map((s, i) => {
              const frac = s.n / total;
              const dash = `${C * frac} ${C * (1 - frac)}`;
              const el = (
                <circle
                  key={s.key}
                  r={R}
                  fill="none"
                  stroke={COLORS[i % COLORS.length]}
                  strokeWidth="44"
                  strokeDasharray={dash}
                  strokeDashoffset={-offset}
                />
              );
              offset += C * frac;
              return el;
            })}
          </g>
          <text x="110" y="104" className="pie__n">
            {total}
          </text>
          <text x="110" y="126" className="pie__c">
            次提名
          </text>
        </svg>

        <ol className="pie__legend">
          {slices.map((s, i) => (
            <li key={s.key}>
              <i style={{ background: COLORS[i % COLORS.length] }} aria-hidden="true" />
              <span className="pie__label">{s.label}</span>
              <span className="pie__v">
                {s.n} 次 · {Math.round((s.n / total) * 100)}%
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
