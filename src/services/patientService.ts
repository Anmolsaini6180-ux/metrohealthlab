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
} from "firebase/firestore";
import { getDb } from "@/firebase/firestore";
import type { Patient } from "@/types/patient";

const PATIENTS = "patients";

export async function getPatients(userId: string): Promise<Patient[]> {
  const q = query(collection(getDb(), PATIENTS), where("userId", "==", userId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Patient));
}

export async function addPatient(
  userId: string,
  data: Omit<Patient, "id" | "userId" | "createdAt" | "updatedAt">
): Promise<string> {
  const ref = await addDoc(collection(getDb(), PATIENTS), {
    ...data,
    userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updatePatient(
  patientId: string,
  data: Partial<Omit<Patient, "id" | "userId" | "createdAt">>
): Promise<void> {
  await updateDoc(doc(getDb(), PATIENTS, patientId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deletePatient(patientId: string): Promise<void> {
  await deleteDoc(doc(getDb(), PATIENTS, patientId));
}
