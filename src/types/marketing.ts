export type CampaignStatus = "DRAFT" | "SCHEDULED" | "RUNNING" | "PAUSED" | "COMPLETED";

export const CAMPAIGN_TYPES = ["WhatsApp", "Instagram", "Facebook", "Google", "Website", "Referral", "Offline", "Other"] as const;
export type CampaignType = (typeof CAMPAIGN_TYPES)[number];

export const GENDER_TARGETS = ["All", "Male", "Female", "Other"] as const;

export interface Campaign {
  id: string;
  name: string;
  description?: string;
  type: string;
  startAt: string;
  endAt: string;
  status: CampaignStatus;
  offerId?: string;
  couponId?: string;
  /** Free-text "target audience" description (e.g. "Existing customers, 3rd checkup reminder"). */
  targetSegment?: string;
  /** Real admin-entered ad spend for this campaign (INR). 0 until an admin sets it, never estimated. */
  spend: number;
  plannedBudget?: number;
  dailyBudget?: number;
  /** Targeting metadata for the admin's own planning — descriptive only, not read by any ROI/margin formula. */
  area?: string;
  ageGroup?: string;
  gender?: string;
  /** Free-text label, e.g. "Full Body Checkup package" — not a foreign key (see the schema migration's own comment for why). */
  targetOffering?: string;
  whatsappMessage?: string;
  ctaText?: string;
  ctaLink?: string;
  landingPage?: string;
  createdBy: string;
  updatedBy?: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export const LEAD_STATUSES = ["NEW", "CONTACTED", "INTERESTED", "FOLLOW_UP", "CONVERTED", "NOT_INTERESTED", "LOST"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  INTERESTED: "Interested",
  FOLLOW_UP: "Follow-up",
  CONVERTED: "Converted",
  NOT_INTERESTED: "Not Interested",
  LOST: "Lost",
};

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email?: string;
  source?: string;
  campaignId?: string;
  status: LeadStatus;
  assignedAdminId?: string;
  assignedSubAdminId?: string;
  assignedCollectionAgentId?: string;
  /** The real booking this lead turned into — set explicitly by an admin (see the schema migration's own comment); every campaign ROI figure is only ever as real as this link. */
  bookingId?: string;
  createdBy: string;
  updatedBy?: string;
  createdAt: unknown;
  updatedAt: unknown;
}

// Segments are computed, not stored documents — see
// adminSegmentService.ts. This just names the fixed set the spec asks
// for, since the underlying data (customers + their bookings) already
// exists and doesn't need a parallel collection duplicating it.
export type SegmentKey = "all" | "new" | "returning" | "inactive" | "couponUsers" | "noBooking";

export interface SegmentSummary {
  key: SegmentKey;
  label: string;
  criteria: string;
  count: number;
}
