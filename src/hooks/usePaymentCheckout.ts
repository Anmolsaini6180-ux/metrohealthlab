import { useCallback, useState } from "react";
import { createPaymentOrder, openRazorpayCheckout, subscribeToPaymentStatus } from "@/services/paymentService";
import type { PaymentMethod } from "@/types/payment";
import { toUserMessage } from "@/utils/errors";

export type PaymentPhase =
  | "idle"
  | "opening" // "Opening payment..." — createPaymentOrder in flight / Razorpay modal opening
  | "verifying" // "Payment verification in progress..." — Razorpay said authorized, waiting on the webhook-confirmed Firestore doc
  | "success"
  | "failed";

export type PaymentOutcome = "success" | "delayed" | "failed";

const VERIFY_INLINE_TIMEOUT_MS = 15_000;

// Waits for the payment doc to resolve to success/failed, or gives up
// after timeoutMs (returning "timeout" — NOT a failure, just meaning
// "still not resolved, stop waiting on this screen"). The caller's
// tracking page keeps its own indefinite realtime listener regardless,
// so a timeout here never means the payment is abandoned — it means
// the customer should be moved to a screen built for open-ended
// waiting instead of staring at a spinner.
function waitForPaymentResolution(
  paymentId: string,
  timeoutMs: number
): Promise<"success" | "failed" | "timeout"> {
  return new Promise((resolve) => {
    let settled = false;
    let unsubscribe = () => {};

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      unsubscribe();
      resolve("timeout");
    }, timeoutMs);

    unsubscribe = subscribeToPaymentStatus(
      paymentId,
      (payment) => {
        if (settled || !payment) return;
        if (payment.status === "success") {
          settled = true;
          clearTimeout(timer);
          unsubscribe();
          resolve("success");
        } else if (payment.status === "failed") {
          settled = true;
          clearTimeout(timer);
          unsubscribe();
          resolve("failed");
        }
      },
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        unsubscribe();
        resolve("timeout");
      }
    );
  });
}

// Shared by BookingFlowPage (right after createBooking) and
// BookingDetailPage (retrying a previously-failed payment). Razorpay's
// client-side "handler" callback firing is NEVER treated as payment
// success on its own — it only means the checkout modal completed, so
// from there this hook watches the actual Firestore payment doc (which
// only the signature-verified webhook can move to "success") before
// reporting anything as paid.
export function usePaymentCheckout() {
  const [phase, setPhase] = useState<PaymentPhase>("idle");
  const [error, setError] = useState<string | null>(null);

  const pay = useCallback(
    async (
      bookingId: string,
      method: PaymentMethod,
      prefill?: { email?: string; contact?: string }
    ): Promise<{ ok: boolean; outcome: PaymentOutcome }> => {
      setPhase("opening");
      setError(null);
      try {
        const order = await createPaymentOrder({ bookingId, method });

        if (method === "cash_on_collection") {
          // Already confirmed server-side by createPaymentOrder itself —
          // nothing to verify or wait on.
          setPhase("success");
          return { ok: true, outcome: "success" };
        }

        if (!order.razorpayOrderId || !order.amount || !order.currency) {
          throw new Error("Payment order could not be created.");
        }

        const checkoutResult = await openRazorpayCheckout({
          razorpayOrderId: order.razorpayOrderId,
          amount: order.amount,
          currency: order.currency,
          prefillEmail: prefill?.email,
          prefillContact: prefill?.contact,
        });

        if (checkoutResult.status === "dismissed") {
          setPhase("failed");
          setError("Payment wasn't completed. You can retry whenever you're ready.");
          return { ok: false, outcome: "failed" };
        }

        // checkoutResult.status === "authorized" — Razorpay's modal
        // succeeded, but that is NOT payment success. Show verification
        // in progress and wait for the real, webhook-written status.
        setPhase("verifying");
        const resolution = await waitForPaymentResolution(order.paymentId, VERIFY_INLINE_TIMEOUT_MS);

        if (resolution === "success") {
          setPhase("success");
          return { ok: true, outcome: "success" };
        }
        if (resolution === "failed") {
          setPhase("failed");
          setError("Payment didn't go through. You can retry.");
          return { ok: false, outcome: "failed" };
        }

        // Still not resolved after the inline wait — genuinely unknown,
        // not a failure. Hand off to the tracking page, which keeps
        // listening indefinitely and shows "Waiting for payment
        // confirmation...".
        setPhase("verifying");
        return { ok: true, outcome: "delayed" };
      } catch (err) {
        setPhase("failed");
        setError(toUserMessage(err));
        return { ok: false, outcome: "failed" };
      }
    },
    []
  );

  return { phase, error, pay };
}
