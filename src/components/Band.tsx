import type { ReactNode } from "react";

/**
 * Every section on the public pages (spec v5): a brand `.band` header — gold-soft
 * English chip, white 900 heading, gold bottom rule — then the `.body` content.
 */
export default function Band({
  id,
  chip,
  title,
  bodyClass,
  children,
}: {
  id?: string;
  chip: string;
  title: ReactNode;
  /** Extra classes on `.body` (e.g. `two`, `grid g2`). */
  bodyClass?: string;
  children: ReactNode;
}) {
  return (
    <section id={id}>
      <div className="band">
        <span className="chip">{chip}</span>
        <h2>{title}</h2>
      </div>
      <div className={bodyClass ? `body ${bodyClass}` : "body"}>{children}</div>
    </section>
  );
}
