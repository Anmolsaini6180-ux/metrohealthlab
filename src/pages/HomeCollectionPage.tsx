import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useBrandingSettings } from "@/hooks/useBrandingSettings";
import { useRealtimeQuery } from "@/hooks/useRealtimeQuery";
import { useAsync } from "@/hooks/useAsync";
import { subscribeToPackages } from "@/services/packageService";
import { getAssignedMediaMap } from "@/services/mediaService";
import { checkServiceability } from "@/services/serviceabilityService";
import { formatCurrencyInr } from "@/services/pricingService";
import { DOORSTEP_STEPS, WhyChooseUs } from "@/components/home/HomeSections";
import PackageCard from "@/components/common/PackageCard";
import CardGridSkeleton from "@/components/common/CardGridSkeleton";
import Seo from "@/components/common/Seo";
import { buildBreadcrumbSchema } from "@/utils/seoSchema";
import type { HealthPackage } from "@/types/package";
import type { ServiceArea } from "@/types/serviceArea";

type CheckState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "found"; area: ServiceArea }
  | { status: "not-found" }
  | { status: "error"; message: string };

export default function HomeCollectionPage() {
  const { settings } = useBrandingSettings();
  const businessName = settings?.businessName ?? "Metro Health Lab";

  const [pincode, setPincode] = useState("");
  const [check, setCheck] = useState<CheckState>({ status: "idle" });

  async function handleCheck() {
    const trimmed = pincode.trim();
    if (!trimmed) return;
    setCheck({ status: "checking" });
    try {
      const area = await checkServiceability(trimmed);
      setCheck(area && area.homeCollectionAvailable ? { status: "found", area } : { status: "not-found" });
    } catch {
      setCheck({ status: "error", message: "Couldn't check that pincode right now. Please try again." });
    }
  }

  const packages = useRealtimeQuery<HealthPackage[]>((cb, err) => subscribeToPackages(undefined, cb, err), []);
  const homeCollectionPackages = useMemo(
    () => (packages.data ?? []).filter((p) => p.homeCollection).slice(0, 8),
    [packages.data]
  );
  const packageIds = useMemo(() => homeCollectionPackages.map((p) => p.id), [homeCollectionPackages]);
  const images = useAsync(() => getAssignedMediaMap("packages", packageIds), [packageIds.join(",")]);

  return (
    <div className="mh2-hc">
      <Seo
        title="Home Sample Collection — Book a Visit"
        description="Book a diagnostic test or health checkup with home sample collection from Metro Health Lab. Check serviceability in your area and get your report digitally."
        path="/home-collection"
        jsonLd={buildBreadcrumbSchema([{ name: "Home", path: "/" }, { name: "Home Collection", path: "/home-collection" }])}
      />

      <section className="mh2-hc-hero">
        <div className="mh2-hc-hero__copy">
          <p className="mh2-hc-hero__eyebrow">Home Sample Collection</p>
          <h1 className="mh2-hc-hero__title">Healthcare at Your Doorstep</h1>
          <p className="mh2-hc-hero__sub">
            Safe, reliable &amp; hassle-free diagnostics. Choose a convenient date and time, and our
            collection team can visit your preferred location wherever home collection is available —
            no travel, no waiting rooms.
          </p>
          <Link className="mh2-btn mh2-btn--primary" to="/packages">
            Book Home Collection
          </Link>
        </div>
        <div className="mh2-hc-hero__art" aria-hidden="true">
          <span className="mi mi-safe" style={{ fontSize: 56, width: 56, height: 56 }}>home_health</span>
        </div>
      </section>

      <section className="mh2-hc-check">
        <h2 className="mh-section-title">Check if we collect in your area</h2>
        <div className="mh2-hc-check__row">
          <input
            value={pincode}
            onChange={(e) => {
              setPincode(e.target.value);
              setCheck({ status: "idle" });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCheck();
            }}
            placeholder="Enter your pincode"
            inputMode="numeric"
            className="mh2-hc-check__input"
          />
          <button className="mh2-btn mh2-btn--primary" onClick={handleCheck} disabled={check.status === "checking" || !pincode.trim()}>
            {check.status === "checking" ? "Checking..." : "Check"}
          </button>
        </div>

        {check.status === "found" && (
          <p className="mh2-hc-check__msg is-success">
            <span className="mi" aria-hidden="true">check_circle</span>
            Home collection is available in your area
            {check.area.collectionFee > 0 ? ` — collection fee ${formatCurrencyInr(check.area.collectionFee)}.` : ", at no extra fee."}
          </p>
        )}
        {check.status === "not-found" && (
          <p className="mh2-hc-check__msg is-danger">
            <span className="mi" aria-hidden="true">error</span>
            Home collection isn't available in your area yet — you're welcome to visit a partner center instead.
          </p>
        )}
        {check.status === "error" && <p className="mh2-hc-check__msg is-danger">{check.message}</p>}
      </section>

      <section className="mh2-hc-steps">
        <h2 className="mh-section-title">How it works</h2>
        <ol className="mh2-hc-steps__list">
          {DOORSTEP_STEPS.map((step, i) => (
            <li key={step} className="mh2-hc-steps__item">
              <span className="mh2-hc-steps__num">{i + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </section>

      {packages.loading && <CardGridSkeleton count={4} variant="package" />}
      {!packages.loading && homeCollectionPackages.length > 0 && (
        <section className="mh2-pkg-section">
          <div className="mh-section-head">
            <div>
              <h2 className="mh-section-title">Popular for Home Collection</h2>
              <p className="mh-section-subtitle">Book any of these with doorstep sample pickup</p>
            </div>
            <Link to="/packages" className="mh-section-link">
              View all
            </Link>
          </div>
          <div className="mh2-pkg-grid" role="list">
            {homeCollectionPackages.map((p) => (
              <PackageCard key={p.id} pkg={p} imageUrl={images.data?.get(p.id)?.secureUrl} />
            ))}
          </div>
        </section>
      )}

      <WhyChooseUs businessName={businessName} />
    </div>
  );
}
