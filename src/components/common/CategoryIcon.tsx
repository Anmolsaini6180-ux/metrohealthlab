import { FALLBACK_CATEGORY_ICON, normalizeIconName } from "@/data/categoryIcons";

interface CategoryIconProps {
  /** Raw value straight off a Firestore document — may be missing, empty or junk. */
  iconName?: string | null;
  /** Pixel size of the glyph. Matches the `fontSize` used elsewhere with `.mi`. */
  size?: number;
  color?: string;
  /** Ligature to use when `iconName` is unusable. */
  fallback?: string;
  /**
   * Accessible label. Omitted by default because the icon almost always
   * sits next to the category name, where a second announcement of the
   * same thing is noise.
   */
  title?: string;
}

// One safe renderer for every category icon in the app — admin list,
// admin form preview, home page, health concerns.
//
// Category documents are user-authored and long-lived: some predate the
// icon field, some were written by the seed function, some may hold a
// value that is no longer a valid ligature. None of those may break a
// page, so the value is normalized first and swapped for a generic
// fallback when it cannot be rendered.
export default function CategoryIcon({
  iconName,
  size = 24,
  color,
  fallback = FALLBACK_CATEGORY_ICON,
  title,
}: CategoryIconProps) {
  const resolved = normalizeIconName(iconName) ?? normalizeIconName(fallback) ?? FALLBACK_CATEGORY_ICON;

  return (
    <span
      className="mi mi-safe"
      style={{ fontSize: size, color, width: size, height: size }}
      // Material Icons renders an unrecognised ligature as literal text.
      // `.mi-safe` clips that to the glyph box so a stale icon name can
      // never stretch a card or a table row.
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      title={title}
    >
      {resolved}
    </span>
  );
}
