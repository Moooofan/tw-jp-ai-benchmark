import type { ReactNode } from "react";

/**
 * THE spine. Every section on `/`, `/nominate` and `/vote` is this one grid:
 * a 300px column for the number + heading (+ one short line), 48px of gutter,
 * and a single content column. Sections never add margins of their own — the
 * rhythm (96px, 2px ink rule, 24px, 20px between blocks) lives here and in
 * `.sec__body`'s gap, nowhere else.
 *
 * Spec v4 §A1: the left column carries ONLY the number, the heading and at
 * most one short line (~20 CJK characters). Running paragraphs go in
 * `children`, i.e. the right column.
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
  /** One short line (≤ ~20 CJK characters). Paragraphs belong in children. */
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
