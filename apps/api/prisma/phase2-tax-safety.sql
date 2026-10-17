-- Phase 2A: tax status and invoice issuance safety gates.
-- Apply after phase2-billing.sql to the dedicated PK-Hotels database only.
BEGIN;
ALTER TABLE billing_settings
 ADD COLUMN IF NOT EXISTS registration_status text NOT NULL DEFAULT 'UNCONFIRMED'
 CHECK (registration_status IN ('UNCONFIRMED','REGISTERED','NOT_REGISTERED','REVIEW_REQUIRED')),
 ADD COLUMN IF NOT EXISTS tax_reviewed_at timestamptz,
 ADD COLUMN IF NOT EXISTS tax_reviewed_by uuid REFERENCES staff(id);
-- Tax rate stays NULL; never coerce unknown to 0.
INSERT INTO billing_settings(hotel_id,registration_status,vat_rate)
SELECT id,'UNCONFIRMED',NULL FROM hotels WHERE name='PK-Hotels'
ON CONFLICT(hotel_id) DO NOTHING;
CREATE TABLE IF NOT EXISTS invoice_drafts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 hotel_id uuid NOT NULL REFERENCES hotels(id),
 folio_id uuid NOT NULL,
 draft_revision integer NOT NULL DEFAULT 1 CHECK(draft_revision>0),
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','VOID_DRAFT')),
 currency char(3) NOT NULL DEFAULT 'SAR',
 tax_status_snapshot text NOT NULL DEFAULT 'UNCONFIRMED',
 created_by uuid NOT NULL REFERENCES staff(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,hotel_id),
 FOREIGN KEY(folio_id,hotel_id) REFERENCES folios(id,hotel_id)
);
CREATE INDEX IF NOT EXISTS invoice_drafts_folio_idx ON invoice_drafts(hotel_id,folio_id,created_at DESC);
COMMIT;
