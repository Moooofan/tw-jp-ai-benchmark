import { Fragment } from "react";

/**
 * Chinese wraps at any character, so a long sentence in a narrow measure breaks
 * mid-phrase (「而／是它做對了」). Splitting on punctuation and keeping each clause
 * unbreakable means a line can only end where the sentence itself pauses.
 *
 * Only short clauses are held together: a long one pinned to a single line would
 * outrun a phone's width and scroll the page sideways.
 */
const MAX_UNBREAKABLE = 12;
export default function Phrases({ children }: { children: string }) {
  const parts = children.match(/[^，、。：；！？]+[，、。：；！？]*/g) ?? [children];
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {part.length > MAX_UNBREAKABLE ? (
            part
          ) : (
            <span className="nowrap">{part}</span>
          )}
          <wbr />
        </Fragment>
      ))}
    </>
  );
}
