-- Additive staff account management. Existing staff keep their password and access.
ALTER TABLE public.staff ADD COLUMN full_name text NOT NULL DEFAULT '';
ALTER TABLE public.staff ADD COLUMN must_change_password boolean NOT NULL DEFAULT false;
ALTER TABLE public.staff ADD COLUMN session_version integer NOT NULL DEFAULT 0 CHECK(session_version>=0);
CREATE UNIQUE INDEX staff_email_lower_unique ON public.staff(lower(email));
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
-- Production runtime already has a hotel-scoped ALL policy. Do not grant public access.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='pk_hotels_runtime') THEN
  GRANT INSERT(hotel_id,full_name,email,password_hash,role,must_change_password), UPDATE(full_name,password_hash,role,active,must_change_password,session_version) ON public.staff TO pk_hotels_runtime;
 END IF;
END $$;
