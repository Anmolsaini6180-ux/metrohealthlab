# Deployment guide — Metro Health Lab

Production: **https://metrohealthlab.in**
Firebase project: **`metro-health-0001`**
Frontend host: **Vercel** (from GitHub `main`)
Backend: **Firebase Cloud Functions** (deployed by GitHub Actions)

---

## The workflow you get after setup

```
git add .
git commit -m "update"
git push origin main
```

Then, with no further action from you:

```
GitHub main
   ├─► GitHub Actions "CI"                       (typecheck, tests, build, rules tests)
   │        │
   │        ├─► on success ─► "Deploy Firebase backend"
   │        │                    ├─ Cloud Functions   (only if functions/ changed)
   │        │                    └─ Firestore + Storage rules (only if those files changed)
   │        │
   │        └─► on failure ─► nothing deploys; the live site is untouched
   │
   └─► Vercel Git integration
            ├─ npm ci
            ├─ npm run build
            └─ promote to metrohealthlab.in  (gated on the CI checks above)
```

You never open the Vercel dashboard, never run `firebase deploy`, and never
touch the Firebase Storage console to upload an image or a report.

---

## One-time setup

Everything in this section is done once. None of it can be done from the
repository — it all lives in the Vercel, GitHub, Firebase and Cloudinary
dashboards.

### 1. Vercel → GitHub

1. Vercel → **Add New… → Project** → import this GitHub repository.
2. Vercel reads `vercel.json`, so framework, install command, build command and
   output directory are already correct. Do not override them in the dashboard —
   dashboard values take precedence over the file and will silently drift.
3. Project → Settings → **Git**: confirm the Production Branch is `main`.
4. Project → Settings → **Domains**: `metrohealthlab.in` should already be
   attached. If you are re-creating the project, re-add it here.

### 2. Vercel environment variables

Project → Settings → **Environment Variables**. Add for both *Production* and
*Preview*:

| Name | Value | Notes |
|---|---|---|
| `VITE_RAZORPAY_KEY_ID` | your Razorpay **publishable** key (`rzp_live_…`) | Required, or the checkout modal will not open |

That is the only one required. The Firebase Web config is compiled in as a
default (see `src/firebase/config.ts`); the optional `VITE_FIREBASE_*`
overrides exist only for pointing a preview at a different Firebase project.

**Never** add `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` or
`CLOUDINARY_API_SECRET` to Vercel. Anything prefixed `VITE_` is compiled into
public JavaScript, and Vercel is the frontend host — server secrets have no
reason to be there. CI has a check that fails the build if one shows up in
`dist/`.

### 3. Vercel → require CI before promoting to production

Project → Settings → **Deployment Checks** → **Add Checks** → provider
**GitHub** → select the **CI** workflow's checks.

This is what makes a failed test keep the old production build live instead of
shipping a broken one. Also confirm automatic aliasing for production is on
under the production environment settings.

### 4. Firebase service account for GitHub Actions

1. Google Cloud console → **IAM & Admin → Service Accounts** for
   `metro-health-0001` → create a service account, e.g. `github-deployer`.
2. Grant it: **Firebase Admin**, **Cloud Functions Admin**, **Service Account
   User**, **Cloud Datastore Index Admin**, and **Secret Manager Admin**.

   Secret Manager Admin is not optional here and is the most common cause of a
   first-deploy failure: the functions declare secrets with `defineSecret`, and
   deploying them binds each secret version to the function. Without that role
   the deploy fails with a Secret Manager permission error even though
   everything else is configured correctly.

   Cloud Functions deploys also need Cloud Build and Artifact Registry access,
   which Firebase Admin covers on most projects — if a deploy still fails on
   permissions, the error names the exact missing role.
3. Create a **JSON key** and download it.
4. GitHub repo → Settings → Secrets and variables → **Actions** → New
   repository secret:

   | Name | Value |
   |---|---|
   | `FIREBASE_SERVICE_ACCOUNT` | the entire contents of that JSON key file |

The workflow writes it to a temp file outside the workspace, exports
`GOOGLE_APPLICATION_CREDENTIALS`, and deletes it in an `always()` step.

### 5. Firebase Functions secrets

Run these once from your machine (you need `firebase login` first). They are
stored in Google Secret Manager and never appear in the repository, in Vercel,
or in any `.env`:

```bash
firebase use metro-health-0001

firebase functions:secrets:set RAZORPAY_KEY_ID
firebase functions:secrets:set RAZORPAY_KEY_SECRET
firebase functions:secrets:set RAZORPAY_WEBHOOK_SECRET
firebase functions:secrets:set SUPER_ADMIN_BOOTSTRAP_SECRET

firebase functions:secrets:set CLOUDINARY_CLOUD_NAME
firebase functions:secrets:set CLOUDINARY_API_KEY
firebase functions:secrets:set CLOUDINARY_API_SECRET
```

Check what exists at any time with `firebase functions:secrets:access <NAME>`.

Adding or rotating a secret requires a functions redeploy to take effect —
push any commit touching `functions/`, or run the **Deploy Firebase backend**
workflow manually from the Actions tab.

### 6. Cloudinary

1. Create (or open) the Cloudinary account. Dashboard → **API Keys**: this is
   where `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and
   `CLOUDINARY_API_SECRET` come from for step 5.
2. Settings → **Security**: make sure **"Allow delivery of PDF and ZIP files"**
   is enabled *only if* you deliver report PDFs. Reports are uploaded as
   `type: authenticated`, so they are not publicly reachable either way, but
   this setting can otherwise block delivery.
3. No upload preset is needed. This project uses **signed** uploads only — the
   signature is minted per-upload by a Cloud Function against one exact folder
   and public_id. There is no unsigned preset to leak or abuse.

Folder layout Cloudinary will end up with:

```
metro-health/
├── branding/     logo, favicon
├── banners/      home page banners
├── tests/        test images
├── packages/     package images
├── labs/         lab images
└── reports/
    └── <customer uid>/   report files (type: authenticated, never public)
```

### 7. Razorpay webhook

After the first successful backend deploy, take the `razorpayWebhook` function
URL from the Actions log (or `firebase functions:list`) and set it in the
Razorpay dashboard → Settings → **Webhooks**:

- URL: `https://<region>-metro-health-0001.cloudfunctions.net/razorpayWebhook`
- Secret: the same value you set as `RAZORPAY_WEBHOOK_SECRET`
- Active events: `payment.captured` and `payment.failed`

---

## Local development

```bash
npm install
cp .env.example .env      # add VITE_RAZORPAY_KEY_ID if you want checkout to open
npm run dev               # http://localhost:5173

cd functions
npm install
npm run build
```

Useful commands:

| Command | What it does |
|---|---|
| `npm run typecheck` | TypeScript, no emit |
| `npm test` | Frontend unit tests |
| `npm run test:rules` | Firestore rules tests (starts the emulator; needs Java) |
| `npm run build` | Production build into `dist/` |
| `npm run verify` | typecheck + build + tests, i.e. what CI runs |
| `npm test` *(in `functions/`)* | Cloud Function unit tests |

---

## Environment variables and secrets — the full picture

| Name | Where it lives | Public? |
|---|---|---|
| `VITE_RAZORPAY_KEY_ID` | Vercel env vars | Yes — compiled into the bundle |
| `VITE_FIREBASE_*` (optional) | Vercel env vars | Yes — Firebase web config is not a secret |
| `RAZORPAY_KEY_ID` | Firebase Secret Manager | Server only |
| `RAZORPAY_KEY_SECRET` | Firebase Secret Manager | **Secret** |
| `RAZORPAY_WEBHOOK_SECRET` | Firebase Secret Manager | **Secret** |
| `SUPER_ADMIN_BOOTSTRAP_SECRET` | Firebase Secret Manager | **Secret** |
| `CLOUDINARY_CLOUD_NAME` | Firebase Secret Manager | Sent to the browser during signed upload |
| `CLOUDINARY_API_KEY` | Firebase Secret Manager | Sent to the browser during signed upload |
| `CLOUDINARY_API_SECRET` | Firebase Secret Manager | **Secret — never leaves the server** |
| `FIREBASE_SERVICE_ACCOUNT` | GitHub Actions secret | **Secret** |

---

## Media and report uploads

There is no Firebase Storage console step any more.

**Images** (logo, favicon, banners, test/package/lab images):
Admin panel → the relevant screen, or **Content → Media library** for the whole
catalogue. Upload, preview, replace and delete all happen in the panel.

**Reports:** Admin panel → **Reports** → *Upload report*. You give it a booking
ID and a file. The customer the report belongs to is read off the booking
server-side — you never type a user ID, which is what makes it impossible to
file a report against the wrong customer.

How an upload actually works:

```
Admin picks a file
   → Cloud Function issues a signature valid for ONE folder + public_id
   → browser uploads straight to Cloudinary (the file never passes through Functions)
   → Cloud Function asks Cloudinary what actually exists at that public_id
   → Firestore stores metadata taken from Cloudinary's answer, not from the browser
```

Report downloads go through `getReportDownloadUrl`, which re-checks that the
caller owns the report (or is staff), then mints a Cloudinary download link that
expires after 10 minutes. Reports uploaded before this change still live in
Firebase Storage and are served the same way — the function branches on
`storageProvider`.

---

## Rollback

**Frontend (Vercel).** Dashboard → **Deployments** → find the last known-good
production deployment → **⋯ → Promote to Production**. This is instant and does
not need a git revert. Do the git revert afterwards so the next push does not
re-deploy the bad commit.

**Backend (Cloud Functions).** There is no one-click rollback. Revert the commit
and push:

```bash
git revert <bad-commit-sha>
git push origin main
```

CI runs, then the deploy workflow redeploys the reverted code.

**Firestore rules.** Firebase console → Firestore → **Rules → History** shows
every previous ruleset with a rollback button. Use it if a rules change locks
people out, then fix `firestore.rules` in the repo so the next deploy does not
re-apply the broken version.

**Never** roll back by deleting the Vercel project or the Firebase functions —
that takes the site down rather than reverting it.

---

## Troubleshooting

**A route 404s on refresh (e.g. `/admin/bookings`).**
The SPA rewrite in `vercel.json` is missing or was overridden in the dashboard.
Check Project → Settings → Build & Output; if anything there is set explicitly,
clear it so `vercel.json` wins.

**Vercel deployed but the site shows "Firebase isn't configured".**
`firebaseConfig.apiKey` resolved empty — a `VITE_FIREBASE_API_KEY` env var is
set to an empty string in Vercel, overriding the compiled-in default. Delete
the empty variable.

**Checkout modal never opens.**
`VITE_RAZORPAY_KEY_ID` is not set in Vercel for that environment. Vercel env
var changes need a redeploy to take effect.

**Payments stay "processing" and never confirm.**
The webhook is not reaching Firebase, or the secret does not match. Check the
Razorpay dashboard's webhook delivery log first; a 400 there means the signature
check rejected it (`RAZORPAY_WEBHOOK_SECRET` mismatch), a 5xx means the function
errored — check `firebase functions:log --only razorpayWebhook`.

**Uploads fail with a Cloudinary error.**
Usually one of: the Cloudinary secrets are not set, or they were set but the
functions have not been redeployed since. Run the **Deploy Firebase backend**
workflow manually from the Actions tab.

**The deploy workflow says "FIREBASE_SERVICE_ACCOUNT is not set".**
Step 4 above was skipped, or the secret was added to an environment rather than
as a repository secret.

**The deploy workflow never runs.**
It triggers on the *CI* workflow completing successfully on `main`. If CI failed,
that is intentional — fix CI. Note that `workflow_run` triggers only fire for
workflow files that exist on the default branch, so the very first merge to main
is what activates it.

**Cloud Functions deploy fails on permissions.**
The error names the missing IAM role. Add it to the `github-deployer` service
account and re-run the workflow.

---

## What is NOT automated on purpose

- **Firestore index creation from ad-hoc queries.** Indexes deploy from
  `firestore.indexes.json`. If you add a query that needs a new composite index,
  Firestore's error gives you a link that creates it in the console — add it to
  the JSON file afterwards so it is reproducible.
- **Secret rotation.** Deliberately manual.
- **Deleting Cloudinary assets that nothing references.** The media library shows
  what exists; it does not know what still points at a file. Check before you
  delete.

---

# First deployment verification runbook

Run this once, in order. Each step says what "passed" looks like. Stop at the
first failure and fix it before moving on — later steps depend on earlier ones.

Where a step says **capture**, save that output; it's what's needed to diagnose
a failure.

---

## Phase 0 — local, before pushing anything

```bash
npm ci
npm run verify          # typecheck + build + unit tests
cd functions && npm ci && npm run typecheck && npm test && npm run build && cd ..
```

**Pass:** all green. 6 frontend tests, 29 function tests.

```bash
npm run test:rules
```

**Pass:** ~30 rules tests pass.

This is the first time this suite has ever run — it was written but never
executed (the Firestore emulator jar could not be downloaded in the environment
it was written in). Treat a failure here as a **test bug or a rules bug, both
plausible**, not as proof the rules are broken. Capture the full output.

Needs Java 17+ and a network path to `storage.googleapis.com` for the emulator
jar (one-time download).

---

## Phase 1 — CI

Push to a branch and open a PR against `main` — do **not** push straight to
main for the first run.

```bash
git checkout -b deploy/verify
git add . && git commit -m "deployment automation"
git push origin deploy/verify
```

**Pass:** three CI jobs green — `frontend`, `functions`, `rules`.

Known things that can fail on a first run:

| Symptom | Cause |
|---|---|
| `rules` job fails downloading the emulator | GitHub runner network or a Java version mismatch |
| `frontend` fails on the secret-leak step | Something genuinely leaked, **or** the regex matched prose. Read the matched line before assuming a leak |
| `functions` fails on `npm ci` | `functions/package-lock.json` out of sync with `package.json` |

---

## Phase 2 — Vercel preview

Opening the PR should produce a Vercel preview deployment automatically.

**Pass:** preview URL builds and loads.

Then verify SPA routing on the **preview URL** (this is the `vercel.json`
rewrite doing its job):

```bash
PREVIEW="https://<your-preview>.vercel.app"
for p in / /tests /packages /labs /articles /dashboard /admin /admin/bookings /articles/some-slug; do
  echo "$p -> $(curl -s -o /dev/null -w '%{http_code}' "$PREVIEW$p")"
done
curl -s -o /dev/null -w 'asset: %{http_code}\n' "$PREVIEW/favicon.png"
```

**Pass:** every route returns `200` (protected routes render the app shell and
redirect client-side, which is correct — the server must not 404). `favicon.png`
must also be `200` and must **not** be HTML:

```bash
curl -sI "$PREVIEW/favicon.png" | grep -i content-type
```

**Pass:** `image/png`. If it returns `text/html`, the rewrite is shadowing
static assets and `vercel.json` needs fixing.

---

## Phase 3 — merge and deploy the backend

Merge the PR. This triggers CI on `main`, then the deploy workflow.

**Pass:** the `Deploy Firebase backend` workflow runs and succeeds.

Most likely first-run failures:

| Symptom | Fix |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT is not set` | Setup step 4 — must be a *repository* secret, not an environment one |
| Secret Manager permission error | Grant **Secret Manager Admin** to the deployer service account |
| `Cloud Build`/`Artifact Registry` permission error | Grant the role named in the error |
| Deploy succeeds but functions error at runtime on a secret | Secret was set after the last deploy — re-run the workflow |

Then confirm what actually deployed:

```bash
npx firebase-tools@13 functions:list --project metro-health-0001
```

**Pass:** 42 functions listed, including `getMediaUploadSignature`,
`confirmMediaUpload`, `deleteMediaAsset`, `getReportUploadSignature`,
`confirmReportUpload`, `setReportReady`, `getReportDownloadUrl`,
`razorpayWebhook`. **Capture the `razorpayWebhook` URL** — Phase 6 needs it.

---

## Phase 4 — production frontend

**Pass:** Vercel promotes to `https://metrohealthlab.in` only after CI checks
pass (setup step 3). Re-run the Phase 2 routing loop against the production
domain.

Also verify the domain and TLS survived:

```bash
curl -sI https://metrohealthlab.in | head -5
```

---

## Phase 5 — Cloudinary media upload (end to end)

Nothing Cloudinary-related has ever run against a real account. This is the
step most likely to surface a genuine bug.

Signed in as `SUPER_ADMIN`, in the admin panel:

1. **Content → Media library → Banners → Upload image.**
   **Pass:** upload completes, thumbnail renders, the asset appears in the grid.
   **Capture** the browser console and network tab if it fails — the failing
   call is either `getMediaUploadSignature` (a Cloud Function error, usually a
   missing secret) or the `POST` to `api.cloudinary.com` (a signature mismatch).
2. **Copy URL**, open it in a private window. **Pass:** the image loads (banner
   images are meant to be public).
3. **Delete.** **Pass:** it disappears from the grid *and* from the Cloudinary
   media library. Re-opening the copied URL should now fail.
4. **Settings → Branding → upload a logo → Save.** **Pass:** the customer site
   header shows the new logo without a redeploy.

Check Cloudinary's dashboard: files must land under `metro-health/banners/`
and `metro-health/branding/`, not at the root.

---

## Phase 6 — report upload and download authorization

This is the security-critical one. You need **two** customer accounts with at
least one booking each — call them A and B.

1. Admin → **Reports → Upload report**, give it customer A's booking ID and a
   PDF, leave "mark ready" checked.
   **Pass:** upload succeeds; the report appears with status `ready`.
2. Cloudinary dashboard: the file is under
   `metro-health/reports/<A's uid>/` with delivery type **authenticated**.
   **Pass:** constructing a plain `res.cloudinary.com/.../<public_id>` URL by
   hand returns 401/404. If it returns the PDF, **stop — health data is
   public** and the upload `type` is not being applied.
3. Sign in as **customer A** → Reports → download.
   **Pass:** downloads. Copy the signed URL.
4. Wait 10+ minutes, re-open that URL. **Pass:** it now fails (expired).
5. Sign in as **customer B**. In the browser console:
   ```js
   // B calling the function with A's report id
   firebase.functions().httpsCallable('getReportDownloadUrl')({ reportId: '<A_REPORT_ID>' })
   ```
   **Pass:** `permission-denied`.
6. **Signed out**, same call. **Pass:** `unauthenticated`.
7. As B, try reading the doc directly: `getDoc(doc(db,'reports','<A_REPORT_ID>'))`.
   **Pass:** permission denied by rules.
8. As admin, download A's report. **Pass:** allowed, and an `auditLogs` entry
   appears with `actorType: "staff"`.
9. As admin, **Replace file** on an existing report. **Pass:** new file
   downloads; the old Cloudinary object is gone.

If any of 2, 5, 6 or 7 fails, treat it as a production incident — do not
continue, and do not upload real patient reports.

---

## Phase 7 — Razorpay webhook

Use **test mode** first. Set the webhook URL captured in Phase 3.

1. Make a booking as a customer and pay with a Razorpay test card.
   **Pass:** booking moves `payment_pending → confirmed`, the payment document
   reaches `status: success`, and the customer gets both notifications.
2. Razorpay dashboard → webhook delivery log. **Pass:** `200`.
3. **Replay the same webhook delivery** from the Razorpay dashboard.
   **Pass:** still `200`, and nothing changes — no duplicate notification, no
   second status-history entry. This is the idempotency ledger working.
4. Forge one:
   ```bash
   curl -i -X POST "<RAZORPAY_WEBHOOK_URL>" \
     -H 'Content-Type: application/json' \
     -H 'x-razorpay-signature: deadbeef' \
     -d '{"event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_fake","order_id":"order_fake"}}}}'
   ```
   **Pass:** `400 Invalid signature`, and **no** Firestore change.
5. Trigger a failed payment. **Pass:** payment `failed`, booking stays
   `payment_pending` and is retryable — not cancelled.

```bash
npx firebase-tools@13 functions:log --only razorpayWebhook --project metro-health-0001
```

**Pass:** no secret values in the logs.

---

## Phase 8 — the actual point of all this

```bash
# change something trivial and visible
git commit -am "verify pipeline" && git push origin main
```

**Pass:** CI runs → Vercel builds and promotes → the change is live at
`https://metrohealthlab.in`, with no dashboard clicks and no `firebase deploy`.

Then change something under `functions/` and push again.
**Pass:** the backend workflow deploys it; Vercel skips nothing it shouldn't.

Only after Phases 0–8 all pass is this pipeline verified.
