import * as crypto from "node:crypto";

// Extracted verbatim from the webhook handler so it can be tested
// directly. Behaviour is unchanged: HMAC-SHA256 over the RAW bytes
// Razorpay signed (re-serializing the parsed body would produce a
// different string and make the check meaningless), compared in
// constant time.
export function verifyRazorpayWebhookSignature(
  rawBody: Buffer,
  signature: string,
  secret: string
): boolean {
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const signatureBuf = Buffer.from(signature, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  // timingSafeEqual throws on a length mismatch, so the length check
  // has to come first — a wrong-length signature is simply invalid.
  if (signatureBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(signatureBuf, expectedBuf);
}
