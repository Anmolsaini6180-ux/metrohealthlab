// Decodes the Firestore REST wire format into plain JSON.
//
// Firestore returns every field tagged with its type
// ({"stringValue":"x"}, {"integerValue":"3"}, ...). Timestamps become
// ISO strings and integers become numbers, so the exported NDJSON is
// ordinary JSON that Postgres can take as jsonb without a second
// translation step.

export function decodeValue(v) {
  if (v === null || v === undefined) return null;
  if ("nullValue" in v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("timestampValue" in v) return v.timestampValue;
  if ("bytesValue" in v) return v.bytesValue;
  if ("referenceValue" in v) return v.referenceValue;
  if ("geoPointValue" in v) {
    return { latitude: v.geoPointValue.latitude ?? null, longitude: v.geoPointValue.longitude ?? null };
  }
  if ("arrayValue" in v) return (v.arrayValue.values ?? []).map(decodeValue);
  if ("mapValue" in v) return decodeFields(v.mapValue.fields ?? {});
  // An unknown tag is kept rather than dropped, so nothing is lost
  // silently if Firestore adds a type.
  return v;
}

export function decodeFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields ?? {})) out[k] = decodeValue(v);
  return out;
}

/** "projects/p/databases/(default)/documents/users/abc" -> "abc" */
export function documentId(name) {
  return String(name).split("/").pop();
}
