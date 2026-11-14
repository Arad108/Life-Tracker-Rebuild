# Life Tracker — Recovery & Integration Checklist

Purpose: prepare for safe recovery of the original app source/build and integration of `fin-core` (I0–I13) once the original development environment is available. This is an actionable checklist, not a research document.

## 1. Available artifacts (recoverable now)

- `base.apk` — 119.9 MB, unsigned in this copy, package `com.lifetracker.app`, version 1.0.0 (versionCode 1), Expo SDK 57, Hermes bytecode.
- `extract/assets/index.android.bundle` — 4.46 MB Hermes bundle (decompiled to `decompiled2.js`).
- `analysis/*` — `schema.sql` (33 tables, 15 indexes), `dml.sql` (103 statements), `routes.txt` (42 routes), `copy_by_area.txt`, `ui_strings.txt`, `colors.txt`, `icons.txt`.
- `architecture/*` — implementation tasks, roadmap, audit.
- `fin-core/` — complete, tested library (282 tests, typecheck clean), latest commit `cf6ecc7698289707d9c54c065cfa1a95a05a53e0`.

## 2. Recovered original app inventory (concise)

- **Stack**: Expo SDK 57, React Native (new arch), Hermes, expo-router (42 routes), expo-sqlite (33 tables), expo-notifications, expo-image-picker, expo-sharing, expo-font (Inter).
- **Tabs**: Today, Spaces, Goals, You. Global Capture sheet.
- **Spaces (built-in)**: Tracker, Count, Check, Log, Quantity, Rating, Session, Subjects, Journal, Finance, Wardrobe, Workout, Social, Goals, Insights, Reminders.
- **Finance routes**: `/finance/index`, `/finance/add`, `/finance/category`, `/finance/recurring`.
- **Design tokens**: Inter 300/500/700; accent `#4F46E5`; light surfaces `#F7F6F3/#EFEDE8/#E3E1DB`; dark `#0F1012/#151718/#1B1B1D/#25262B`; MaterialCommunityIcons.
- **Money**: integer paise in `amount_minor`; day as local `YYYY-MM-DD` text; timestamps epoch ms.
- **DB**: 33 tables (trackers, tracker_fields, tracker_entries, settings, suggestions, spaces, goals, goal_milestones, goal_checkins, schedules, routines, routine_steps, routine_checks, fin_categories, fin_recurring, fin_transactions, wk_*, wd_*, so_*). No ORM; hand-written SQL; idempotent seeds guarded by `settings` keys.
- **Backup**: JSON export of all tables except photos (stored on device, explicitly excluded). `app: "life-tracker"`, `backupVersion: 2`, `schemaVersion` = `user_version`.

## 3. Exact files and credentials to recover

From the original development environment, obtain:

1. `package.json`, `app.json`/`app.config`, `eas.json`, `tsconfig.json`, `babel.config.js`, `metro.config.js`.
2. Full `app/` (expo-router routes) and `components/`, `lib/`, `db/`, `spaces/` source trees.
3. Original Android signing keystore (`.jks`/`.p12`) + alias + passwords, and the EAS credentials for project `99a6cd78-0cb9-40c0-b239-b84f95712264` (owner `arad108`).
4. Any local DB sample (`*.db`/`.sqlite`) from the phone or emulator for migration testing.
5. Real Slice statement sample (PDF/CSV) if statement import is to be validated.

## 4. Connecting `fin-core` to the original Expo SQLite

1. Add `fin-core` as a local dependency (file: or copy `src/` into the app).
2. Implement the `SqliteDriver` adapter against `expo-sqlite` (four async methods + `withTransactionAsync`). Sketch already documented in `fin-core/src/db/driver.ts`.
3. Call `runFinancialMigrations(driver)` on app startup (after the app's own migrations). It is additive and idempotent, guarded by `settings` keys.
4. Replace inline SQL aggregates in finance screens with `fin-core` exports (`summarise`, `balanceOf`, `netWorth`, `availableToSpend`, `budgetProgress`, etc.). Every number must come from `fin-core`, never from screen SQL.
5. Use `fin-core` write helpers (`recordTransaction`, `recordTransfer`, `recordRefund`, `recordBillPayment`, `setBudget`, `createSnapshot`, `commitImport`) instead of hand-written inserts.

## 5. Compatibility issues to expect

- **Schema drift**: the original DDL is schema version 2; `fin-core` expects its additive columns (`account_id`, `kind`, `transfer_id`, `refund_of_id`, `status`, `deleted_at`, `bill_due_day`, provenance columns) and new tables. The migration adds them idempotently via `hasColumn` guards.
- **Sign convention**: `migrateKinds` self-detects all-positive vs already-signed vs mixed. Mixed is left untouched and flagged (`fin_repair_required`) — do not force.
- **Budgets**: original `fin_categories.budget_minor` is copied into `fin_budgets` for the migration month only; the column is left in place but no longer written.
- **Recurring**: original `fin_recurring` has no `account_id`; `migrateBills` backfills to the default Cash account.
- **`user_version`**: read-only in `fin-core`; the app's own migration runner owns it.
- **Restore then migrate**: restoring a backup invalidates the migration ledger keys so sign detection re-runs on restored data. Always run `migrate → restore → migrate`.
- **No data reset**: never drop/recreate tables; all migrations are additive.

## 6. Safe APK update strategy (original identity)

- Package ID must remain `com.lifetracker.app`.
- Signing identity must be the original keystore (recovered from the original dev environment). A new key makes in-place install impossible.
- Build with EAS using the recovered credentials; do not generate a new key.
- Before distributing: verify `jarsigner`/`apksigner` certificate matches the installed app, and that Android allows install-over (same package + same cert).
- Ship `backupVersion` 2 exports; ensure `fin-core` tables are included in export/import (they are plain tables, so `exportBackup`/`restoreBackup` handle them automatically).
- Test migration on a copy of a real device DB before release.

## 7. Backup sufficiency

- The existing JSON backup covers all SQLite tables including the new `fin_*` tables, `settings`, and `fin_snapshots`/`fin_duplicate_candidates`.
- `fin-core` adds content-hash duplicate-restore detection (`last_restore_hash`) and merge/replace modes.
- **Photos are NOT in the backup** (stored on device, explicitly excluded). Preserve them separately: copy the app's photo directory via USB/`adb`, or keep the old APK installed until photos are verified.
- Photos live outside the DB; a restore that only restores JSON will lose them.

## 8. Do not do

- Do not generate a replacement app, dummy APK, new signing key, or speculative Slice parser.
- Do not uninstall the current app before backup verification.
- Do not reset or recreate the database to make an update work.

## 9. First integration steps once source is available

1. Restore source + keystore from the original dev environment.
2. Add `fin-core` (local dependency) and implement the `SqliteDriver` adapter.
3. Run `runFinancialMigrations` on startup; verify `MigrationReport` (accounts, kinds, budgets, bills, provenance) on a real DB copy.
4. Wire finance screens to `fin-core` exports; remove inline SQL aggregates.
5. Add tests: migration on real DB copy, backup round-trip, install-over on a test device.
6. Build signed APK with EAS using recovered credentials; verify cert matches installed app.
7. Export a backup from the phone before any install; install over; verify row counts, balances, and a sample of transactions.
8. Only then retire the old build.

## Known blockers

- Original app source unavailable (only decompiled bytecode).
- Original signing keystore unavailable.
- No Android build toolchain in this environment.
- No real Slice statement sample (parser intentionally not implemented).
- `expo-sqlite` adapter not yet written (app side).
- Photos require separate preservation (not in JSON backup).
