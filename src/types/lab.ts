export interface Lab {
  id: string;
  name: string;
  logo?: string;
  description?: string;
  address?: string;
  phone?: string;
  email?: string;
  serviceAreas: string[];
  testIds: string[];
  packageIds: string[];
  updatedBy?: string; // uid of the admin who last edited this
  active: boolean;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface LabPricing {
  id: string;
  labId: string;
  testId?: string;
  packageId?: string;
  price: number;
  mrp: number;
  collectionType: "home" | "center" | "both";
  reportTat: string;
  active: boolean;
  updatedBy?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}
