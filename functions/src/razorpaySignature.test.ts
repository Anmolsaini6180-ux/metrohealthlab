import { describe, it, expect } from "vitest";
import * as crypto from "node:crypto";
import { verifyRazorpayWebhookSignature } from "./razorpaySignature";

const SECRET = "whsec_test_value";

function sign(body: string, secret = SECRET): string {
  return crypto.createHmac("sha256", secret).update(Buffer.from(body, "utf8")).digest("hex");
}

// This check is the only thing standing between "Razorpay says this
// payment was captured" and "anyone on the internet can mark any
// booking as paid".
describe("verifyRazorpayWebhookSignature", () => {
  const body = JSON.stringify({
    event: "payment.captured",
    payload: { payment: { entity: { id: "pay_123", order_id: "order_123" } } },
  });

  it("accepts a signature produced with the correct secret", () => {
    expect(verifyRazorpayWebhookSignature(Buffer.from(body, "utf8"), sign(body), SECRET)).toBe(true);
  });

  it("rejects a signature produced with a different secret", () => {
    const forged = sign(body, "whsec_attacker_guess");
    expect(verifyRazorpayWebhookSignature(Buffer.from(body, "utf8"), forged, SECRET)).toBe(false);
  });

  it("rejects a valid signature replayed against a tampered body", () => {
    // Attacker keeps the signature but rewrites the amount/order.
    const original = sign(body);
    const tampered = body.replace("order_123", "order_999");
    expect(verifyRazorpayWebhookSignature(Buffer.from(tampered, "utf8"), original, SECRET)).toBe(false);
  });

  it("rejects an empty signature", () => {
    expect(verifyRazorpayWebhookSignature(Buffer.from(body, "utf8"), "", SECRET)).toBe(false);
  });

  it("rejects a truncated signature without throwing", () => {
    const truncated = sign(body).slice(0, 20);
    expect(() => verifyRazorpayWebhookSignature(Buffer.from(body, "utf8"), truncated, SECRET)).not.toThrow();
    expect(verifyRazorpayWebhookSignature(Buffer.from(body, "utf8"), truncated, SECRET)).toBe(false);
  });

  it("rejects an over-long signature without throwing", () => {
    const padded = sign(body) + "00";
    expect(() => verifyRazorpayWebhookSignature(Buffer.from(body, "utf8"), padded, SECRET)).not.toThrow();
    expect(verifyRazorpayWebhookSignature(Buffer.from(body, "utf8"), padded, SECRET)).toBe(false);
  });

  it("is sensitive to key ordering, which is why the raw body must be used", () => {
    // Same JSON semantically, different bytes. Signing the re-serialized
    // object would produce a different digest — proving why the handler
    // must never re-stringify req.body.
    const reordered = JSON.stringify({
      payload: { payment: { entity: { order_id: "order_123", id: "pay_123" } } },
      event: "payment.captured",
    });
    expect(sign(reordered)).not.toBe(sign(body));
    expect(verifyRazorpayWebhookSignature(Buffer.from(reordered, "utf8"), sign(body), SECRET)).toBe(false);
  });
});
