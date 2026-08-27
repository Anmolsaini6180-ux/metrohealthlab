export interface Address {
  id: string;
  userId: string;
  label: string; // e.g. "Home", "Work"
  house: string;
  street: string;
  area: string;
  city: string;
  state: string;
  pincode: string;
  landmark?: string;
  isDefault?: boolean;
  createdAt: unknown;
  updatedAt: unknown;
}
