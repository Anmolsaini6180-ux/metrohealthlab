# Manual test checklist — production hardening pass

Run against the Firebase emulator suite (`firebase emulators:start`) or
a staging project before shipping. None of this has been executed yet
— this is the checklist to work through, not a report of passing tests.
Compilation passing is NOT the same as any of this passing.

## Authentication
- [ ] Google sign-in creates a `users/{uid}` profile on first login
- [ ] Email sign-up + login
- [ ] Email login with wrong password shows an error, doesn't crash
- [ ] Phone/OTP: enter number → Send OTP → wrong code shows an error →
      correct code signs in and creates/loads the profile
- [ ] Phone/OTP: Resend OTP works after a first send
- [ ] Phone/OTP: Change number returns to the phone-entry step cleanly
- [ ] Logout clears `useAuth()` state and protected routes redirect to `/login`
- [ ] Visiting a protected route (`/bookings`, `/profile`, ...) while
      signed out redirects to `/login` and back after login

## Profile / family / addresses
- [ ] Add / remove a family member; relationship + dob + gender persist
- [ ] Add / edit / remove an address; "set default" only ever marks one
- [ ] A second signed-in account cannot see the first account's patients/addresses (test directly against Firestore rules, not just the UI)
- [ ] Updating `name`/`phone`/`photoUrl`/`dateOfBirth`/`gender`/`preferences` on your own `users/{uid}` succeeds
- [ ] Attempting to write `role`/`isAdmin`/`staff`/`permissions` (or any field outside the allowlist) on `users/{uid}` directly via the SDK is rejected by rules
- [ ] Attempting to change a `patients/{id}` or `addresses/{id}` document's `userId` field (reassigning it to another user) is rejected by rules, even by the current owner

## Catalog
- [ ] Tests/packages list only shows `active: true` documents
- [ ] Search returns partial name matches, case-insensitive
- [ ] Test/package detail pages list only `active` labPricing entries
- [ ] Catalog cards read "Starting from ₹X", not a bare price

## Serviceability
- [ ] Serviceable pincode returns the right `collectionFee` and `areaId`
- [ ] Non-serviceable pincode blocks the Next button with a clear message
- [ ] Center-visit collection type doesn't require `homeCollectionAvailable`

## Price quote (getBookingQuote)
- [ ] Reaching the coupon/review step calls `getBookingQuote` and the review screen shows exactly what it returned — no client-computed number ever appears
- [ ] The quote's `subtotal`/`collectionFee`/`discount`/`finalAmount` match what `createBooking` actually charges for the same inputs
- [ ] Changing collection type or address and going back through the "Next" button on the collection step refreshes the quote
- [ ] A `priceQuotes/{quoteId}` document is created for every quote call and cannot be read or written by the client directly
- [ ] Quote request for a `patientId`/`addressId` you don't own returns `permission-denied`

## Booking — happy path
- [ ] Full flow: patient → home collection + address → date/slot → coupon → UPI → Razorpay test-mode success → tracking page shows "confirmed" within a few seconds (webhook-driven, no refresh)
- [ ] Same flow with `cash_on_collection` — booking is `confirmed` immediately after `createPaymentOrder`, no Razorpay modal opens
- [ ] `bookings/{id}` document has server-authoritative `subtotal`/`collectionFee`/`discount`/`finalAmount` — tamper with the price sent from the browser devtools and confirm the server-side amount wins regardless of what the quote or the tampered request said

## Slot race condition
- [ ] Set a slot's `capacity` to 1. From two browser sessions, submit the
      same slot at the same time — exactly one `createBooking` succeeds,
      the other gets a "fully booked" error, and `slots/{id}.bookedCount`
      never exceeds `capacity`

## Coupons
- [ ] Valid coupon within window/minimum order applies the right discount — same discount whether shown by `getBookingQuote` (preview) or actually applied by `createBooking`
- [ ] Expired / not-yet-started coupon is rejected with a clear error at booking time, not silently dropped; the quote screen shows the same reason as a message instead of hard-failing
- [ ] `usageLimit` exhausted (set `usedCount >= usageLimit` manually) → booking fails with a clear error, `usedCount` never exceeds `usageLimit`
- [ ] `perUserLimit` — same user attempts a booking with the coupon more times than allowed → rejected
- [ ] `applicableTests`/`applicablePackages`/`applicableLabs` — coupon correctly rejected for an out-of-scope item/lab
- [ ] Two simultaneous bookings by two different users with a coupon that has exactly 1 use left — only one succeeds
- [ ] Calling `getBookingQuote` with a coupon code never increments `usedCount` — only an actual `createBooking` does
- [ ] The `coupons` collection cannot be read directly by the client (only via `getBookingQuote`'s safe summary)

## Payment
- [ ] Razorpay test-mode success → checkout shows "Payment verification in progress..." → webhook fires → payment `success`, booking `confirmed`, both `payment_successful` and `booking_confirmed` notifications created → UI shows confirmed, never before the webhook lands
- [ ] Razorpay test-mode failure / closing the checkout modal → booking stays `payment_pending`, "Retry payment" appears immediately (not "payment successful")
- [ ] Artificially delay the webhook (or block it in the emulator) — after ~15s the UI moves to the tracking page's "Waiting for payment confirmation..." state instead of hanging or claiming success
- [ ] Retry payment after failure creates a *new* payment doc, does **not** create a second booking
- [ ] Replay the same webhook payload twice (e.g. via the Razorpay dashboard's "resend") — no duplicate notifications, no double status transitions (check `processedWebhookEvents`)
- [ ] Webhook with an invalid signature is rejected with 400 and no Firestore writes happen
- [ ] Webhook for an order ID with no matching payment doc responds 200 and writes an `auditLogs` entry instead of crashing

## Payment order recovery
- [ ] Manually set a `payments/{id}` doc to `status: "processing"` with no `gatewayOrderId` and try `createPaymentOrder` again for that booking — it's marked `failed` (`failureReason: "missing_gateway_order"`) and a fresh payment attempt is created, not reused
- [ ] Manually set a `processing` payment's `createdAt` to >20 minutes ago (with a valid `gatewayOrderId`) — same recovery kicks in (`failureReason: "stale_processing"`)
- [ ] A genuinely fresh `processing` payment (valid order, <20 min old) is reused, not duplicated, on a double-click

## Realtime tracking
- [ ] `/track/:bookingId` updates automatically (no refresh) when `bookingStatus` changes in Firestore
- [ ] `bookingStatusHistory` entries render in order

## Notifications
- [ ] `booking_received` fires right after `createBooking`
- [ ] `booking_confirmed` fires only after actual confirmation (cash: immediately; online: after webhook) — never at `createBooking` time
- [ ] Marking a notification read only flips the `read` field (test directly against rules that no other field can be changed by the client)

## Reports
- [ ] `getReportDownloadUrl` returns a URL that works, and stops working after ~10 minutes
- [ ] A user cannot fetch another user's `reportId` (permission-denied)
- [ ] Direct Storage read of a `reports/` path — even by the file's owner, using the Storage SDK directly instead of the function — is denied outright by `storage.rules`
- [ ] Every successful `getReportDownloadUrl` call writes an `auditLogs` entry

## Security rules (test directly, not just through the UI)
- [ ] Client write attempts fail for: `tests`, `packages`, `labs`, `labPricing`, `slots`, `coupons`, `couponUsage`, any field on `bookings`, `payments`, `reports`, `roles`, `permissions`, `auditLogs`, `bookingRequests`, `processedWebhookEvents`, `priceQuotes`
- [ ] Client can read/write only their own `patients`, `addresses` — and can never reassign either to a different `userId`
- [ ] Client can read only their own `bookings`, `payments`, `reports`, `notifications`, `supportTickets`
- [ ] The `coupons` collection cannot be listed or read by any signed-in client
- [ ] A user without a `role` custom claim is denied by every `isStaff()`-gated rule, even if they create a `roles/{their-own-uid}` document pointing at themselves (they can't — `write: if false` — but verify the attempt fails)

## Unauthorized access
- [ ] Calling `createBooking`/`getBookingQuote`/`createPaymentOrder`/`getReportDownloadUrl` while signed out returns `unauthenticated`
- [ ] Calling `createBooking` or `getBookingQuote` with someone else's `patientId`/`addressId` returns `permission-denied`

## Customer role escalation
- [ ] No client code path can set a Firebase Auth custom claim on the signed-in user's own token
- [ ] Writing `role: "admin"` to your own `users/{uid}` document is rejected by rules (not in the allowed field list)
- [ ] `isStaff()` never evaluates true from Firestore data alone — only from `request.auth.token.role`

## Responsive
- [ ] Mobile (<480px): bottom nav visible, no horizontal scroll, booking wizard usable one step at a time
- [ ] Tablet (768–1023px): card grids reflow to 2 columns
- [ ] Desktop (≥1024px): full navbar, bottom nav hidden, 3–4 column grids
