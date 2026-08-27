import { getStorage, type FirebaseStorage } from "firebase/storage";
import { getFirebaseApp } from "./config";

let storage: FirebaseStorage | null = null;

export function getStorageInstance(): FirebaseStorage {
  if (!storage) {
    storage = getStorage(getFirebaseApp());
  }
  return storage;
}
