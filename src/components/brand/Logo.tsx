import logoFull from "@/assets/brand/logo-full.png";
import logoIcon from "@/assets/brand/logo-icon.png";
import { useBrandingSettings } from "@/hooks/useBrandingSettings";

export type LogoVariant = "full" | "compact" | "icon";

interface LogoProps {
  variant?: LogoVariant;
  /** CSS height (width auto-scales via object-fit: contain). */
  height?: number;
  className?: string;
  /** Set false only for purely decorative placements next to visible brand text. */
  alt?: string;
}

// Single source of truth for the Metro Health Lab mark, and admin-
// controlled: if Branding Settings (/admin/settings/branding) has a
// logoUrl configured, every variant renders that (Storage-hosted)
// image via the shared realtime subscription in useBrandingSettings —
// change it in the admin panel and it updates here immediately, no
// redeploy. The bundled logo-full.png / logo-icon.png are the fallback
// used ONLY while no custom logoUrl has been set yet (this is the
// business's own real launch logo, not placeholder/demo art). There's
// currently a single logoUrl field, not per-variant crops, so once a
// custom logo is set it's used at every size via object-fit: contain
// rather than a dedicated icon-only crop.
export default function Logo({ variant = "full", height, className, alt }: LogoProps) {
  const { settings } = useBrandingSettings();
  const customSrc = settings?.logoUrl;
  const fallbackSrc = variant === "full" ? logoFull : logoIcon;
  const defaultHeight = variant === "full" ? 56 : variant === "compact" ? 36 : 28;

  return (
    <img
      src={customSrc || fallbackSrc}
      alt={alt ?? settings?.businessName ?? "Metro Health Lab"}
      className={className}
      style={{
        height: height ?? defaultHeight,
        width: "auto",
        objectFit: "contain",
        display: "block",
      }}
    />
  );
}
