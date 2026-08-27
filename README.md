# Metro Health Lab — customer platform

React + TypeScript + Vite frontend, Firebase (Auth/Firestore/Storage) as
the single source of truth. No hard-coded business data anywhere — every
price, test, package, lab, slot, and coupon comes from Firestore.

**This project runs on the Firebase Spark (free) plan: no Cloud Functions
are deployed, and none are required to sign in or to determine a role.**
Authentication and authorization are Firebase Auth + Firestore +
Firestore Security Rules — see the section below. The `functions/` tree
is retained as reference code for the customer flows (booking, payment,
report/media signatures) that would need a Blaze upgrade; nothing in the
auth path touches it.

**Firebase project:** `metro-health-0001` — Firebase config is hardcoded
directly in `src/firebase/config.ts` (per explicit request, overriding
the earlier env-var-only setup) and is complete, including the API key.

## UI redesign pass — branding, dashboard, auth

> **Correction (deployment/automation pass).** An earlier version of
> this section said the Admin Panel had been skipped and that "nothing
> under `/admin` exists". That is no longer true and was left stale:
> a full admin panel now exists at `/admin` (27 screens, its own
> `AdminLayout`, role-gated by `AdminProtectedRoute`), plus an agent
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

## Authentication and authorization (Firebase Spark / free plan)

This project runs on the **Firebase Spark (free) plan**. Spark cannot host
Cloud Functions, so there is **no deployed backend code and no Firebase Auth
custom claims** anywhere in the sign-in or authorization path. Nothing in
the app calls a Cloud Function to log in or to find out who you are.

The security boundary is **Firebase Authentication + Firestore + Firestore
Security Rules**, and only that.

### The two trusted documents

| Document | Who can write it | What it decides |
| --- | --- | --- |
| `system/config` → `masterAdminUid` | **Nobody through the app.** `allow write: if false` for every client; only the Firebase Console / Admin SDK can create or change it. | The single root authority. Whoever's uid is in here is `SUPER_ADMIN`. |
| `users/{uid}` → `role`, `status`, `superAdminId`, `adminId`, `subAdminId` | Only a caller the rules have *already* established as a higher-ranked staff member, through one narrowly-scoped rule. | Every other staff assignment. |

`firestore.rules` re-reads both documents on **every single request** and
decides for itself. The React app reads them too, but only to know what to
draw — `useAdminRole()`, `AdminProtectedRoute` and every menu check are
presentation. Patching them in devtools changes what your own browser
renders and nothing about what the database will accept.

### What the rules guarantee

- **Nobody can assign `SUPER_ADMIN`** — not an admin, not a super admin,
  not through any code path. It is derived exclusively from
  `system/config`. A `users` document that claims `role: "SUPER_ADMIN"`
  for any other uid is *ignored*, not honoured.
- **You can never write your own authorization record.** The staff-write
  rule starts with `userId != request.auth.uid`, so self-promotion,
  self-demotion and self-revocation are all impossible.
- **You can only assign a role strictly below your own**
  (`SUPER_ADMIN → ADMIN → SUB_ADMIN → COLLECTION_AGENT`), and only to
  somebody inside your own subtree.
- **The ownership chain cannot be forged.** A new staff record must carry
  exactly the writing caller's own position in the tree, recomputed by
  the rules from the caller's stored record.
- **A revocation bites immediately.** `status` is read live on every
  request, so a removed role stops working on the very next operation —
  strictly better than the old custom-claim model, where a cached ID
  token stayed privileged for up to an hour.
- **Nothing else can ride along.** A staff write may only touch
  `role`, `status`, the three chain fields, `updatedAt` and `updatedBy`.

All of this is proven, not asserted: `tests/rules/firestore.rules.test.ts`
runs 91 cases against the Firestore emulator (`npm run test:rules`).

### First `SUPER_ADMIN` — the one manual step

A browser cannot be allowed to nominate the first super admin (that would
be precisely the self-promotion hole the rest of this design closes), and
there is no trusted server code to do it. So the project owner does it
once, by hand, in the Firebase Console:

1. Sign in to the site once with the account that should be master, so
   that a Firebase Auth account and a `users/{uid}` document exist.
2. Firebase Console → **Authentication → Users** → copy that account's
   **User UID**.
3. Firebase Console → **Firestore Database** → create collection
   `system`, document ID `config`, with one string field:
   `masterAdminUid` = the uid you copied.
4. Reload the site. That account is now `SUPER_ADMIN`; the app writes its
   own `users/{uid}` staff record on the next sign-in (the only write of
   its kind the rules permit, and only for that exact uid).

**`MASTER_ADMIN_EMAIL` no longer exists anywhere.** An email compared in
the browser is not an authorization boundary, and without server code
there is no way to turn one into one. The bootstrap is a uid in a
document no client can write — see DEPLOYMENT.md for the full procedure,
including the migration checklist for existing data.

### Adding and removing staff

Admin → **Settings → Admin & Staff**:

- **Add:** the person signs in to the site once with their own Google
  account, then you enter that email address and pick a role. The lookup
  goes through `userEmails/{email}`, a directory each person publishes
  for their **own verified address only** — so an admin can find an
  account by email without being able to enumerate the users collection,
  and nobody can point somebody else's address at their own uid.
  There is deliberately **no pending, email-keyed invite** any more: on
  Spark, a privileged record keyed by an address nobody has proven they
  own cannot be made safe, so a role is always attached to a real uid.
- **Change role / remove access / restore access:** ordinary Firestore
  writes to that person's `users/{uid}` record, allowed only within the
  hierarchy rules above. Removing access sets `status: "revoked"` and
  keeps the row so it can be restored.

### What Spark costs you, honestly

- **No Cloud Functions at all.** The `functions/` tree is retained as
  reference code but is not deployed and is not wired into
  `firebase.json`. The customer flows that genuinely need trusted server
  code — booking creation, price quoting, Razorpay payment/webhook,
  Cloudinary media and report signatures, admin bookings/customers
  queries and notifications — therefore do not work on this plan. They
  still fail *closed*.
- **No server-written audit log** for staff changes. `auditLogs` stays
  read-only to clients rather than letting a browser fabricate entries;
  Firestore's own console history is what you have instead.
- **A deactivated staff member's Firebase Auth account cannot be
  disabled** from the app (that needs the Admin SDK). Revoking their role
  removes all access; they can still sign in as an ordinary user.
- **Storage rules cannot see the Firestore role**, so the admin image
  paths in `storage.rules` are closed to everyone. Upload through the
  Firebase Console. Relaxing them to "any signed-in user" would let a
  customer overwrite public catalog imagery, so they stay shut.

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
    roleClaims.ts            LEGACY custom-claim guards (unused on Spark — nothing mints claims)
    *.test.ts                unit tests (vitest)
  (functions/ is NOT deployed on Spark and is not referenced by firebase.json)
src/services/roleService.ts  role resolution from Firestore (system/config + users/{uid})
src/services/adminTeamService.ts  staff management as rules-gated Firestore writes
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
- `isStaff()` no longer treats the existence of a `roles/{uid}`
  document as authorization. It was later moved to a Firebase Auth
  custom claim; on the Spark plan (no Cloud Functions, so nothing can
  mint a claim) it now reads `users/{uid}.role` + `.status` live,
  under a rule that lets only a higher-ranked staff member write those
  fields — see "Authentication and authorization" above for why that is
  equivalent in strength rather than a step back. `roles/{uid}` is kept
  only as a human-readable reference.

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

→ Cloud Functions
   → NOT enabled and NOT needed. Spark plan; nothing is deployed. Do not
     upgrade to Blaze for authentication or role management — neither
     needs it.

→ The first SUPER_ADMIN (one manual console step)
   → Firestore Database → create system/config with a string field
     masterAdminUid = the master account's Firebase Auth uid. That
     document is the root of the entire authorization model, and no
     client can write it. Full procedure in DEPLOYMENT.md.
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
workflow deploys the Firestore/Storage rules and indexes if those files
changed.

**Cloud Functions are never deployed** — the project is on the Spark
plan, where that command fails, and nothing in the running app needs
them. The emergency manual equivalent of the automated deploy is:

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage --project metro-health-0001
```

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

- `npm run test:rules` — the Firestore security-rules suite,
  91 cases against the real emulator, covering the bootstrap record,
  self-promotion, every rung of the role hierarchy, revocation,
  subtree scoping, the email directory, report cross-customer access,
  booking/payment tampering, coupon reads and the internal ledgers.

**Written but NOT yet run anywhere:**
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
`AdminProtectedRoute` + `useAdminRole`, which read the role from the
authorization context `AuthProvider` resolved out of Firestore
(`system/config` + `users/{uid}`) — the same two documents
`firestore.rules` reads on every request. The UI's idea of "what can I
see" therefore cannot drift from what is actually enforced, and the
provider does not publish a signed-in user until the role is known, so
no screen ever renders against an unknown or stale role.

Roles: `SUPER_ADMIN` → `ADMIN` → `SUB_ADMIN` → `COLLECTION_AGENT`. Each
can only assign a role strictly below it (`CREATABLE_ROLES` in
`src/types/team.ts`, mirrored by `canAssign()` in `firestore.rules` —
`src/utils/roleAccess.test.ts` pins the two together). There is no client
write path that can grant or escalate a role; see "Authentication and
authorization" above for the full model.

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
