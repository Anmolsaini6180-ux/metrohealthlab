// Type declarations for testAdmin.mjs, so the Supabase test suite
// under src/supabase/*.test.ts typechecks against real signatures
// instead of implicit `any`.
export declare function createConfirmedTestUser(email: string, password: string): Promise<string>;
export declare function deleteTestUser(userId: string): Promise<void>;
export declare function upsertTestProfile(row: Record<string, unknown>): Promise<void>;
export declare function insertTestStaffRole(row: Record<string, unknown>): Promise<void>;
export declare function deleteTestStaffRole(userId: string): Promise<void>;
export declare function readMasterAdminUid(): Promise<string | null>;
