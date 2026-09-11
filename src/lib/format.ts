/**
 * Taipei-time (UTC+8) calendar parts. Fixed offset, so the server and the
 * browser always render the same string and hydration stays quiet.
 */
function tpe(iso: string): { m: number; d: number } | null {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const d = new Date(t + 8 * 3_600_000);
  return { m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}

/** `9 月 22 日`, or an empty string when the date is missing. */
export function monthDay(iso: string | null): string {
  if (!iso) return "";
  const p = tpe(iso);
  return p ? `${p.m} 月 ${p.d} 日` : "";
}

/** `9 月 22 日 – 10 月 5 日`, degrading gracefully when a bound is unset. */
export function dateRange(from: string | null, to: string | null): string {
  const a = monthDay(from);
  const b = monthDay(to);
  if (a && b) return `${a} – ${b}`;
  if (b) return `至 ${b}`;
  if (a) return `自 ${a}`;
  return "日期待定";
}

/** True while `now` sits inside [from, to]; an unset bound is open-ended. */
export function inWindow(
  from: string | null,
  to: string | null,
  now: number = Date.now(),
): boolean {
  if (from && new Date(from).getTime() > now) return false;
  if (to && new Date(to).getTime() < now) return false;
  return true;
}

/** Hour-granular relative time, e.g. 剛剛 / 3 小時前 / 2 天前. */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const hours = Math.floor((now - new Date(iso).getTime()) / 3_600_000);
  if (!Number.isFinite(hours) || hours < 1) return "剛剛";
  if (hours < 24) return `${hours} 小時前`;
  return `${Math.round(hours / 24)} 天前`;
}

/** Whole days left until `iso`, never negative. */
export function daysLeft(iso: string | null, now: number = Date.now()): number {
  if (!iso) return 0;
  const ms = new Date(iso).getTime() - now;
  if (!Number.isFinite(ms)) return 0;
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

/** Turns a Date into the value a <input type="datetime-local"> expects. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Minimal RFC-4180 CSV. */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const s = cell === null || cell === undefined ? "" : String(cell);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\r\n");
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(["﻿" + csv], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function stampToday(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}
