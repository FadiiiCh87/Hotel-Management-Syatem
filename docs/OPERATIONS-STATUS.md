# PK-Hotels operational update — 18 October 2026

## Implemented
- Staff dashboard: room inventory, dated availability, guest directory/creation, reservations, check-in, cancellation, folio charges/discounts, external payment records, printable draft statements, rates, housekeeping, and maintenance blocks.
- Checkout requires a settled folio, closes the folio, and marks the room for cleaning.
- Booking and maintenance endpoints lock the physical room before checking overlaps. Reservation exclusion constraints remain active.
- Occupied counts derive from checked-in reservations.
- Every authorized request rechecks staff active status and role. Login attempts are limited and database failures return sanitized errors.
- `/api/v1/health/ready` checks required configuration and actual database connectivity.

## Validation
- `npm test`: 82 HTTP checks against isolated PGlite PostgreSQL with actual schema, constraints and SQL. Includes duplicate booking, block conflicts, balances, idempotency, overpayment, checkout, rate snapshots, revoked staff, role restrictions and unconfirmed VAT. PGlite adapter serializes a single database; this is not a production connection-pool or concurrent transaction load test.
- Production frontend and backend builds passed.
- Live login screen rendered in the cloud browser; signed-in desktop/mobile visual QA remains open.

## Live connection verified
The Render API is connected to the dedicated Supabase project `pk-hotels-hms` through the verified Session Pooler endpoint. The generated runtime credential is stored in Render, not in repository files. The `pk_hotels_runtime` role has table-specific grants and RLS restricted to PK-Hotels; it is not a superuser and cannot bypass RLS. TLS verification is enabled using the official Supabase CA through `PGSSL_CA`.

Verified on 18 October 2026:
- Readiness endpoint: HTTP 200, database connected.
- Existing admin credentials: HTTP 201, access token received; password unchanged.
- Hotel metadata: PK-Hotels, SAR, Asia/Riyadh, expected room count 40.
- Protected rooms endpoint: HTTP 200, 40 rooms.
- Guest, reservation, room-type and maintenance-block read endpoints: HTTP 200.
- Frontend origin allowed by CORS: `https://pk-hotels-web.onrender.com`.
- Updated code build and all 82 isolated checks passed, including GitHub CI.
- Live frontend login page rendered in the cloud browser. Browser sign-in and signed-in desktop/mobile visual QA remain unverified.

## Approved live workflow smoke test
On 18 October 2026, after explicit approval for temporary production test entries, 26 live checks passed through the deployed API:
- Admin sign-in and protected hotel/room reads.
- Two simultaneous overlapping booking attempts: exactly one created, one rejected.
- Booking versus maintenance block race: exactly one created, one rejected.
- Dated availability excludes the reserved room.
- Check-in succeeds for a ready room within the stay dates.
- Checkout is blocked before a folio is opened and settled.
- Opening a folio twice returns the same guest account.
- Room charges, service charges and discounts reconcile correctly.
- Overpayment is rejected; replaying the same payment records it once.
- A settled checkout closes the folio and marks the room CLEANING.
- Closed folios reject additional payments.
- Housekeeping restores the test room to AVAILABLE.
- Statement preview leaves VAT unconfigured and is not an official tax invoice.

No real payment was processed. The single marked test guest, its reservation and folio, synthetic charges/payment and temporary maintenance block were deleted with marker/ownership checks in a transaction. Follow-up SQL verified zero remaining test guest, reservation, folio, payment and block records, with all 40 rooms AVAILABLE. Physical-room status audit history was retained.

VAT status remains UNCONFIRMED. Statements are explicitly drafts, tax values are not invented, and official tax invoice issuance stays disabled.

## Operational review still required
Confirm room capacities, backup/restore capability, staff roster and real hotel user acceptance. Live concurrency smoke tests passed; broader load testing, restore drills and signed-in desktop/mobile visual verification remain open. See RELEASE-GATE.md; this update does not assert that every release gate has passed.

## Staff management and role dashboards
- Admin-only Users panel creates staff accounts, edits name/role, enables or disables access, and resets temporary passwords. Accounts are retained for audit history.
- New/reset accounts must change their temporary password before any operations, billing or statement access. Password changes require the current password and a new password of at least 12 characters.
- Every protected API checks the active database role and session version. Role changes, disabling/re-enabling, password resets and password changes revoke prior sessions.
- Receptionist opens a Reception dashboard with walk-in guest, reservation and billing shortcuts. Managers can also manage rates and maintenance; only admins can manage users. All roles can change their own password.
- Admins cannot disable or demote their own account. Staff changes and password events are audited without plaintext passwords.
- Additive migration: `supabase/migrations/20261018195112_staff_management.sql`. Production runtime gains only the staff INSERT/UPDATE columns needed; existing hotel RLS remains in force. No public Data API access is granted.
- 82 isolated HTTP checks passed, including receptionist walk-in creation/check-in, forced password change, manager permissions, admin restrictions, cross-hotel isolation and password-reset session revocation. No production staff test accounts were created.
