export interface ServiceArea {
  id: string;
  pincode: string;
  city: string;
  area?: string;
  homeCollectionAvailable: boolean;
  collectionFee: number;
  active: boolean;
  updatedBy?: string;
}

export interface CollectionCenter {
  id: string;
  labId: string;
  name: string;
  address: string;
  pincode: string;
  phone?: string;
  active: boolean;
}
