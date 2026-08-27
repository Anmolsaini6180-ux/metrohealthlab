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
}
