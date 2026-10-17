-- Phase 2 draft migration: apply ONLY to a dedicated PK-Hotels DB after Phase 1.
-- Monetary amounts in SAR; VAT intentionally unconfigured pending tax review.
BEGIN;
CREATE TABLE IF NOT EXISTS folios (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 hotel_id uuid NOT NULL REFERENCES hotels(id),
 reservation_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','CLOSED')),
 created_at timestamptz NOT NULL DEFAULT now(),
 closed_at timestamptz,
 UNIQUE(hotel_id,reservation_id), UNIQUE(id,hotel_id),
 FOREIGN KEY(reservation_id,hotel_id) REFERENCES reservations(id,hotel_id)
);
CREATE TABLE IF NOT EXISTS folio_lines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 hotel_id uuid NOT NULL REFERENCES hotels(id),
 folio_id uuid NOT NULL,
 line_type text NOT NULL CHECK(line_type IN ('ROOM','SERVICE','DISCOUNT','ADJUSTMENT')),
 description text NOT NULL,
 quantity numeric(12,2) NOT NULL CHECK(quantity>0),
 unit_price_sar numeric(12,2) NOT NULL CHECK(unit_price_sar>=0),
 amount_sar numeric(12,2) GENERATED ALWAYS AS (round(quantity*unit_price_sar,2)) STORED,
 direction smallint NOT NULL CHECK(direction IN (-1,1)),
 created_by uuid REFERENCES staff(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(folio_id,hotel_id) REFERENCES folios(id,hotel_id)
);
CREATE TABLE IF NOT EXISTS folio_payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 hotel_id uuid NOT NULL REFERENCES hotels(id),
 folio_id uuid NOT NULL,
 amount_sar numeric(12,2) NOT NULL CHECK(amount_sar>0),
 method text NOT NULL CHECK(method IN ('CASH','BANK_TRANSFER','CARD_EXTERNAL')),
 reference text,
 idempotency_key uuid NOT NULL,
 recorded_by uuid NOT NULL REFERENCES staff(id),
 recorded_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(hotel_id,idempotency_key),
 FOREIGN KEY(folio_id,hotel_id) REFERENCES folios(id,hotel_id)
);
CREATE TABLE IF NOT EXISTS billing_settings (
 hotel_id uuid PRIMARY KEY REFERENCES hotels(id),
 vat_rate numeric(5,4),
 tax_registration_number text,
 CHECK(vat_rate IS NULL OR (vat_rate>=0 AND vat_rate<=1))
);
CREATE INDEX IF NOT EXISTS folio_lines_by_folio ON folio_lines(hotel_id,folio_id);
CREATE INDEX IF NOT EXISTS folio_payments_by_folio ON folio_payments(hotel_id,folio_id);
COMMIT;
