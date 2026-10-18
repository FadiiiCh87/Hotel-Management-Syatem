CREATE TABLE public.hotel_contact_enquiries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),hotel_id uuid NOT NULL REFERENCES public.hotels(id),
 full_name text NOT NULL,email text NOT NULL,phone text,subject text NOT NULL,message text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),read_at timestamptz,read_by uuid REFERENCES public.staff(id),
 CHECK(length(full_name) BETWEEN 2 AND 160),CHECK(length(message) BETWEEN 10 AND 2000)
);
CREATE INDEX hotel_contact_enquiries_inbox ON public.hotel_contact_enquiries(hotel_id,created_at DESC);
ALTER TABLE public.hotel_contact_enquiries ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  REVOKE ALL ON public.hotel_contact_enquiries FROM anon,authenticated;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='pk_hotels_runtime') THEN
  CREATE POLICY pk_hotels_runtime_scope ON public.hotel_contact_enquiries FOR ALL TO pk_hotels_runtime USING(hotel_id IN(SELECT id FROM public.hotels WHERE name='PK-Hotels')) WITH CHECK(hotel_id IN(SELECT id FROM public.hotels WHERE name='PK-Hotels'));
  GRANT SELECT,INSERT ON public.hotel_contact_enquiries TO pk_hotels_runtime;
  GRANT UPDATE(read_at,read_by) ON public.hotel_contact_enquiries TO pk_hotels_runtime;
 END IF;
END $$;
