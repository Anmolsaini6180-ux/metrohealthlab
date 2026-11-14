# Private data migration — runbook (Phase C)

Moves the seven private Firestore collections onto Supabase **staging**.
Nothing here changes Firebase, and nothing here changes the running
application.

Collections: `users`, `patients`, `addresses`, `bookings`, `reports`,
`notifications`, `auditLogs`.

## Why staging, and not the live tables

`public.profiles.id` is a foreign key onto `auth.users.id`, and every
other private table (`bookings`, `reports`, `notifications`,
`staff_roles`, `audit_logs`) hangs off `profiles.id`.

Firebase Auth accounts are **not** being migrated yet, so there are no
`auth.users` rows for private data to point at. Importing into the live
tables today is therefore impossible, not merely inadvisable.

`staging.fs_*` keeps every document under its **Firebase document id**,
with relationships preserved as text and the full document in a `doc`
jsonb column. Nothing is lost, everything is verifiable now, and the
rows can be promoted into the live tables at cutover once auth accounts
exist and a `firebase_uid -> auth uid` mapping is available.

## Before you start

You need a Firebase service-account key with read access to Firestore.

1. Firebase console -> Project settings -> Service accounts -> **Generate
   new private key**. This creates a `.json` file.
2. Save it **outside this repository**, e.g.
   `C:\Users\SAINI\secrets\metro-health-firebase.json`.
   The scripts refuse to run if the key is inside the repo.
3. The service account needs the **Cloud Datastore User** role (read is
   enough; the export never writes).

Never paste the key into a chat, a commit, or a file inside the project.

### Credentials

Set these in the terminal you run the scripts from. Nothing is written
to disk, and no script ever prints a credential.

PowerShell:

```bash
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\Users\SAINI\secrets\metro-health-firebase.json"
$env:SUPABASE_URL = "https://tnjnbbeqlqhpbfkoebpl.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "<service-role key from Supabase -> Project Settings -> API>"
```

The service-role key bypasses RLS. Use it only in your own terminal,
never in the browser app, and never commit it.

## Step 1 — Export (read-only)

Choose an output directory **outside the repo**. It will contain names,
phone numbers and addresses.

```bash
node scripts/migration/private-export.mjs --out "C:\Users\SAINI\metro-health-export"
```

Options: `--resume` continues from the last saved page token,
`--collections users,bookings` limits the run, `--limit 50` takes a
small sample first.

A smoke test before the full run is worth it:

```bash
node scripts/migration/private-export.mjs --out "C:\Users\SAINI\metro-health-export-sample" --limit 25
```

## Step 2 — Report (local only, no credentials needed)

```bash
node scripts/migration/private-report.mjs --in "C:\Users\SAINI\metro-health-export"
```

Prints source counts, id integrity, and every relationship check, and
writes `migration-report.json` next to the data.

Exit code `1` means a **blocking** problem: an id appearing twice with
*different* documents, or a document with no id. Identical duplicates
are fine — a resumed export can re-fetch a page, and the importer
collapses them.

Orphaned references do **not** block. They are facts about the
production data; they are reported and carried forward rather than
silently dropped.

## Step 3 — Dry run

```bash
node scripts/migration/private-import.mjs --in "C:\Users\SAINI\metro-health-export" --dry-run
```

Validates, de-duplicates and counts. Sends nothing, and needs no
Supabase credentials at all.

## Step 4 — Import into staging

```bash
node scripts/migration/private-import.mjs --in "C:\Users\SAINI\metro-health-export" --verify
```

Then compare source vs target counts in the output.

Properties:

- **idempotent** — every write is `INSERT ... ON CONFLICT (id) DO UPDATE`,
  so re-running converges instead of duplicating
- **transaction-safe per batch** — each batch is one statement inside
  `stage_upsert`, so a batch lands completely or not at all
- **resumable** — applied batches are recorded in `_import-checkpoint.json`;
  add `--resume` to continue after an interruption

Cross-batch atomicity is not available over HTTP. Idempotent upserts plus
the checkpoint mean a resumed run converges to the same state, which is
the property that matters.

If a batch fails, fix the cause and re-run with `--resume`.

## Step 5 — Verify

`--verify` prints the server-side report. You can also run it directly
in the Supabase SQL editor:

```sql
select jsonb_pretty(public.stage_report());
```

It returns target counts, orphan counts, booking references into the
already-migrated catalogue, money totals, and auth readiness.

`users_without_live_profile` will equal the total user count until Auth
is migrated. That is expected at this stage, not a fault.

## What is deliberately NOT done

- Firebase Auth accounts are not migrated
- `LoginPage`, `AdminLoginPage`, `authService`, `useAuth` and every
  application Firebase import are untouched
- Supabase Auth is not enabled as the production provider
- no live application table is written
- no Firebase data is modified or deleted

## Security notes

- credentials are read only from environment variables, or from a file
  whose path comes from one
- the key file must live outside the repo; the scripts refuse otherwise
- the export directory must be outside the repo, because it holds
  personal data
- no credential is printed, logged, or written into any generated file
- errors are redacted before surfacing, so a failing HTTP call cannot
  echo a token
- the `staging` schema is not exposed through PostgREST; writes go
  through `stage_upsert`, which is `service_role` only
- all `staging` tables have RLS enabled with no policies, so a mis-grant
  still exposes nothing

## Promotion at cutover (later, not now)

Once Auth is migrated and each Firebase uid has a Supabase auth user:

1. insert `public.profiles` rows with `firebase_uid` set
2. join `staging.fs_*` to `profiles` on `firebase_uid` to resolve every
   text key into the matching `uuid`
3. insert into the live tables in FK-safe order
4. re-run the integrity checks against the live tables

Step 2 is the whole reason `firebase_uid` exists on `profiles` and why
staging keeps the original ids.
