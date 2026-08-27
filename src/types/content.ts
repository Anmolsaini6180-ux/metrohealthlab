export interface Article {
  id: string;
  title: string;
  slug: string;
  categoryId?: string;
  excerpt: string;
  body: string;
  coverImage?: string;
  seoTitle?: string;
  seoDescription?: string;
  active: boolean;
  publishedAt: unknown;
  updatedBy?: string;
}

export interface ArticleCategory {
  id: string;
  name: string;
  slug: string;
}

export interface Faq {
  id: string;
  question: string;
  answer: string;
  topic?: string;
  displayOrder?: number;
}

export interface Banner {
  id: string;
  title: string;
  subtitle?: string;
  ctaLabel?: string;
  ctaLink?: string;
  imageUrl?: string;
  startAt?: string;
  endAt?: string;
  active: boolean;
  displayOrder?: number;
  updatedBy?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Offer {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  discountType?: "flat" | "percentage";
  discountValue?: number;
  couponCode?: string;
  imageUrl?: string;
  startAt?: string;
  endAt?: string;
  active: boolean;
  featured?: boolean;
  displayOrder?: number;
  updatedBy?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}
