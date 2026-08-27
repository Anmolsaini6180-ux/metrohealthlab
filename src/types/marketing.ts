export type CampaignStatus = "DRAFT" | "SCHEDULED" | "RUNNING" | "PAUSED" | "COMPLETED";

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
  targetSegment?: string;
  createdBy: string;
  updatedBy?: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export type LeadStatus = "NEW" | "CONTACTED" | "CONVERTED" | "LOST";

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
