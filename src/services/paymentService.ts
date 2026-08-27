import { doc, onSnapshot, type Unsubscribe } from "firebase/firestore";
import { getDb } from "@/firebase/firestore";
import { callFunction } from "@/firebase/functions";
import type { Payment, PaymentMethod } from "@/types/payment";

const PAYMENTS = "payments";

export interface CreatePaymentOrderRequest {
  bookingId: string;
  method: PaymentMethod;
}

export interface CreatePaymentOrderResponse {
  paymentId: string;
  // Present only for online methods — used to open the Razorpay checkout.
  razorpayOrderId?: string;
  amount?: number;
  currency?: string;
}

// Never mark a payment successful from the client. This calls a Cloud
// Function that creates a Razorpay order server-side (using the secret
// key, which lives only in Cloud Functions config, never in the
// frontend). The actual success/failure state is written by a separate
// webhook-verified Cloud Function after Razorpay confirms the payment.
// Safe to call again for the same booking after a failed attempt (the
// function is retry-aware) — it must NOT be called again after success.
export async function createPaymentOrder(
  payload: CreatePaymentOrderRequest
): Promise<CreatePaymentOrderResponse> {
  return callFunction<CreatePaymentOrderRequest, CreatePaymentOrderResponse>(
    "createPaymentOrder",
    payload
  );
}

export function subscribeToPaymentStatus(
  paymentId: string,
  callback: (payment: Payment | null) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    doc(getDb(), PAYMENTS, paymentId),
    (snap) => callback(snap.exists() ? ({ id: snap.id, ...snap.data() } as Payment) : null),
    (err) => onError?.(err)
  );
}

let razorpayScriptPromise: Promise<void> | null = null;

function loadRazorpayScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("Not in a browser."));
  if ((window as any).Razorpay) return Promise.resolve();
  if (razorpayScriptPromise) return razorpayScriptPromise;

  razorpayScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load the payment gateway. Check your connection and retry."));
    document.body.appendChild(script);
  });
  return razorpayScriptPromise;
}

export interface OpenCheckoutResult {
  status: "dismissed" | "authorized";
  razorpayPaymentId?: string;
}

// Opens the Razorpay Checkout modal. Resolving with "authorized" means
// Razorpay's client SDK reported the payment as taken — it is NOT
// confirmation the booking is paid; that only happens once the
// signature-verified webhook updates Firestore (which the caller should
// wait for via subscribeToPaymentStatus/subscribeToBooking, not this
// return value).
export async function openRazorpayCheckout(params: {
  razorpayOrderId: string;
  amount: number;
  currency: string;
  name?: string;
  description?: string;
  prefillEmail?: string;
  prefillContact?: string;
}): Promise<OpenCheckoutResult> {
  await loadRazorpayScript();
  const keyId = import.meta.env.VITE_RAZORPAY_KEY_ID;
  if (!keyId) {
    throw new Error("Payments aren't configured yet (missing VITE_RAZORPAY_KEY_ID).");
  }

  return new Promise((resolve) => {
    const rzp = new (window as any).Razorpay({
      key: keyId,
      order_id: params.razorpayOrderId,
      amount: params.amount,
      currency: params.currency,
      name: params.name ?? "Metro Health Lab",
      description: params.description ?? "Diagnostic test booking",
      prefill: { email: params.prefillEmail, contact: params.prefillContact },
      handler: (response: { razorpay_payment_id: string }) => {
        resolve({ status: "authorized", razorpayPaymentId: response.razorpay_payment_id });
      },
      modal: {
        ondismiss: () => resolve({ status: "dismissed" }),
      },
    });
    rzp.open();
  });
}
