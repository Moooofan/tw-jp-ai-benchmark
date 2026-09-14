import type { LucideIcon } from "lucide-react";

/**
 * The ONE icon treatment on the public site (spec v4 §B): lucide line icons,
 * 20px inline (24px only for the four step cards), 1.5px absolute stroke,
 * brand colour via `.ico`, always decorative — every icon sits beside text
 * that already says the same thing.
 */
export default function Icon({
  icon: Glyph,
  size = 20,
}: {
  icon: LucideIcon;
  size?: 20 | 24;
}) {
  return (
    <Glyph
      className="ico"
      size={size}
      strokeWidth={1.5}
      absoluteStrokeWidth
      aria-hidden="true"
      focusable="false"
    />
  );
}
