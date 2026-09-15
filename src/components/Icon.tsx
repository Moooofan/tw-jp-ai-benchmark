import type { LucideIcon } from "lucide-react";

/**
 * The one icon treatment (spec v5): lucide line icons, stroke 1.5, brand
 * colour via `.ico`. 22px inline, 30px (`lg`) in card header rows. Always
 * decorative — every icon sits beside text that already says the same thing.
 */
export default function Icon({
  icon: Glyph,
  lg = false,
}: {
  icon: LucideIcon;
  lg?: boolean;
}) {
  return (
    <Glyph
      className={lg ? "ico ico--lg" : "ico"}
      size={lg ? 30 : 22}
      strokeWidth={1.5}
      aria-hidden="true"
      focusable="false"
    />
  );
}
