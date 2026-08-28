export interface DiagnosticTest {
  id: string;
  name: string;
  shortName?: string;
  slug: string;
  categoryId: string;
  description: string;
  sampleType: string;
  fastingRequired: boolean;
  preparation?: string;
  homeCollection: boolean;
  centerCollection: boolean;
  reportTat: string; // e.g. "24 hours"
  mrp: number;
  sellingPrice: number;
  discount?: number;
  gender?: "male" | "female" | "all";
  ageGroup?: string;
  labIds: string[];
  faq?: { question: string; answer: string }[];
  seoTitle?: string;
  seoDescription?: string;
  active: boolean;
  displayOrder?: number;
  updatedBy?: string; // uid of the admin who last edited this
  createdAt: unknown;
  updatedAt: unknown;
}

export interface TestCategory {
  id: string;
  name: string;
  slug: string;
  /** Short line under the name on category cards, e.g. "Up to 70% off". */
  subtitle?: string;
  /**
   * Material Icons ligature name, e.g. "bloodtype" — the same icon
   * vocabulary the nav and empty states use. Optional fields are
   * *absent* from the Firestore document when unset; they are never
   * written as `undefined` (which the SDK rejects) or as an empty
   * string. Read them through normalizeIconName/CategoryIcon, since
   * older documents predate this field.
   */
  icon?: string;
  displayOrder?: number;
  active: boolean;
  updatedBy?: string;
}
