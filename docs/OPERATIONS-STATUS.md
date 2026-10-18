# PK-Hotels operational update — 18 October 2026

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
- Updated code build and all 41 isolated checks passed, including GitHub CI.
- Live frontend login page rendered in the cloud browser. Browser sign-in and signed-in desktop/mobile visual QA remain unverified.

Live mutation smoke tests were blocked by automatic approval review because creating synthetic guests, bookings, charges and payment records in production requires explicit authorization and a complete cleanup plan. No synthetic guest, reservation, block, folio or payment was created. Concurrent transaction testing against live infrastructure remains pending.

VAT status remains UNCONFIRMED. Statements are explicitly drafts, tax values are not invented, and official tax invoice issuance stays disabled.

## Operational review still required
Confirm room capacities, backup/restore capability, staff access requirements and real hotel user acceptance. Production concurrency tests and final desktop/mobile visual verification remain open. See RELEASE-GATE.md; this update does not assert that every release gate has passed.

