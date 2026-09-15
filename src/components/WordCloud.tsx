import type { CloudWord } from "@/lib/wordcloud";

const TONES = ["brand", "bright", "secondary"] as const;

/** Weighted CSS tag cloud (no library). Server component. */
export default function WordCloud({
  words,
  empty,
  label,
}: {
  words: CloudWord[];
  empty: string;
  label: string;
}) {
  if (words.length === 0) {
    return (
      <div className="cloud cloud--empty">
        <p>{empty}</p>
      </div>
    );
  }
  return (
    <ul className="cloud" aria-label={label}>
      {words.map((w) => (
        <li
          key={w.word}
          className={`cloud__w cloud__w--${TONES[w.tone]}`}
          style={{ fontSize: w.size }}
          title={`${w.word}：${w.count} 次`}
        >
          {w.word}
        </li>
      ))}
    </ul>
  );
}
