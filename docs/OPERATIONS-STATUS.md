# PK-Hotels operational update — 17 October 2026

## Implemented
- Staff dashboard: room inventory, dated availability, guest directory/creation, reservations, check-in, cancellation, folio charges/discounts, external payment records, printable draft statements, rates, housekeeping, and maintenance blocks.
- Checkout requires a settled folio, closes the folio, and marks the room for cleaning.
- Booking and maintenance endpoints lock the physical room before checking overlaps. Reservation exclusion constraints remain active.
- Occupied counts derive from checked-in reservations.
- Every authorized request rechecks staff active status and role. Login attempts are limited and database failures return sanitized errors.
- `/api/v1/health/ready` checks required configuration and actual database connectivity.

## Validation
- `npm test`: 41 HTTP checks against isolated PGlite PostgreSQL with actual schema, constraints and SQL. Includes duplicate booking, block conflicts, balances, idempotency, overpayment, checkout, rate snapshots, revoked staff, role restrictions and unconfirmed VAT. PGlite adapter serializes a single database; this is not a production connection-pool or concurrent transaction load test.
- Production frontend and backend builds passed.
- Browser visual QA could not run: Chromium download failed in this environment.

## Live blocker
Supabase project `pk-hotels-hms` is healthy and contains the approved 40 rooms and rates. Existing admin password hash was locally verified against the user-provided password; no password reset was made. Render runtime logs show connection failures. The current secret environment values cannot be read through the available Render plugin, and the exact project Session Pooler endpoint cannot be read through the available Supabase plugin. Dashboard access is required to finish connection configuration and live workflow testing.

VAT status remains UNCONFIRMED. Statements are explicitly drafts, tax values are not invented, and official tax invoice issuance stays disabled.

## Operational review still required
Confirm room capacities, backup/restore capability, staff access requirements and real hotel user acceptance. Production concurrency tests and final desktop/mobile visual verification remain open. See RELEASE-GATE.md; this update does not assert that every release gate has passed.
