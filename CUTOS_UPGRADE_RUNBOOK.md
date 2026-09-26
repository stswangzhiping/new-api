# CUTOS new-api Upgrade Runbook

This runbook records the database-safe process for upgrading the CUTOS new-api deployment from the current production release to a later upstream release.

## Current baseline

- Application branch: `dev-gateway-rc.40`
- Baseline commit: `9d1d3d42e`
- Upstream rc.40 base commit: `0aec08fee811ec6136828fda790551b49e410301`
- Production image at baseline: `new-api:rc40-base-20260925`
- Production database at baseline: `newapi_rc40_candidate_20260925`
- VM2 upgrade records: `/home/sts/newapi-upgrade-rc40/`
- Schema snapshot: `rc40-production-schema-20260926.sql`
- Schema SHA-256: `46dd89885c000b2cecab61b478e8b93cd11ebd23a678e3cd61ceb34fda3e4e71`

The schema snapshot is a reference, not a recoverable database backup. Keep a full database dump for restore and rollback.

## Upgrade procedure

1. Record the running container, image digest or tag, source commit, database name, and deployment configuration. Do not copy secrets into this repository.
2. Create a final full dump of the current production database and a separate schema-only dump. Generate and verify SHA-256 files for both.
3. Restore the full dump into a new candidate database. Never use the production database for the first migration attempt.
4. Build the candidate image from the new upstream base plus the CUTOS commits carried by the development branch. Record the exact commit and image tag.
5. Start one candidate container against the candidate database. Let the application run its normal GORM `AutoMigrate` path.
6. Restart the candidate container against the same candidate database to check that migration is idempotent.
7. Compare the candidate schema with the saved production schema. Review added, changed, or removed tables, columns, defaults, indexes, and constraints.
8. Verify the CUTOS schema explicitly, including `cc_billings`, `uq_cc_billing_user_month`, and the four `redemptions.cc_*` columns.
9. Run functional checks for login, token usage, redemption, quota accounting, billing display, and administrator operations. Confirm that existing records remain readable.
10. Stop writes or enter a maintenance window, take a new final production dump, and repeat the tested restore-and-migration process using that dump.
11. Switch production only after the candidate checks pass. Keep the previous image and final pre-upgrade dump until the rollback window closes.
12. Record commands, timestamps, database versions, migration logs, verification results, and the final image/database identifiers in the upgrade directory.

## Rollback rule

Application rollback and database rollback are separate operations. If the new version has changed the schema or written data in a new format, do not point the old application at the migrated database. Restore the final pre-upgrade dump into a separate database and start the previous image against that restored database.

## Required database validation

The project supports SQLite, MySQL, and PostgreSQL. A production PostgreSQL migration rehearsal does not prove general three-database compatibility. Before declaring a schema change complete for upstream-quality use, verify fresh migration, upgrade migration, and a second idempotent startup on all three engines. If resource constraints prevent that validation, record it as an explicit open gap.
