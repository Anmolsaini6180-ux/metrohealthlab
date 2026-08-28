import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import type { User } from "firebase/auth";
import { getDb } from "@/firebase/firestore";
import { buildStaffContext } from "@/utils/roleAccess";
import { firebaseErrorCode } from "@/utils/authErrors";
import type { StaffContext } from "@/types/team";

// ============================================================
// Role resolution on the Firebase Spark (free) plan.
//
// There are no Cloud Functions and therefore no custom claims, so a
// signed-in account's role is read from Firestore:
//
//   system/config.masterAdminUid  -> the single root authority,
//                                    created by the project owner in
//                                    the Firebase Console. No client
//                                    can write it (firestore.rules).
//   users/{uid}.role/.status      -> every other staff assignment,
//                                    writable only by a higher-ranked
//                                    staff member, and only through
//                                    the narrow rule in firestore.rules.
//
// Nothing here is a security decision. These reads tell the UI what to
// render; the same two documents are read again by the security rules
// on every request, which is what actually allows or denies it. A user
// who patches this file in devtools changes what their own browser
// draws and nothing else.
// ============================================================

const USERS = "users";
const SYSTEM = "system";
const CONFIG_DOC = "config";
const USER_EMAILS = "userEmails";

export interface SystemConfig {
  masterAdminUid: string;
}

// The authorization-relevant shape of a users/{uid} document. Typed as
// `unknown` where the value is untrusted input from another writer, so
// nothing downstream can treat a stray string as a role by accident.
export interface StaffRecordData {
  uid?: string;
  name?: string;
  email?: string;
  phone?: string;
  role?: unknown;
  status?: unknown;
  superAdminId?: string;
  adminId?: string;
  subAdminId?: string;
}

// Raised when an authorization document could not be READ at all.
//
// Deliberately distinct from "the record says you have no role". Both
// fail closed — neither one grants anything — but only one of them is
// a bug. Collapsing the two is what made a denied rule, a dropped
// connection and a genuinely unauthorized account all surface as the
// same "not authorized for admin access" message.
export class StaffLookupError extends Error {
  readonly code: string;
  readonly source: string;
  readonly reason: unknown;
  constructor(source: string, reason: unknown) {
    const code = firebaseErrorCode(reason) || "unknown";
    super(`Could not read ${source} (${code}).`);
    this.name = "StaffLookupError";
    this.code = code;
    this.source = source;
    this.reason = reason;
  }
}

// Reads the bootstrap document. A missing document is a normal,
// expected state (the project has not been bootstrapped yet) and
// resolves to an empty master uid — the app still works, there is
// simply no super admin. A document that cannot be read AT ALL is a
// different case and throws (see StaffLookupError above).
export async function getSystemConfig(): Promise<SystemConfig> {
  try {
    const snap = await getDoc(doc(getDb(), SYSTEM, CONFIG_DOC));
    // A MISSING document is a normal, expected state — the project has
    // not been bootstrapped yet, so there is simply no super admin.
    const masterAdminUid = snap.exists() ? (snap.data().masterAdminUid as string | undefined) : undefined;
    return { masterAdminUid: typeof masterAdminUid === "string" ? masterAdminUid : "" };
  } catch (err) {
    // A FAILED read is a different thing entirely, and used to be
    // swallowed into that same empty result — which is why a denied
    // rule or a dropped connection was indistinguishable from "you are
    // not an admin". This still fails closed: throwing grants nothing,
    // and every caller treats a throw as "no role". The only thing
    // that changes is that the real cause now reaches the console.
    throw new StaffLookupError("system/config", err);
  }
}

export async function getStaffRecord(uid: string): Promise<StaffRecordData | null> {
  try {
    const snap = await getDoc(doc(getDb(), USERS, uid));
    return snap.exists() ? (snap.data() as StaffRecordData) : null;
  } catch (err) {
    throw new StaffLookupError("users/{uid}", err);
  }
}

// The master account's own users/{uid} document. firestore.rules lets
// exactly one uid — the one in system/config — write this, and only
// with role SUPER_ADMIN / status active / an empty ownership chain. It
// exists so the master appears in the staff directory and so the rest
// of the app can treat every staff member uniformly; the master's
// authority itself comes from system/config either way.
async function ensureMasterRecord(user: User): Promise<void> {
  await setDoc(
    doc(getDb(), USERS, user.uid),
    {
      uid: user.uid,
      role: "SUPER_ADMIN",
      status: "active",
      superAdminId: "",
      adminId: "",
      subAdminId: "",
      ...(user.email ? { email: user.email } : {}),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

// Sessions that have already published their email -> uid mapping, so
// an ordinary page navigation doesn't rewrite it every time.
const publishedEmails = new Set<string>();

// Publishes users' own verified email -> uid mapping so a staff
// manager can grant a role by email address without being able to
// enumerate the users collection. Rules only accept this write from
// the owner of that verified email, for their own uid, so nobody can
// point somebody else's address at their account.
export async function publishEmailDirectoryEntry(user: User): Promise<void> {
  const email = user.email?.trim().toLowerCase();
  if (!email || !user.emailVerified) return;
  if (publishedEmails.has(`${user.uid}:${email}`)) return;
  try {
    await setDoc(
      doc(getDb(), USER_EMAILS, email),
      { uid: user.uid, email, updatedAt: serverTimestamp() },
      { merge: true }
    );
    publishedEmails.add(`${user.uid}:${email}`);
  } catch {
    // Non-fatal: it only affects whether an admin can find this person
    // by email later. Never block sign-in on it.
  }
}

// Looks up the account a staff role should be granted to. Returns null
// when nobody has signed in with that address yet — in the Spark model
// a role is always granted to a real, existing account, never to an
// email that may or may not become one.
export async function lookupUidByEmail(email: string): Promise<string | null> {
  const key = email.trim().toLowerCase();
  if (!key) return null;
  const snap = await getDoc(doc(getDb(), USER_EMAILS, key));
  if (!snap.exists()) return null;
  const uid = snap.data().uid;
  return typeof uid === "string" && uid ? uid : null;
}

// Resolves everything the UI needs to know about the signed-in
// account's authority, in one place, before anything renders.
export async function resolveStaffContext(user: User): Promise<StaffContext> {
  const [config, record] = await Promise.all([getSystemConfig(), getStaffRecord(user.uid)]);
  const isMaster = !!config.masterAdminUid && config.masterAdminUid === user.uid;

  if (isMaster && record?.role !== "SUPER_ADMIN") {
    // First sign-in after the owner bootstrapped this uid in the
    // console: materialize the record. Failure here is not fatal —
    // the rules grant the master their authority from system/config
    // regardless of what this document says.
    try {
      await ensureMasterRecord(user);
    } catch (err) {
      console.error("Could not write the master admin record:", err);
    }
  }

  void publishEmailDirectoryEntry(user);

  return buildStaffContext(user.uid, config.masterAdminUid, record);
}

// Live subscription to the caller's own authorization record, so a
// role change or a revocation applies within seconds instead of
// lingering until the next reload. (With custom claims this used to
// take up to an hour of stale-token lifetime.)
export function subscribeToStaffRecord(
  uid: string,
  masterUid: string,
  callback: (context: StaffContext) => void
): () => void {
  return onSnapshot(
    doc(getDb(), USERS, uid),
    (snap) => {
      const record = snap.exists() ? (snap.data() as StaffRecordData) : null;
      callback(buildStaffContext(uid, masterUid, record));
    },
    () => {
      // A denied/failed listener must never be read as "still an
      // admin" — fall back to no role.
      callback(buildStaffContext(uid, masterUid, null));
    }
  );
}
