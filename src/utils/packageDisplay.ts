import type { HealthPackage } from "@/types/package";

/**
 * The "X Tests" figure to show on a package's card/detail page: the
 * admin's override when one is set (e.g. a bundled panel marketed as
 * "70+ parameters" that doesn't map 1:1 to individually cataloged
 * tests), otherwise the real number of linked tests — never a value
 * the code invented on its own.
 */
export function displayedTestCount(pkg: Pick<HealthPackage, "testIds" | "testCountOverride">): number {
  return pkg.testCountOverride ?? pkg.testIds.length;
}
