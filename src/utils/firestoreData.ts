// Firestore rejects `undefined` outright — an optional field that was
// left blank must be *omitted* from the written document, not sent as
// `undefined`. The SDK's error for this is:
//
//   Function addDoc() called with invalid data.
//   Unsupported field value: undefined (found in field icon in ...)
//
// Building a payload with `icon: value || undefined` is the usual way
// to trip it. `stripUndefined` is the safety net at the write boundary:
// every service in src/services runs its payload through it before
// handing the object to addDoc/setDoc/updateDoc.

type PlainObject = Record<string, unknown>;

// Only *plain* objects and arrays are rebuilt. Anything with a custom
// prototype — Firestore sentinels (serverTimestamp(), deleteField(),
// arrayUnion()), Timestamp, GeoPoint, DocumentReference, Bytes, Date —
// is passed through by reference, because copying one field-by-field
// would destroy the very identity the SDK checks for.
function isPlainObject(value: unknown): value is PlainObject {
  if (typeof value !== "object" || value === null) return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

// Returns a copy of `value` with every `undefined` object property
// removed, recursively. Never mutates the input, never coerces or
// stringifies anything, and leaves `null` alone — a caller that
// deliberately stores null still gets null.
//
// Array *elements* keep their positions: dropping one would silently
// re-index the array, and an `undefined` sitting inside an array is a
// real data bug that should surface rather than be quietly reshuffled.
export function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as unknown as T;
  }
  if (!isPlainObject(value)) return value;

  const result: PlainObject = {};
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined) continue;
    result[key] = stripUndefined(item);
  }
  return result as T;
}

// Normalizes a free-text optional field coming out of a form input.
// An empty (or whitespace-only) box means "this field has no value",
// which callers turn into an omitted key on create and a deleteField()
// on update — never an empty-string placeholder and never `undefined`.
export function optionalText(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}
