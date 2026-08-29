import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { Banner } from "@/types/content";

interface Props {
  banners: Banner[];
}

// Four rotating surface treatments, applied by position so consecutive
// banners never look identical. Admins control copy and links, not
// colour — keeping the palette here is what stops the carousel drifting
// away from the brand.
const SURFACES = ["is-primary", "is-ink", "is-accent", "is-deep"] as const;

export default function BannerCarousel({ banners }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  // Distance from one card's start to the next. The cards are narrower
  // than the track (the next one peeks in from the right), so this has
  // to be measured from the rendered card plus the flex gap — using the
  // track width instead would drift further out of step on every slide.
  const stepSize = useCallback(() => {
    const track = trackRef.current;
    const first = track?.firstElementChild as HTMLElement | null;
    if (!track || !first) return 1;
    const gap = parseFloat(getComputedStyle(track).columnGap || "0") || 0;
    return Math.max(first.getBoundingClientRect().width + gap, 1);
  }, []);

  // Derive the active dot from real scroll position rather than
  // tracking it separately, so a swipe and a dot tap can never disagree.
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
    // Honour the same reduced-motion preference the stylesheet does,
    // rather than animating a scroll for someone who asked us not to.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    track.scrollTo({ left: index * stepSize(), behavior: reduced ? "auto" : "smooth" });
  }

  if (banners.length === 0) return null;

  return (
    <section aria-label="Offers">
      <div className="mh-banner-track" ref={trackRef}>
        {banners.map((b, i) => (
          <article key={b.id} className={`mh-banner ${SURFACES[i % SURFACES.length]}`}>
            <h3 className="mh-banner__title">{b.title}</h3>
            {b.subtitle && <p className="mh-banner__subtitle">{b.subtitle}</p>}
            {b.ctaLabel && b.ctaLink && (
              <Link className="mh-banner__cta" to={b.ctaLink}>
                {b.ctaLabel}
              </Link>
            )}
          </article>
        ))}
      </div>

      {banners.length > 1 && (
        <div className="mh-banner-dots">
          {banners.map((b, i) => (
            <button
              key={b.id}
              type="button"
              className={i === active ? "is-active" : undefined}
              aria-label={`Go to offer ${i + 1}: ${b.title}`}
              aria-current={i === active}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
