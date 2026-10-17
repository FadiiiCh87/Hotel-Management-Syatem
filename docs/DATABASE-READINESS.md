# PK-Hotels — Database readiness checklist

This branch contains database schema and API implementation, but **no dedicated database has been provisioned or migrated**.

## Verification order
Use a fresh **disposable** PostgreSQL database, not the existing unrelated Supabase project.

1. Run `apps/api/prisma/phase1.sql`
2. Run `apps/api/prisma/seed-pk-hotels-rooms.sql`
3. Run `apps/api/prisma/phase2-billing.sql`
4. Run `apps/api/prisma/phase2-tax-safety.sql`
5. Run `apps/api/prisma/verify-pk-hotels.sql`

The verification transaction rolls back its test guest and reservation. It checks 40 distinct rooms, category rates, VAT-unconfirmed state, three-night SAR 300 calculation for Standard, and exclusion of overlapping reservations.

## Required next tests
- Concurrent transactions trying to book the same room
- Concurrent room blocks and bookings
- Folio creation idempotency and payments retry handling
- Staff role boundaries and cross-hotel data isolation
- Actual API compilation and integration tests
- VAT/tax compliance before any official invoice issuance

No live operations should begin before all release gates pass.
