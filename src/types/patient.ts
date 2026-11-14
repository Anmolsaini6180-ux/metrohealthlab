export type PatientRelationship =
  | "self"
  | "father"
  | "mother"
  | "spouse"
  | "son"
  | "daughter"
  | "other";

export interface Patient {
  id: string;
  userId: string;
  name: string;
  relationship: PatientRelationship;
  dob: string; // ISO date
  gender: "male" | "female" | "other";
  createdAt: unknown;
  updatedAt: unknown;
}
