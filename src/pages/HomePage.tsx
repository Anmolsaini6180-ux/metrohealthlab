import { useRealtimeQuery } from "@/hooks/useRealtimeQuery";
import { useBrandingSettings } from "@/hooks/useBrandingSettings";
import { subscribeToArticles, subscribeToBanners } from "@/services/contentService";
import { subscribeToTestCategories, subscribeToTests } from "@/services/testService";
import { subscribeToPackages } from "@/services/packageService";
import { subscribeToActiveLabs } from "@/services/labService";
import LoadingState from "@/components/common/LoadingState";
import CardGridSkeleton from "@/components/common/CardGridSkeleton";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import QuickCategories from "@/components/home/QuickCategories";
import HeroBanner from "@/components/home/HeroBanner";
import DoorstepPromo from "@/components/home/DoorstepPromo";
import PackageShowcase from "@/components/home/PackageShowcase";
import {
  DoorstepSteps,
  FamilyCareRow,
  FamilyHealthStory,
  FinalCta,
  HealthConcernGrid,
  HealthInsights,
  HomeCollectionStory,
  SeniorHealthStory,
  WhyChooseUs,
  isHealthConcern,
} from "@/components/home/HomeSections";
import type { DiagnosticTest } from "@/types/test";
import type { HealthPackage } from "@/types/package";
import type { Article } from "@/types/content";

// The customer landing page. Every section below is driven by real
// Firestore data through the same realtime subscriptions the rest of
// the site uses, so an admin edit appears here without a refresh, and
// a section with nothing to show removes itself rather than rendering
// an empty shell.
export default function HomePage() {
  const { settings } = useBrandingSettings();
  const banners = useRealtimeQuery(subscribeToBanners, []);
  const categories = useRealtimeQuery(subscribeToTestCategories, []);
  const tests = useRealtimeQuery<DiagnosticTest[]>((cb, err) => subscribeToTests({ max: 60 }, cb, err), []);
  const packages = useRealtimeQuery<HealthPackage[]>((cb, err) => subscribeToPackages(undefined, cb, err), []);
  const labs = useRealtimeQuery(subscribeToActiveLabs, []);
  const articles = useRealtimeQuery<Article[]>((cb, err) => subscribeToArticles(undefined, cb, err), []);

  const businessName = settings?.businessName ?? "Metro Health";
  const categoryList = categories.data ?? [];
  const testList = tests.data ?? [];

  // The two category rails show different things: services/modalities
  // up top, symptoms and conditions further down. When nothing matches
  // the concern list, everything stays in Quick Categories rather than
  // disappearing.
  const concernCategories = categoryList.filter(isHealthConcern);
  const quickCategories = concernCategories.length > 0 ? categoryList.filter((c) => !isHealthConcern(c)) : categoryList;

  return (
    <div className="mh-home">
      {/* ---- Hero ---- */}
      {banners.loading && <LoadingState rows={1} label="Loading offers..." />}
      {banners.error && <ErrorState message={banners.error} onRetry={banners.retry} />}
      {banners.data && <HeroBanner banners={banners.data} labCount={labs.data?.length ?? 0} />}

      {/* ---- Categories ---- */}
      {categories.loading && <LoadingState rows={1} label="Loading categories..." />}
      {categories.error && <ErrorState message={categories.error} onRetry={categories.retry} />}
      {tests.error && <ErrorState message={tests.error} onRetry={tests.retry} />}
      {categories.data && <QuickCategories categories={quickCategories} tests={testList} />}

      {/* ---- Doorstep reassurance ---- */}
      <DoorstepPromo />

      {/* ---- Packages ---- */}
      {packages.loading && <CardGridSkeleton count={3} variant="package" />}
      {packages.error && <ErrorState message={packages.error} onRetry={packages.retry} />}
      {packages.data && packages.data.length === 0 && (
        <EmptyState icon="inventory_2" title="No packages available yet" />
      )}
      {packages.data && packages.data.length > 0 && <PackageShowcase packages={packages.data} />}

      {/* ---- Health concerns ---- */}
      {categories.data && categories.data.length === 0 && (
        <EmptyState
          icon="category"
          title="No categories yet"
          description="Add testCategories in Firestore to populate this section."
        />
      )}
      {categories.data && <HealthConcernGrid categories={concernCategories} />}

      {/* ---- Family care ---- */}
      {categories.data && <FamilyCareRow categories={categoryList} />}

      {/* ---- Large visual storytelling — image comes only from Admin ->
          Media Library (site_sections); copy/CTA are real either way ---- */}
      <HomeCollectionStory />
      <FamilyHealthStory categories={categoryList} />
      <SeniorHealthStory categories={categoryList} />

      {/* ---- Static explainers ---- */}
      <DoorstepSteps />
      <WhyChooseUs businessName={businessName} />

      {/* ---- Articles ---- */}
      {articles.data && <HealthInsights articles={articles.data.slice(0, 8)} />}

      <FinalCta />
    </div>
  );
}
