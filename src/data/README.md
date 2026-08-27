Intentionally empty.

Per the project rules, no business data (tests, prices, packages, labs,
coupons, etc.) is ever hard-coded in the frontend — it all comes from
Firestore via `src/services/*`. This folder exists only so a future
genuinely-static, non-business constant (e.g. a list of Indian states
for an address dropdown) has an obvious home without being mistaken for
seed/mock data.
