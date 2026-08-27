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
  icon?: string;
  displayOrder?: number;
  active: boolean;
  updatedBy?: string;
}
