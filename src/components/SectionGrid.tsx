import type { ReactNode } from "react";

/**
 * THE spine. Every section on `/`, `/nominate` and `/vote` is this one grid:
 * a 300px column for the number + heading + lede, 48px of gutter, and a single
 * content column. Sections never add margins of their own — the rhythm
 * (64px, 2px ink rule, 16px) lives here and nowhere else.
 */
export default function Section({
  id,
  num,
  title,
  lede,
  aside,
  sticky = false,
  narrow = false,
  children,
}: {
  id?: string;
  num?: string;
  title: string;
  lede?: ReactNode;
  /** Extra material for the left column, under the heading. */
  aside?: ReactNode;
  sticky?: boolean;
  /** 640px content column instead of 720px (forms). */
  narrow?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="sec" id={id}>
      <div className="sec__grid">
        <div className={sticky ? "sec__side sec__side--sticky" : "sec__side"}>
          {num ? <span className="sec__num">{num}</span> : null}
          <h2 className="sec__h">{title}</h2>
          {lede ? <p className="sec__lede">{lede}</p> : null}
          {aside}
        </div>
        <div className={narrow ? "sec__body sec__body--narrow" : "sec__body"}>
          {children}
        </div>
      </div>
    </section>
  );
}
