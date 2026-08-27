export interface Slot {
  id: string;
  date: string; // ISO date, e.g. 2026-08-20
  startTime: string; // "08:00"
  endTime: string; // "10:00"
  areaId: string;
  collectionType: "home" | "center";
  capacity: number;
  bookedCount: number;
  active: boolean;
  updatedBy?: string;
  createdAt: unknown;
  updatedAt: unknown;
}
