/**
 * Weighted tag cloud from reason texts (spec v7b §1.6). Server-side only:
 * `Intl.Segmenter('zh-Hant')` word segmentation, a stop-word list, top 60
 * words, font size by sqrt(count) between 14px and 52px.
 */

const ZH_STOP =
  "的 了 是 在 和 與 也 很 都 就 而 及 或 讓 被 把 對 為 這 那 有 沒有 一個 我們 他們 公司 台灣 日本 市場 可以 因為 所以 非常 真的 已經 還是 以及 其中 透過 進入 發展 新創 覺得 認為";

const EN_STOP =
  "the and for with that this from are was were has have had not but you your our their they them its into over more most very can will just than then also about which what when where who how all any been being such only other some";

const STOP = new Set([...ZH_STOP.split(" "), ...EN_STOP.split(" ")]);

export const CLOUD_MIN_PX = 14;
export const CLOUD_MAX_PX = 52;
const TOP = 60;

export type CloudWord = {
  word: string;
  count: number;
  /** Font size in px. */
  size: number;
  /** 0 brand, 1 bright, 2 secondary. */
  tone: 0 | 1 | 2;
};

const LATIN = /^[\p{Script=Latin}\p{N}]/u;
const DIGITS = /^\p{N}+$/u;

export function tokenize(text: string, seg: Intl.Segmenter): string[] {
  const out: string[] = [];
  for (const s of seg.segment(text)) {
    if (!s.isWordLike) continue;
    const raw = s.segment.trim();
    if (!raw || DIGITS.test(raw)) continue;
    const latin = LATIN.test(raw);
    const word = latin ? raw.toLowerCase() : raw;
    const len = [...word].length;
    if (latin ? len < 3 : len < 2) continue;
    if (STOP.has(word)) continue;
    out.push(word);
  }
  return out;
}

/** Small stable string hash, used to scatter big and small words. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function wordCloud(corpus: string[], top = TOP): CloudWord[] {
  const seg = new Intl.Segmenter("zh-Hant", { granularity: "word" });
  const counts = new Map<string, number>();
  for (const text of corpus) {
    for (const w of tokenize(text, seg)) counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  const ranked = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-Hant"))
    .slice(0, top);
  if (ranked.length === 0) return [];

  const hi = Math.sqrt(ranked[0][1]);
  const lo = Math.sqrt(ranked[ranked.length - 1][1]);
  const span = CLOUD_MAX_PX - CLOUD_MIN_PX;
  return ranked
    .map(([word, count], i) => ({
      word,
      count,
      size:
        hi === lo
          ? Math.round(CLOUD_MIN_PX + span * 0.35)
          : Math.round(CLOUD_MIN_PX + (span * (Math.sqrt(count) - lo)) / (hi - lo)),
      tone: (i % 3) as 0 | 1 | 2,
    }))
    .sort((a, b) => hash(a.word) - hash(b.word));
}
