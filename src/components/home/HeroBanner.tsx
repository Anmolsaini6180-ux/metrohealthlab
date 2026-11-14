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
// Verified on unsplash.com/photos/fKC9eWRnlGY before use. Generic
// healthcare stock photography used as page furniture until the admin
// uploads real photography — same as virtually every diagnostics site
// uses before commissioning its own — never a claim that this is
// Metro Health Lab's own staff or facility.
const FALLBACK_HERO_IMAGE =
  "https://images.unsplash.com/photo-1639772823849-6efbd173043c?auto=format&fit=crop&w=1200&q=75";

// Design system v2 hero — a clean two-column composition (copy left,
// photo right on desktop; stacked on mobile) replacing the previous
// version's text-over-photo treatment, where an admin's own uploaded
// image (which may already carry its own logo/text baked in) fought
// with the overlay copy for legibility. Real trust signals now sit in
// a plain row beneath the copy instead of floating cards layered on
// top of the photo.
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
    <section className="mh2-hero-section" aria-label="Featured">
      <div className="mh2-hero-track" ref={trackRef}>
        {banners.map((b) => (
          <HeroSlide key={b.id} banner={b} labCount={labCount} />
        ))}
      </div>

      {banners.length > 1 && (
        <div className="mh2-hero-dots">
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

function HeroSlide({ banner: b, labCount }: { banner: Banner; labCount: number }) {
  const imageUrl = b.imageUrl || FALLBACK_HERO_IMAGE;

  return (
    <article className="mh2-hero">
      <div className="mh2-hero__copy">
        <span className="mh2-hero__eyebrow">Trusted Diagnostics, Made Simple</span>
        <h1 className="mh2-hero__title">{b.title}</h1>
        {b.subtitle && <p className="mh2-hero__subtitle">{b.subtitle}</p>}

        <div className="mh2-hero__ctas">
          {b.ctaLabel && b.ctaLink ? (
            <Link className="mh2-btn mh2-btn--primary mh2-btn--lg" to={b.ctaLink}>
              {b.ctaLabel}
              <span className="mi" aria-hidden="true">arrow_forward</span>
            </Link>
          ) : (
            <Link className="mh2-btn mh2-btn--primary mh2-btn--lg" to="/tests">
              Book a Test
              <span className="mi" aria-hidden="true">arrow_forward</span>
            </Link>
          )}
          <Link className="mh2-btn mh2-btn--outline mh2-btn--lg" to="/packages">
            Explore Packages
          </Link>
        </div>

        <ul className="mh2-hero__trust-row">
          <li>
            <span className="mi" aria-hidden="true">home_health</span>
            Home Collection
          </li>
          <li>
            <span className="mi" aria-hidden="true">description</span>
            Digital Reports
          </li>
          {labCount > 0 && (
            <li>
              <span className="mi" aria-hidden="true">verified</span>
              {labCount} Trusted Lab{labCount === 1 ? "" : "s"}
            </li>
          )}
        </ul>
      </div>

      <div className="mh2-hero__media">
        {/* Purely decorative — the title/subtitle carry the meaning, and
            an admin's own uploaded creative may already contain its
            own embedded text/logo, so this is never described as if
            it depicted specific staff or facilities. */}
        <img className="mh2-hero__image" src={imageUrl} alt="" loading="eager" />
      </div>
    </article>
  );
}
