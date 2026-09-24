"use client";

import { useMemo } from "react";
import type { Board } from "@/lib/types";

/**
 * Company names as a cloud (CEO note, 2026-09-24). Size hints at how often a
 * company was nominated; the order is deliberately not by count, so the block
 * reads as "who is here", never as a league table.
 */
export default function NameCloud({ board }: { board: Board }) {
  const words = useMemo(() => {
    const rows = board.hot;
    if (rows.length === 0) return [];
    const max = Math.max(...rows.map((r) => r.noms));
    const min = Math.min(...rows.map((r) => r.noms));
    const span = Math.max(1, max - min);
    return rows
      .map((r) => ({
        domain: r.domain,
        name: r.display_name,
        noms: r.noms,
        // sqrt keeps a 40-nomination company from dwarfing a 1-nomination one
        size: 15 + Math.round(17 * Math.sqrt((r.noms - min) / span)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));
  }, [board]);

  if (words.length === 0) return null;

  return (
    <ul className="cloud" aria-label="被提名的公司">
      {words.map((w) => (
        <li key={w.domain}>
          <span style={{ fontSize: `${w.size}px` }}>{w.name}</span>
          <small>{w.noms}</small>
        </li>
      ))}
    </ul>
  );
}
