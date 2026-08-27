import { callFunction } from "@/firebase/functions";

export interface SeedResult {
  ok: true;
  categoriesCreated: number;
  labsCreated: number;
  testsCreated: number;
  packagesCreated: number;
  bannersCreated: number;
  couponsCreated: number;
  serviceAreasCreated: number;
  slotsCreated: number;
  articlesCreated: number;
  offersCreated: number;
}

// SUPER_ADMIN-only, and the function itself permanently refuses to run
// a second time once it succeeds — see functions/src/seedStarterCatalog.ts.
export async function seedStarterCatalog(): Promise<SeedResult> {
  return callFunction<Record<string, never>, SeedResult>("seedStarterCatalog", {});
}
