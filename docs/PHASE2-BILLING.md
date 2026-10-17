# PK-Hotels Phase 2 — Billing foundation
**Development only. Not a fiscal invoice, payment gateway, or production-ready folio.**

## Implemented
- SQL migration `apps/api/prisma/phase2-billing.sql` for folios, signed charge/discount lines, external payment records, nullable tax configuration.
- `POST /api/v1/billing/reservations/:reservationId/folio`: idempotently creates folio and **one** room charge using the Phase 1 nightly-rate snapshot × reservation nights.
- `GET /api/v1/billing/folios/:id`: shows lines, recorded payments, and **pre-tax** balance.
- `POST /api/v1/billing/folios/:id/lines`: records service charge or discount; manager/admin for adjustment.
- `POST /api/v1/billing/folios/:id/payments`: records **already received** external cash/bank/card payments with idempotency key. This does NOT charge a card.
- Tenant-scoped lookups and staff role checks; transaction lock for writes.

## Critical restrictions
- **VAT rate not assumed or automatically applied.** Obtain tax registration status and approved treatment, and implement compliant tax calculations before invoices.
- No ZATCA-compliant e-invoice issuance. No checkout-close workflow yet.
- No refund/void/correction ledger, payment gateway, settlement verification, or immutable double-entry accounting.
- `CARD_EXTERNAL` only records an external reference; it must not be presented as proof of settlement without reconciliation.
- Room pricing is snapshot-based: Normal SAR 60, Standard 100, Deluxe 200, Super VVIP 500.
- Room capacity remains unconfirmed.
- Do not migrate the existing unrelated Supabase project.
- SQL and API have not been run against a dedicated DB; integration and concurrency tests are still pending.
