import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { Banner } from "@/types/content";

interface Props {
  banners: Banner[];
  /** Real count of active labs — drives the "Trusted Labs" chip. */
  labCount: number;
}

// A specific, real, freely-licensed (Unsplash License — free for
// commercial use, no attribution required) photo, not a random/
// rotating stock feed: a gloved hand holding a blood-collection tube.
// Verified on unsplash.com/photos/fKC9eWRnlGY before use. This is
// generic healthcare stock photography used as page furniture — same
// as virtually every diagnostics site uses before commissioning its
// own photography — not a claim that this is Metro Health Lab's own
// staff or facility.
const FALLBACK_HERO_IMAGE =
  "https://images.unsplash.com/photo-1639772823849-6efbd173043c?auto=format&fit=crop&w=1200&q=75";

// The landing hero. Each slide is an admin-authored `banners` row, so
// copy and links stay editable from Admin -> Banners exactly as before.
//
// IMAGERY: a banner renders its own `imageUrl` when the admin has
// uploaded one (Admin -> Banners -> image, via the existing Cloudinary
// uploader) — that always wins, and the moment a real image is
// uploaded it takes the fallback's place with no code change. Until
// then this shows real (licensed) healthcare photography rather than a
// gradient/icon panel, matching the reference design's use of
// photography in this exact spot. The photo is a full-bleed background
// across the whole card (mh-hero__bg, position: absolute, behind a
// readable gradient overlay) — not a small side panel — with the copy
// and feature chips layered on top.
//
// The three feature chips are value props this product genuinely
// delivers, and the lab count is the real number of active labs rather
// than a hardcoded marketing figure.
export default function HeroBanner({ banners, labCount }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const stepSize = useCallback(() => {
    const track = trackRef.current;
    const first = track?.firstElementChild as HTMLElement | null;
    if (!track || !first) return 1;
    const gap = parseFloat(getComputedStyle(track).columnGap || "0") || 0;
    return Math.max(first.getBoundingClientRect().width + gap, 1);
  }, []);

  const handleScroll = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const index = Math.round(track.scrollLeft / stepSize());
    setActive(Math.min(Math.max(index, 0), banners.length - 1));
  }, [banners.length, stepSize]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    track.addEventListener("scroll", handleScroll, { passive: true });
    return () => track.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  function goTo(index: number) {
    const track = trackRef.current;
    if (!track) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    track.scrollTo({ left: index * stepSize(), behavior: reduced ? "auto" : "smooth" });
  }

  if (banners.length === 0) return null;

  return (
    <section className="mh-hero-section" aria-label="Featured">
      <div className="mh-hero-track" ref={trackRef}>
        {banners.map((b) => (
          <article key={b.id} className="mh-hero">
            {/* Full-bleed background layer — the photo now covers the
                WHOLE card, not a small side panel, per the explicit
                "full banner, not just image area" requirement. Purely
                decorative (the title/subtitle carry the meaning), so
                alt stays empty rather than describing generic stock
                photography as if it depicted this business's own
                staff or facility. */}
            <img className="mh-hero__bg" src={b.imageUrl || FALLBACK_HERO_IMAGE} alt="" loading="lazy" />
            <div className="mh-hero__overlay" aria-hidden="true" />

            <div className="mh-hero__body">
              <h2 className="mh-hero__title">{b.title}</h2>
              {b.subtitle && <p className="mh-hero__subtitle">{b.subtitle}</p>}
              {b.ctaLabel && b.ctaLink && (
                <Link className="mh-hero__cta" to={b.ctaLink}>
                  {b.ctaLabel}
                  <span className="mi" aria-hidden="true">arrow_forward</span>
                </Link>
              )}
            </div>

            <div className="mh-hero__aside">
              <ul className="mh-hero__features">
                <li>
                  <span className="mi" aria-hidden="true">home_health</span>
                  <span>
                    <strong>Home Collection</strong>
                    <em>At your doorstep</em>
                  </span>
                </li>
                <li>
                  <span className="mi" aria-hidden="true">description</span>
                  <span>
                    <strong>Digital Reports</strong>
                    <em>Fast &amp; secure</em>
                  </span>
                </li>
                {labCount > 0 && (
                  <li>
                    <span className="mi" aria-hidden="true">verified</span>
                    <span>
                      <strong>{labCount} Trusted Labs</strong>
                      <em>Compare &amp; choose</em>
                    </span>
                  </li>
                )}
              </ul>
            </div>
          </article>
        ))}
      </div>

      {banners.length > 1 && (
        <div className="mh-hero-dots">
          {banners.map((b, i) => (
            <button
              key={b.id}
              type="button"
              className={i === active ? "is-active" : undefined}
              aria-label={`Go to slide ${i + 1}: ${b.title}`}
              aria-current={i === active}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
