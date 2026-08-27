# Cloud Functions

```bash
npm install
npm run build
firebase emulators:start --only functions,firestore,auth   # local testing
firebase deploy --only functions                            # deploy
```

## Functions

- `createBooking` (callable) — validates slot capacity, recomputes
  pricing from `labPricing`, validates/applies coupons, generates the
  booking ID, writes the booking transactionally.
- `getBookingQuote` (callable) — read-only price preview using the same
  resolution logic as `createBooking` (see `bookingResolution.ts`).
  Never reserves a slot or records coupon usage.
- `createPaymentOrder` (callable) — creates a Razorpay order, or marks
  cash-on-collection bookings `cash_pending`. Recovers from a stale or
  broken `processing` payment (missing `gatewayOrderId` or >20 min old)
  by marking it `failed` and starting a fresh attempt.
- `razorpayWebhook` (HTTPS) — signature-verified against the raw
  request body, idempotent per (payment, event). The only place a
  payment is ever marked `success`. Point Razorpay's webhook config at
  this function's URL after deploying.
- `getReportDownloadUrl` (callable) — re-checks report ownership and
  returns a 10-minute signed Storage URL. Audit-logged on every call.

## Required secrets

```
firebase functions:secrets:set RAZORPAY_KEY_ID
firebase functions:secrets:set RAZORPAY_KEY_SECRET
firebase functions:secrets:set RAZORPAY_WEBHOOK_SECRET
```
