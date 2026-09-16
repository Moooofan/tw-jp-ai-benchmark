import type { CloudWord } from "@/lib/wordcloud";

/**
 * A compact keyword row under the reasons (owner, 2026-09-16): the memo's
 * 「整體日本市場 perception word cloud」 in one line rather than a whole section.
 */
export default function KeywordStrip({ words }: { words: CloudWord[] }) {
  if (words.length === 0) return null;
  return (
    <div className="kws">
      <span className="kws__k">大家怎麼看日本市場</span>
      <ul>
        {words.map((w) => (
          <li key={w.word}>
            {w.word}
            <small>{w.count}</small>
          </li>
        ))}
      </ul>
    </div>
  );
}
