import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { getDb } from "@/firebase/firestore";
import type { Address } from "@/types/address";

const ADDRESSES = "addresses";

export async function getAddresses(userId: string): Promise<Address[]> {
  const q = query(collection(getDb(), ADDRESSES), where("userId", "==", userId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Address));
}

export async function addAddress(
  userId: string,
  data: Omit<Address, "id" | "userId" | "createdAt" | "updatedAt">
): Promise<string> {
  const ref = await addDoc(collection(getDb(), ADDRESSES), {
    ...data,
    userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateAddress(
  addressId: string,
  data: Partial<Omit<Address, "id" | "userId" | "createdAt">>
): Promise<void> {
  await updateDoc(doc(getDb(), ADDRESSES, addressId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteAddress(addressId: string): Promise<void> {
  await deleteDoc(doc(getDb(), ADDRESSES, addressId));
}

export async function setDefaultAddress(userId: string, addressId: string): Promise<void> {
  const all = await getAddresses(userId);
  const batch = writeBatch(getDb());
  for (const addr of all) {
    batch.update(doc(getDb(), ADDRESSES, addr.id), { isDefault: addr.id === addressId });
  }
  await batch.commit();
}
