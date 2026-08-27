import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { FieldValue } from "firebase-admin/firestore";
import Razorpay from "razorpay";
import { db } from "./admin";
import { writeNotification } from "./notifications";
import { writeAuditLog } from "./audit";
import { verifyRazorpayWebhookSignature } from "./razorpaySignature";

// Set with:
//   firebase functions:secrets:set RAZORPAY_KEY_ID
//   firebase functions:secrets:set RAZORPAY_KEY_SECRET
//   firebase functions:secrets:set RAZORPAY_WEBHOOK_SECRET
// Never put these in frontend env vars — only the publishable
// VITE_RAZORPAY_KEY_ID belongs there.
const razorpayKeyId = defineSecret("RAZORPAY_KEY_ID");
const razorpayKeySecret = defineSecret("RAZORPAY_KEY_SECRET");
const razorpayWebhookSecret = defineSecret("RAZORPAY_WEBHOOK_SECRET");

interface CreatePaymentOrderInput {
  bookingId: string;
  method: "upi" | "card" | "netbanking" | "wallet" | "cash_on_collection";
}

// A "processing" payment older than this (or missing a
// gatewayOrderId at all — meaning the Razorpay order call/its
// follow-up Firestore write never completed) is treated as broken
// rather than reused. Razorpay orders themselves also expire, so this
// keeps us from ever handing back an order the customer can't
// actually pay against.
const STALE_PROCESSING_MS = 20 * 60 * 1000; // 20 minutes

export const createPaymentOrder = onCall<CreatePaymentOrderInput>(
  { secrets: [razorpayKeyId, razorpayKeySecret] },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "You must be signed in.");

    const { bookingId, method } = request.data;
    const bookingRef = db.collection("bookings").doc(bookingId);

    return db.runTransaction(async (tx) => {
      const bookingSnap = await tx.get(bookingRef);
      if (!bookingSnap.exists || bookingSnap.data()?.userId !== uid) {
        throw new HttpsError("permission-denied", "Invalid booking.");
      }
      const booking = bookingSnap.data()!;
      if (booking.bookingStatus !== "payment_pending") {
        throw new HttpsError("failed-precondition", "This booking isn't awaiting payment.");
      }

      // Idempotency / retry / recovery: reuse a genuinely in-flight
      // order instead of minting a duplicate one on a double-click;
      // allow a fresh attempt after a failure; and recover from a
      // "processing" payment that never actually got a Razorpay order
      // attached (e.g. the function died between the Firestore write
      // and the Razorpay API call/its follow-up update) instead of
      // reusing a payment doc that can never resolve.
      const existingPaymentsSnap = await tx.get(
        db.collection("payments").where("bookingId", "==", bookingId).orderBy("createdAt", "desc").limit(1)
      );
      let latest = existingPaymentsSnap.empty ? null : existingPaymentsSnap.docs[0];

      if (latest && latest.data().status === "success") {
        throw new HttpsError("failed-precondition", "This booking has already been paid for.");
      }

      if (latest && latest.data().status === "processing") {
        const p = latest.data();
        const createdAtMs = (p.createdAt as FirebaseFirestore.Timestamp | undefined)?.toMillis?.() ?? 0;
        const ageMs = Date.now() - createdAtMs;
        const isStale = !p.gatewayOrderId || ageMs > STALE_PROCESSING_MS;

        if (!isStale) {
          return { paymentId: latest.id, razorpayOrderId: p.gatewayOrderId, amount: Math.round(p.amount * 100), currency: "INR" };
        }

        // Broken/abandoned attempt — never leave it stuck in
        // "processing" forever, and never treat it as reusable.
        tx.update(latest.ref, {
          status: "failed",
          failureReason: p.gatewayOrderId ? "stale_processing" : "missing_gateway_order",
          updatedAt: FieldValue.serverTimestamp(),
        });
        writeAuditLog(tx, {
          action: "payment.recovered_stale_processing",
          actorType: "system",
          targetType: "payment",
          targetId: latest.id,
          metadata: { bookingId, hadGatewayOrderId: !!p.gatewayOrderId, ageMs },
        });
        latest = null; // fall through and create a fresh attempt below
      }

      if (method === "cash_on_collection") {
        if (latest) {
          throw new HttpsError("failed-precondition", "A payment attempt already exists for this booking.");
        }
        const paymentRef = db.collection("payments").doc();
        tx.set(paymentRef, {
          bookingId,
          userId: uid,
          method,
          amount: booking.finalAmount,
          status: "pending",
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        tx.update(bookingRef, {
          paymentStatus: "cash_pending",
          bookingStatus: "confirmed",
          updatedAt: FieldValue.serverTimestamp(),
        });
        tx.set(db.collection("bookingStatusHistory").doc(), {
          bookingId,
          status: "confirmed",
          createdAt: FieldValue.serverTimestamp(),
        });
        writeNotification(tx, {
          userId: uid,
          type: "booking_confirmed",
          title: "Booking confirmed",
          message: `Booking ${bookingId} is confirmed — pay by cash at collection.`,
        });
        writeAuditLog(tx, {
          action: "payment.cash_pending",
          actorType: "customer",
          actorId: uid,
          targetType: "booking",
          targetId: bookingId,
        });
        return { paymentId: paymentRef.id };
      }

      // Online methods: Razorpay's own order-creation API call can't
      // happen inside a Firestore transaction (it's an external network
      // call), so we reserve the payment doc here and create the actual
      // order just after the transaction commits, below.
      const paymentRef = db.collection("payments").doc();
      tx.set(paymentRef, {
        bookingId,
        userId: uid,
        method,
        amount: booking.finalAmount,
        status: "processing",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      writeAuditLog(tx, {
        action: "payment.order_requested",
        actorType: "customer",
        actorId: uid,
        targetType: "booking",
        targetId: bookingId,
      });

      return { __pendingOrderCreation: true, paymentId: paymentRef.id, amount: booking.finalAmount } as unknown as {
        paymentId: string;
      };
    }).then(async (txResult: any) => {
      if (!txResult.__pendingOrderCreation) return txResult;

      const razorpay = new Razorpay({ key_id: razorpayKeyId.value(), key_secret: razorpayKeySecret.value() });
      try {
        const order = await razorpay.orders.create({
          amount: Math.round(txResult.amount * 100), // paise
          currency: "INR",
          receipt: bookingId,
        });
        await db.collection("payments").doc(txResult.paymentId).update({
          gatewayOrderId: order.id,
          updatedAt: FieldValue.serverTimestamp(),
        });
        return { paymentId: txResult.paymentId, razorpayOrderId: order.id, amount: order.amount, currency: order.currency };
      } catch (err) {
        // Razorpay call failed — mark the reserved payment as failed
        // rather than leaving it stuck in "processing" forever.
        await db.collection("payments").doc(txResult.paymentId).update({
          status: "failed",
          updatedAt: FieldValue.serverTimestamp(),
        });
        throw new HttpsError("internal", "Could not start the payment. Please try again.");
      }
    });
  }
);

// Razorpay calls this directly (HTTP, not a callable) once a payment is
// captured or fails. Configure this URL in the Razorpay dashboard
// webhook settings after deploying.
export const razorpayWebhook = onRequest({ secrets: [razorpayWebhookSecret] }, async (req, res) => {
  // Signature MUST be verified against the raw bytes Razorpay signed —
  // re-serializing req.body would produce a different string and make
  // the check meaningless (and reject legitimate requests whenever key
  // ordering/whitespace differs).
  const rawBody: Buffer | undefined = (req as unknown as { rawBody?: Buffer }).rawBody;
  const signature = req.headers["x-razorpay-signature"] as string | undefined;
  if (!rawBody || !signature) {
    res.status(400).send("Missing signature or body");
    return;
  }
  const signatureValid = verifyRazorpayWebhookSignature(rawBody, signature, razorpayWebhookSecret.value());
  if (!signatureValid) {
    res.status(400).send("Invalid signature");
    return;
  }

  const event = req.body.event as string;
  const paymentEntity = req.body.payload?.payment?.entity;
  if (!paymentEntity?.id || !paymentEntity?.order_id) {
    res.status(200).send("Ignored: malformed payload"); // 2xx so Razorpay doesn't retry a payload that will never parse
    return;
  }
  if (event !== "payment.captured" && event !== "payment.failed") {
    res.status(200).send("Ignored: unhandled event type");
    return;
  }

  // Idempotency key: this exact (payment, event) pair. A transaction
  // guards check-and-mark so concurrent/duplicate webhook deliveries for
  // the same event can only ever apply its side effects once.
  const eventKey = `${paymentEntity.id}:${event}`;
  const eventRef = db.collection("processedWebhookEvents").doc(eventKey);

  try {
    await db.runTransaction(async (tx) => {
      const eventSnap = await tx.get(eventRef);
      if (eventSnap.exists) {
        return; // already processed this exact event — no-op
      }

      const paymentsQuery = await tx.get(
        db.collection("payments").where("gatewayOrderId", "==", paymentEntity.order_id).limit(1)
      );
      if (paymentsQuery.empty) {
        // Unknown order — log it but still mark the event processed and
        // return 2xx; retrying won't make an unknown order exist.
        writeAuditLog(tx, {
          action: "webhook.unknown_order",
          actorType: "webhook",
          targetType: "razorpayOrder",
          targetId: paymentEntity.order_id,
          metadata: { event, paymentId: paymentEntity.id },
        });
        tx.set(eventRef, { processedAt: FieldValue.serverTimestamp(), outcome: "unknown_order" });
        return;
      }

      const paymentDoc = paymentsQuery.docs[0];
      const payment = paymentDoc.data();
      const bookingRef = db.collection("bookings").doc(payment.bookingId);
      const bookingSnap = await tx.get(bookingRef);

      if (payment.status === "success" || payment.status === "failed") {
        // Already resolved by an earlier webhook delivery — idempotent no-op.
        tx.set(eventRef, { processedAt: FieldValue.serverTimestamp(), outcome: "already_processed" });
        return;
      }

      if (event === "payment.captured") {
        tx.update(paymentDoc.ref, {
          status: "success",
          gatewayPaymentId: paymentEntity.id,
          updatedAt: FieldValue.serverTimestamp(),
        });

        // Only transition the booking if it's still waiting on payment —
        // guards against a stale/duplicate event flipping a booking that
        // was, say, already cancelled.
        if (bookingSnap.exists && bookingSnap.data()?.bookingStatus === "payment_pending") {
          tx.update(bookingRef, {
            paymentStatus: "success",
            bookingStatus: "confirmed",
            updatedAt: FieldValue.serverTimestamp(),
          });
          tx.set(db.collection("bookingStatusHistory").doc(), {
            bookingId: payment.bookingId,
            status: "confirmed",
            createdAt: FieldValue.serverTimestamp(),
          });
          writeNotification(tx, {
            userId: payment.userId,
            type: "payment_successful",
            title: "Payment successful",
            message: `Payment received for booking ${payment.bookingId}.`,
          });
          writeNotification(tx, {
            userId: payment.userId,
            type: "booking_confirmed",
            title: "Booking confirmed",
            message: `Booking ${payment.bookingId} is confirmed.`,
          });
        }
        writeAuditLog(tx, {
          action: "payment.captured",
          actorType: "webhook",
          targetType: "payment",
          targetId: paymentDoc.id,
          metadata: { bookingId: payment.bookingId },
        });
      } else if (event === "payment.failed") {
        tx.update(paymentDoc.ref, { status: "failed", updatedAt: FieldValue.serverTimestamp() });
        // Booking is left exactly as-is (payment_pending) — a safe state
        // the customer can retry payment from, rather than cancelled.
        writeNotification(tx, {
          userId: payment.userId,
          type: "system",
          title: "Payment failed",
          message: `Payment for booking ${payment.bookingId} failed. You can retry from your bookings page.`,
        });
        writeAuditLog(tx, {
          action: "payment.failed",
          actorType: "webhook",
          targetType: "payment",
          targetId: paymentDoc.id,
          metadata: { bookingId: payment.bookingId },
        });
      }

      tx.set(eventRef, { processedAt: FieldValue.serverTimestamp(), outcome: event });
    });

    res.status(200).send("ok");
  } catch (err) {
    // Any unexpected error: 5xx so Razorpay retries the delivery later
    // (safe, since the whole handler is idempotent per eventKey).
    res.status(500).send("Internal error");
  }
});
