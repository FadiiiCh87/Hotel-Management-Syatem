CREATE TABLE public.customer_accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), hotel_id uuid NOT NULL REFERENCES public.hotels(id),
 full_name text NOT NULL, email text NOT NULL, phone text NOT NULL,
 password_hash text NOT NULL, active boolean NOT NULL DEFAULT true,
 session_version integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(hotel_id,email), UNIQUE(id,hotel_id), CHECK(email=lower(email))
);
CREATE TABLE public.booking_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), hotel_id uuid NOT NULL REFERENCES public.hotels(id),
 customer_id uuid NOT NULL, room_type_id uuid NOT NULL,
 arrival_date date NOT NULL, departure_date date NOT NULL,
 nightly_rate numeric(12,2) NOT NULL CHECK(nightly_rate>0),
 advance_required_sar numeric(12,2) NOT NULL CHECK(advance_required_sar>0),
 status text NOT NULL DEFAULT 'PENDING_REVIEW' CHECK(status IN ('PENDING_REVIEW','AWAITING_PAYMENT','PAYMENT_REVIEW','CONFIRMED','REJECTED','CANCELLED')),
 customer_payment_reference text, decision_note text,
 verified_advance_sar numeric(12,2), verified_payment_method text CHECK(verified_payment_method IN ('CASH','BANK_TRANSFER','CARD_EXTERNAL')),
 verified_payment_reference text, verified_by uuid REFERENCES public.staff(id),
 reviewed_by uuid REFERENCES public.staff(id), reservation_id uuid,
 notification_version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(customer_id,hotel_id) REFERENCES public.customer_accounts(id,hotel_id),
 FOREIGN KEY(room_type_id,hotel_id) REFERENCES public.room_types(id,hotel_id),
 FOREIGN KEY(reservation_id,hotel_id) REFERENCES public.reservations(id,hotel_id),
 UNIQUE(id,hotel_id), UNIQUE(reservation_id),
 CHECK(departure_date>arrival_date), CHECK(advance_required_sar=(departure_date-arrival_date)*nightly_rate),
 CHECK((status='CONFIRMED')=(reservation_id IS NOT NULL)),
 CHECK(status<>'CONFIRMED' OR (verified_advance_sar IS NOT NULL AND verified_advance_sar=advance_required_sar AND verified_by IS NOT NULL AND verified_payment_method IS NOT NULL AND verified_payment_reference IS NOT NULL AND length(verified_payment_reference)>=3))
);
CREATE UNIQUE INDEX booking_request_payment_reference ON public.booking_requests(hotel_id,verified_payment_method,verified_payment_reference) WHERE verified_payment_reference IS NOT NULL;
CREATE INDEX booking_requests_customer ON public.booking_requests(hotel_id,customer_id,created_at DESC);
CREATE INDEX booking_requests_queue ON public.booking_requests(hotel_id,status,created_at DESC);
CREATE TABLE public.booking_request_reads (
 hotel_id uuid NOT NULL REFERENCES public.hotels(id), staff_id uuid NOT NULL REFERENCES public.staff(id),
 request_id uuid NOT NULL, seen_version integer NOT NULL CHECK(seen_version>0),
 PRIMARY KEY(staff_id,request_id), FOREIGN KEY(request_id,hotel_id) REFERENCES public.booking_requests(id,hotel_id)
);
-- Customers use the server API with separate JWT audience. Never expose these tables to the Data API.
ALTER TABLE public.customer_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_request_reads ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE table_name text; BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  REVOKE ALL ON public.customer_accounts,public.booking_requests,public.booking_request_reads FROM anon,authenticated;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='pk_hotels_runtime') THEN
  FOREACH table_name IN ARRAY ARRAY['customer_accounts','booking_requests','booking_request_reads'] LOOP
   EXECUTE format('CREATE POLICY pk_hotels_runtime_scope ON public.%I FOR ALL TO pk_hotels_runtime USING (hotel_id IN (SELECT id FROM public.hotels WHERE name=''PK-Hotels'')) WITH CHECK (hotel_id IN (SELECT id FROM public.hotels WHERE name=''PK-Hotels''))',table_name);
  END LOOP;
  GRANT SELECT,INSERT ON public.customer_accounts TO pk_hotels_runtime;
  GRANT SELECT,INSERT,UPDATE ON public.booking_requests,public.booking_request_reads TO pk_hotels_runtime;
 END IF;
END $$;
