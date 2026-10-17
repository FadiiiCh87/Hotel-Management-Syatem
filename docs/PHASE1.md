# PK-Hotels — operational Phase 1
**Hotel:** PK-Hotels. **Declared room count:** 40. **State:** development branch, not production-ready.

## Isolation and data integrity
- Use a **new, dedicated PostgreSQL database**. Do not use the existing Supabase project named `codealpha-projects`.
- Apply `apps/api/prisma/phase1.sql` only after provisioning and approving the dedicated database.
- SQL seeds exactly one hotel record and its expected room count. **No invented room numbers, types, rates, guests, or staff.**
- Database exclusion constraints prevent overlapping active reservations for a physical room.
- The reservations API rejects overlapping maintenance blocks; additional DB-level cross-table enforcement and race-condition tests are required before production.
- Real guest data must not be entered until access control, privacy, logging, backups, and restore drills are verified.

## API foundation
- `POST /api/v1/auth/login` — short-lived JWT for provisioned staff.
- `GET /api/v1/operations/hotel` — hotel metadata.
- `GET /api/v1/operations/rooms` — configured rooms.
- `POST /api/v1/operations/room-types` — manager/admin.
- `POST /api/v1/operations/rooms` — manager/admin; max 40.
- `POST /api/v1/operations/guests` — staff.
- `GET /api/v1/operations/reservations` — staff.
- `POST /api/v1/operations/reservations` — staff, physical-room booking.
- `POST /api/v1/operations/reservations/:id/status` — allowed state transitions.

## Local setup (development only)
1. Create a new empty PostgreSQL database.
2. Set `DATABASE_URL` and a randomly generated `JWT_SECRET` (at least 32 characters) in the backend environment.
3. Apply `phase1.sql` to that database.
4. Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` (14+ characters); execute `npx tsx apps/api/scripts/create-admin.ts` from project root.
5. Install packages, generate Prisma client if needed, and start API. Confirm `GET /api/v1/health`.
6. Provision actual room types, rates, and the 40 actual room identifiers after confirming them with hotel management.

## Before go-live
Complete HTTPS-only session strategy, MFA, token revocation, rate limiting, detailed RBAC, immutable audit records, availability/block concurrency tests, housekeeping room readiness, invoices/ledger/payment reconciliation, privacy controls, backups, monitoring, and UAT. Frontend currently remains a demo and is **not** connected to the new APIs.
