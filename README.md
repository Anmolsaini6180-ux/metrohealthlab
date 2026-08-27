# Metro Health Lab — customer platform

React + TypeScript + Vite frontend, Firebase (Auth/Firestore/Storage/
Functions) as the single source of truth. No hard-coded business data
anywhere — every price, test, package, lab, slot, and coupon comes from
Firestore, and every security-sensitive operation (pricing, payment,
coupon redemption, report access) is enforced server-side in Cloud
Functions, never trusted from the client.

**Firebase project:** `metro-health-0001` — Firebase config is hardcoded
directly in `src/firebase/config.ts` (per explicit request, overriding
the earlier env-var-only setup) and is complete, including the API key.

## UI redesign pass — branding, dashboard, auth

> **Correction (deployment/automation pass).** An earlier version of
> this section said the Admin Panel had been skipped and that "nothing
> under `/admin` exists". That is no longer true and was left stale:
> a full admin panel now exists at `/admin` (27 screens, its own
> `AdminLayout`, claims-gated by `AdminProtectedRoute`), plus an agent
> area at `/agent`. See **Admin panel** below.

What the customer-side redesign pass built:

- **Branding**: `src/components/brand/Logo.tsx` — full/compact/icon
  variants backed by your actual logo (`src/assets/brand/`), used in
  the header (responsive: full lockup ≥480px, icon-only below),
  login/signup pages, and the footer.
- **Login/Signup/Forgot Password**: `LoginPage` redesigned as a
  two-column layout on desktop (brand panel + card) collapsing to a
  centered card on mobile, with show/hide password. New dedicated
  `/signup` (name/email/phone/password/confirm/terms) and
  `/forgot-password` (Firebase `sendPasswordResetEmail`) pages.
- **Patient Dashboard** (`/dashboard`): real stats (upcoming bookings,
  completed tests, reports available, pending actions — all computed
  from actual `bookings`/`reports` data, zero when there's no data),
  quick-action cards, next appointment, recent bookings, unread
  notification banner.
- **Header**: logged-in state now shows a real profile dropdown
  (`ProfileMenu`) with Dashboard/Bookings/Reports/Profile/Addresses/
  Notifications/Logout, plus a live unread-count badge on the bell
  icon (`useUnreadNotificationsCount`, realtime).
- **Footer**: new, with real links to every existing route (nothing
  invented).
- **Bookings**: status tabs (Upcoming/Active/Completed/Cancelled) on
  `/bookings`.
- **Notifications**: "Mark all as read" added.
- **Nested profile routes**: `/profile/addresses` and
  `/profile/patients` now exist alongside the original `/addresses`
  and `/family` (both still work — nothing was removed, per "don't
  break working functionality").
- **Loading states**: card-shaped skeletons (`TestCardSkeleton`,
  `PackageCardSkeleton`, `CardGridSkeleton`, `DashboardSkeleton`)
  replace bare "Loading..." text on the home/tests/packages/dashboard
  pages.
- **Polish**: card hover elevation, button press/disabled states,
  bottom-nav safe-area padding for notch/gesture-bar devices.

Not touched by *that* pass: booking flow, payment architecture,
security rules, Cloud Functions.

This has been through two production-hardening passes, an admin-panel
build, and a deployment/automation pass. It still needs real catalog
data and a run through `TESTING.md` against either the emulator suite
or the real project before it's fully production-ready — see
**Compiled vs. live-tested**.

**Deployment lives in [`DEPLOYMENT.md`](./DEPLOYMENT.md)** — one-time
setup, the normal push-to-main workflow, environment variables,
secrets, rollback and troubleshooting. Read that before deploying
anything.

## Running locally

```bash
npm install
cp .env.example .env   # optional: add VITE_RAZORPAY_KEY_ID for checkout
npm run dev
```

```bash
cd functions
npm install
npm run build
```

## Project layout

```
src/
  components/   shared UI (cards, states, header, bottom nav)
  layouts/      MainLayout (header + outlet + bottom nav)
  pages/        one file per route
  services/     the ONLY place Firestore/Functions calls live
  firebase/     config.ts / auth.ts / firestore.ts / storage.ts / functions.ts
  hooks/        useAuth, useAsync, usePaymentCheckout
  types/        one file per Firestore collection's shape
  styles/       tokens.css (design tokens) + global.css
functions/
  src/
    createBooking.ts      transactional booking creation — validates everything, trusts nothing from the client
    getBookingQuote.ts     server-authoritative price preview — same resolution logic as createBooking, read-only
    bookingResolution.ts   shared item/lab/price/service-area resolution used by both of the above
    coupons.ts              evaluateCoupon (read-only, shared) + recordCouponUsage (write, booking-only)
    payments.ts             createPaymentOrder (with stale-payment recovery) + the Razorpay webhook
    reports.ts               report upload signature, verified confirm, mark-ready, expiring download URLs
    notifications.ts       single place every notification is written from
    audit.ts                 audit-log helper, written on every trust-sensitive mutation
    bookingId.ts             transactional sequential booking ID generator
    media.ts                 Cloudinary signed-upload signature, verified confirm, delete
    cloudinaryConfig.ts      Cloudinary secrets + the folder allowlist
    razorpaySignature.ts     webhook HMAC verification (extracted so it's testable)
    roleClaims.ts            custom-claim role reads + requireCatalogManager guard
    *.test.ts                unit tests (vitest)
tests/rules/          Firestore security-rules tests (needs the emulator)
.github/workflows/    CI + Firebase backend deploy
vercel.json           Vercel build config + SPA rewrite + headers
firestore.rules / storage.rules / firestore.indexes.json / firebase.json
DEPLOYMENT.md         one-time setup, normal workflow, rollback, troubleshooting
TESTING.md            manual QA checklist to run before go-live
```

## Hardening pass 2 — what changed and why

### 1. Authoritative server-side price quote

New `getBookingQuote` Cloud Function. It runs the *exact same*
resolution code `createBooking` uses (`resolveItems`,
`resolveServiceArea`, `evaluateCoupon` — extracted into
`bookingResolution.ts`/`coupons.ts` so the two can never quietly drift
apart) but only reads — no slot reservation, no coupon usage recorded.
The frontend's review screen (`BookingFlowPage`) now shows *only* this
response; there is no client-side `calculatePrice` call left in the
booking flow. `createBooking` still independently recomputes
everything from scratch and never reads or trusts `quoteId` for
pricing — it's accepted only as optional audit metadata linking a
booking to the quote that preceded it.

### 2. Payment order recovery

`createPaymentOrder` now distinguishes a genuinely in-flight Razorpay
order from a broken one: a `processing` payment with no
`gatewayOrderId`, or one older than 20 minutes, is marked `failed`
(with a `failureReason`) and a fresh attempt is created — it's never
reused and never left permanently stuck.

### 3. Payment confirmation UX

Razorpay's client-side "handler" firing was already not treated as
success in the previous pass, but the messaging didn't make that
explicit. `usePaymentCheckout` now has distinct phases — `opening` →
`verifying` ("Payment verification in progress...") → `success` or
`failed` — and actively subscribes to the real payment document rather
than just hoping the webhook is fast. If nothing resolves within 15
seconds it hands off to the tracking page's own indefinite realtime
listener (shown as "Waiting for payment confirmation...") instead of
either blocking forever or guessing.

### 4–7. Security rules

- `users/{uid}` update is now restricted to
  `['name','phone','photoUrl','dateOfBirth','gender','preferences','updatedAt']`
  via `affectedKeys().hasOnly(...)` — `role`/`isAdmin`/`staff`/anything
  else is rejected regardless of what the client sends.
- `patients/{id}` and `addresses/{id}` updates now also require
  `request.resource.data.userId == resource.data.userId` — ownership
  can't be reassigned even by the current owner, not just "you must
  already own it."
- `storage.rules` for `reports/{userId}/{fileName}` is now `allow read,
  write: if false` outright — even the owner's own Storage SDK call is
  denied; `getReportDownloadUrl` still works because it uses the Admin
  SDK, which bypasses these rules.
- `isStaff()` is now based on a Firebase Auth **custom claim**
  (`request.auth.token.role`), not the existence of a `roles/{uid}`
  document. Custom claims can only be set by the Admin SDK — no client
  write path can ever grant or modify their own claim, which is a
  materially stronger guarantee than "no one can write to this
  collection" (that was already true, but a document's mere *existence*
  was doing double duty as authorization before, and the instruction
  was explicit that this isn't sufficient). `roles/{uid}` is kept only
  as a human-readable reference for a future Admin UI.

### 8. Coupon security

The `coupons` collection is now `allow read: if false` — no client can
list or read it directly anymore. Eligibility preview goes entirely
through `getBookingQuote`, which returns only `couponApplied` (a
boolean) and `couponMessage` (a plain-language reason), never the raw
coupon document. **Note on scope:** the instruction said "move
preview behind a secure callable function *if necessary*" — I
consolidated this into `getBookingQuote` rather than building a
separate `previewCoupon` function, since they'd otherwise be two
near-duplicate implementations of the same validation logic. This
still fully satisfies "no direct client reads of the coupons
collection"; flagging the deviation from a literal separate-function
reading in case that's not what you wanted.

### 9–10. Booking validation & idempotency

Unchanged in substance from the first hardening pass — patient/address
ownership, active test/package/lab, lab-offers-item, labPricing
active+collection-type match, service area, slot
date/type/area/capacity, coupon, authoritative pricing, booking date
are all still checked, just now via the shared `bookingResolution.ts`
helpers instead of being duplicated inline. Idempotency (booking
creation, payment retry, webhook events, coupon usage, slot capacity)
is unchanged and still verified in `TESTING.md`.

### 11. Phone/OTP

`LoginPage` now has a real Email/Phone tab switcher. The Phone tab:
phone number entry → **Send OTP** (creates an invisible reCAPTCHA
bound to a `#recaptcha-container` div, calls Firebase's
`signInWithPhoneNumber`) → OTP entry → **Verify OTP** → signed in.
**Resend OTP** discards the old reCAPTCHA widget and creates a fresh
one before resending (a used/failed widget can't reliably be reused).
**Change number** returns to the phone step. Loading and error states
throughout. Currently hardcodes a `+91` prefix (India-only) — see
**Remaining limitations**.

## Price quote architecture (exact sequence)

```
Customer reaches the coupon or review step
  → frontend calls getBookingQuote({ patientId, items, labId, collectionType, addressId, pincode, couponCode })
      → verifies patient/address ownership
      → resolveItems: lab active? item active? lab offers item? labPricing active + collection-type match? → subtotal
      → resolveServiceArea: pincode serviceable? home collection available? → collectionFee
      → evaluateCoupon (if provided): same checks as createBooking, but never throws to the caller —
        wrapped in try/catch so a bad coupon still returns a full quote with discount: 0 and a couponMessage
      → writes a priceQuotes/{quoteId} doc (server-only, unreadable by clients) for audit/reference
      → returns { subtotal, collectionFee, discount, finalAmount, quoteId, expiresAt, couponApplied, couponMessage }
  → frontend displays EXACTLY this — no local recomputation
Customer confirms
  → createBooking runs the same resolveItems/resolveServiceArea/evaluateCoupon from scratch,
    inside its own transaction, plus slot reservation + coupon usage recording
  → if anything changed since the quote (price, coupon eligibility, slot capacity), createBooking
    fails with a clear error — quoteId is never used to skip re-validation
```

## Payment architecture (exact sequence)

```
createBooking (txn: validate everything, price server-side, idempotent)
  → bookingStatus: payment_pending, paymentStatus: pending
createPaymentOrder
  cash_on_collection → paymentStatus: cash_pending, bookingStatus: confirmed (immediate)
  online method:
    existing "processing" payment, valid gatewayOrderId, <20min old → reused
    existing "processing" payment, missing gatewayOrderId OR ≥20min old → marked failed, fresh attempt created
    otherwise → new Razorpay order created, payment doc status: processing
    → Razorpay Checkout opens client-side
    → customer pays
    → checkout "handler" fires client-side — treated ONLY as "modal completed," never as success
    → frontend shows "Payment verification in progress..." and subscribes to the payment doc
    → Razorpay calls razorpayWebhook (signature verified against req.rawBody, idempotent per payment+event)
        payment.captured → paymentStatus: success, bookingStatus: confirmed (only if still payment_pending)
        payment.failed   → paymentStatus: failed, bookingStatus stays payment_pending (safe, retryable)
    → if resolved within 15s, frontend shows success/failure inline; otherwise hands off to the
      tracking page's indefinite realtime listener ("Waiting for payment confirmation...")
```

## Coupon architecture (exact sequence)

```
evaluateCoupon (read-only; used by BOTH getBookingQuote and createBooking):
  1. look up by code — fails if it doesn't exist
  2. active? within [startDate, expiryDate]? subtotal+fee >= minimumOrder?
  3. applicableLabs / applicableTests / applicablePackages — must include this booking's lab/items if set
  4. usedCount < usageLimit (global)?  perUserLimit / firstOrderOnly checked against couponUsage/{couponId}_{uid}
  5. any failure → throws
       - getBookingQuote catches this and returns { couponApplied: false, couponMessage: <reason> } — quote still succeeds
       - createBooking lets it propagate — the whole booking fails, nothing is created
  6. success → returns the discount amount, WITHOUT writing anything yet

recordCouponUsage (write-only; called ONLY by createBooking, only after the entire booking is otherwise valid):
  increments usedCount, writes couponUsage/{couponId}_{uid} — inside the same transaction that reads
  those exact values in evaluateCoupon, so Firestore aborts/retries the whole transaction if another
  concurrent booking changes them first; usedCount can never be pushed past usageLimit by a race
```

## OTP setup (Firebase Console)

1. Authentication → Sign-in method → enable **Phone**
2. Authentication → Settings → **Authorized domains** — add your
   production domain (localhost is included by default)
3. Authentication → Sign-in method → Phone → **Phone numbers for
   testing** — add test numbers so development doesn't burn real SMS
4. No separate reCAPTCHA console setup is normally required — the
   Firebase SDK's `RecaptchaVerifier` provisions an invisible
   reCAPTCHA automatically. If you see `auth/argument-error` or
   reCAPTCHA-related errors in production, check whether your project
   has been migrated to reCAPTCHA Enterprise (Google Cloud Console →
   reCAPTCHA Enterprise) and needs a site key configured there instead.
5. Phone auth works on the Spark (free) plan for a limited quota, but
   is effectively expected to run on Blaze for any real volume —
   verify current Firebase pricing before launch, this changes.

## Firebase Console checklist

I have no access to your console, so I can't tell you what's already
enabled — this is what to check, not a claim that it's done:

```
Firebase Console (console.firebase.google.com → metro-health-0001)

→ Billing
   → Upgrade to Blaze (pay-as-you-go) if not already
   → REQUIRED: all five Cloud Functions here (createBooking, getBookingQuote,
     createPaymentOrder, razorpayWebhook, getReportDownloadUrl) are 2nd-gen and
     need Blaze even at low volume. Also required for Functions to make
     outbound calls to the Razorpay API.

→ Authentication → Get started (if not already)
   → Sign-in method → enable:
      - Email/Password
      - Google (must set a public support email when prompted)
      - Phone (see OTP setup above)
   → Settings → Authorized domains → add your production domain

→ Firestore Database → Create database
   → Start in PRODUCTION mode (rules are already strict — don't use test mode)
   → Region: pick once, can't change later. asia-south1 (Mumbai) is the
     sensible default for an India-based business — verify your project
     doesn't already have a database in a different region before deploying

→ Storage → Get started
   → Same region consideration as Firestore

→ App Check
   → Skip for now, per your own note — add later via reCAPTCHA v3/Enterprise

→ Cloud Functions (first deploy will prompt to enable, or enable ahead of time)
   → Cloud Build API, Artifact Registry API, Eventarc API, Cloud Run API

→ Custom claims for the future Admin Panel
   → No console toggle for this. Setting request.auth.token.role requires
     a privileged server action (Admin SDK auth.setCustomUserClaims) —
     out of scope until the Admin Panel itself is built, but the rules
     already expect it (see isStaff() in firestore.rules).
```

## Deploying

**Normal workflow — see [`DEPLOYMENT.md`](./DEPLOYMENT.md) for the full guide.**

```bash
git add .
git commit -m "update"
git push origin main
```

That's it. GitHub Actions runs the checks; Vercel builds and promotes
the frontend to https://metrohealthlab.in once they pass; a second
workflow deploys Cloud Functions and rules if `functions/` or the rules
files changed.

Manual deploys are still possible for emergencies (`firebase deploy
--only functions --project metro-health-0001`), but the automated path
is the one that's expected to be used — a manual deploy skips the tests.

One-time setup (Vercel project + deployment checks, GitHub service
account secret, Firebase Functions secrets, Cloudinary account, Razorpay
webhook URL) is all in `DEPLOYMENT.md`.

## Compiled vs. live-tested — do not conflate these

**Actually run and passing** (deployment/automation pass):
- `npm ci` from a clean checkout — frontend and `functions/`
- `npm run typecheck` and `npm run build` (frontend)
- `npm run typecheck` and `npm run build` (functions)
- `npm test` — 6 frontend unit tests (pricing display, server-formula parity)
- `npm test` in `functions/` — 29 unit tests (pricing, coupon discount
  maths, Razorpay webhook signature verification, role-claim
  authorization, media folder allowlist)
- The CI secret-leak check, run against the real `dist/` output — clean

**Written but NOT yet run anywhere:**
- `npm run test:rules` — the Firestore security-rules suite
  (`tests/rules/`, ~30 cases covering report cross-customer access,
  booking/payment tampering, role escalation, coupon reads, internal
  ledgers). It needs the Firestore emulator, whose jars couldn't be
  downloaded in the environment these were written in. **It runs in CI
  on the first push** — check that job before trusting the rules.
- Both GitHub Actions workflows. YAML is schema-valid; neither has
  executed.

**NOT verified, and not claimed:**
- Nothing has run against the live Firebase project. Firestore rules
  are structurally checked, not deploy-validated.
- **Nothing Cloudinary-related has touched a real Cloudinary account.**
  The signature generation, `api.resource` verification and expiring
  download URLs were exercised against the SDK offline only. Upload,
  replace, delete and report download all need a real end-to-end run.
- Payment should not be considered functional until it has been through
  an actual Razorpay test-mode checkout end to end, webhook included.
- `TESTING.md` remains the manual checklist for closing what automated
  tests don't cover.

## Remaining limitations

- **Phone auth is India-only** — `LoginPage` hardcodes a `+91` prefix.
  Add a country picker if the business expands.
- **`createPaymentOrder`'s Razorpay order creation happens after its
  Firestore transaction commits** (external HTTP calls can't run
  inside a Firestore transaction) — if the Razorpay API call itself
  fails, the reserved payment doc is marked `failed` in a follow-up
  write; the new stale-processing recovery logic exists specifically
  to clean up if even that follow-up write doesn't happen.
- **Coupon preview was consolidated into `getBookingQuote`** rather
  than a separate `previewCoupon` function — see the note under
  "Coupon security" above if a standalone function was actually
  wanted.
- **Test coverage is partial.** Unit tests cover the pure logic
  (pricing, coupon maths, signature verification, role checks) and the
  rules suite covers the authorization boundaries. The slot-race,
  webhook-idempotency and payment-recovery paths are still only covered
  by `TESTING.md`'s manual checklist — they need integration tests
  against the emulator
  before this handles real traffic.
- Search, center-visit collection-point selection, and the ~700KB
  bundle size are unchanged from the original scaffold.

## Final test checklist

See `TESTING.md` — organized by area (auth, quote, booking, slot race,
coupons, payment, payment recovery, tracking, notifications, reports,
security rules, unauthorized access, role escalation, responsive).

## Admin panel

Lives at `/admin` (login at `/admin/login`), with a separate
`AdminLayout` — no customer header/footer/bottom nav. Access is gated by
`AdminProtectedRoute` + `useAdminRole`, both of which read the role from
the Firebase ID token's **custom claims**, the same source
`firestore.rules` and every admin Cloud Function use. The UI's idea of
"what can I see" therefore can't drift from what's actually enforced.

Roles: `SUPER_ADMIN` → `ADMIN` → `SUB_ADMIN` → `COLLECTION_AGENT`. Each
can only create the role below it (`CREATABLE_ROLES` in
`functions/src/roleClaims.ts`), and claims are only ever written by the
`createTeamMember` Cloud Function via the Admin SDK — there is no client
write path that can grant or escalate a role.

Collection agents get their own area at `/agent`.

### Media and reports — no console step

`Content → Media library` plus in-place uploaders on the Branding,
Banners and Reports screens. Images and report files upload straight
from the browser to Cloudinary using a signature minted per-upload by a
Cloud Function for one exact folder and public_id. The Cloudinary API
secret never reaches the browser, and the resulting Firestore metadata
is taken from Cloudinary's own verified response rather than from the
client.

Reports are uploaded as `type: authenticated`, so no plain Cloudinary
URL can fetch them; `getReportDownloadUrl` re-checks ownership and mints
a link that expires after 10 minutes. Reports created before this change
still live in Firebase Storage and are served the same way — the
function branches on `storageProvider`.

**All writes to `reports` and `mediaAssets` are Cloud-Function-only.**
The previous rules let a catalog manager create a report with an
arbitrary `userId`, or repoint an existing report's `filePath`; since
the download function only checked that the *caller* owned the report,
that was a real path to serving customer B's health data to customer A.
The functions now derive `userId` from the booking document and take
every file field from Cloudinary.
