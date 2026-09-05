export interface HealthPackage {
  id: string;
  name: string;
  slug: string;
  category: string;
  description: string;
  testIds: string[];
  mrp: number;
  sellingPrice: number;
  discount?: number;
  reportTat: string;
  homeCollection: boolean;
  gender?: "male" | "female" | "all";
  ageGroup?: string;
  labIds: string[];
  rating?: number;
  tag?: string;
  faq?: { question: string; answer: string }[];
  seoTitle?: string;
  seoDescription?: string;
  active: boolean;
  displayOrder?: number;
  updatedBy?: string; // uid of the admin who last edited this
  createdAt: unknown;
  updatedAt: unknown;
  /**
   * Internal purchase/fulfillment cost — STAFF-ONLY. Absent (undefined)
   * for every customer-facing read (packageService.ts queries the
   * packages_public view, which has no tp column at all — this isn't
   * a "don't render it" convention, the value is never in the response
   * to begin with). null means "staff added this package but hasn't
   * entered a cost yet" — never treat that the same as a real zero.
   */
  tp?: number | null;
  /**
   * Admin-set override for the "X Tests" figure shown on this
   * package's customer-facing card/detail page — e.g. a bundled panel
   * marketed as "70+ parameters" that doesn't map 1:1 to individually
   * cataloged `tests` rows. Present on every read (customer and
   * admin), unlike `tp`. null/undefined means "no override" — display
   * code should fall back to testIds.length, the real linked-tests
   * count, exactly like before this field existed.
   */
  testCountOverride?: number | null;
}
