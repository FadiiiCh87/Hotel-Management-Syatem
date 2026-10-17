-- Phase 1: PostgreSQL operational schema. Apply only to a NEW dedicated PK-Hotels database.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE TABLE hotels (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
 expected_room_count integer NOT NULL CHECK (expected_room_count > 0),
 currency char(3) NOT NULL DEFAULT 'SAR', timezone text NOT NULL DEFAULT 'Asia/Riyadh',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE staff (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), hotel_id uuid NOT NULL REFERENCES hotels(id),
 email text NOT NULL UNIQUE, password_hash text NOT NULL,
 role text NOT NULL CHECK (role IN ('ADMIN','MANAGER','RECEPTIONIST')),
 active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE room_types (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), hotel_id uuid NOT NULL REFERENCES hotels(id),
 name text NOT NULL, nightly_rate numeric(12,2) NOT NULL CHECK(nightly_rate>=0),
 capacity integer NOT NULL CHECK(capacity>0), UNIQUE(hotel_id,name), UNIQUE(id,hotel_id)
);
CREATE TABLE rooms (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), hotel_id uuid NOT NULL REFERENCES hotels(id),
 room_type_id uuid NOT NULL, number text NOT NULL,
 status text NOT NULL DEFAULT 'AVAILABLE' CHECK(status IN ('AVAILABLE','CLEANING','MAINTENANCE','OUT_OF_SERVICE')),
 FOREIGN KEY(room_type_id,hotel_id) REFERENCES room_types(id,hotel_id),
 UNIQUE(hotel_id,number), UNIQUE(id,hotel_id)
);
CREATE TABLE guests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), hotel_id uuid NOT NULL REFERENCES hotels(id),
 full_name text NOT NULL, phone text, email text,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,hotel_id)
);
CREATE TABLE reservations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), hotel_id uuid NOT NULL REFERENCES hotels(id),
 guest_id uuid NOT NULL, room_id uuid NOT NULL,
 arrival_date date NOT NULL, departure_date date NOT NULL,
 status text NOT NULL DEFAULT 'CONFIRMED' CHECK(status IN ('CONFIRMED','CHECKED_IN','CHECKED_OUT','CANCELLED','NO_SHOW')),
 nightly_rate numeric(12,2) NOT NULL CHECK(nightly_rate>=0),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(departure_date>arrival_date),
 FOREIGN KEY(guest_id,hotel_id) REFERENCES guests(id,hotel_id),
 FOREIGN KEY(room_id,hotel_id) REFERENCES rooms(id,hotel_id),
 UNIQUE(id,hotel_id)
);
-- PostgreSQL enforces this even for concurrent transactions, preventing double booking.
ALTER TABLE reservations ADD CONSTRAINT reservations_no_overlap
 EXCLUDE USING gist (room_id WITH =, daterange(arrival_date,departure_date,'[)') WITH &&)
 WHERE (status IN ('CONFIRMED','CHECKED_IN'));
CREATE TABLE room_blocks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), hotel_id uuid NOT NULL REFERENCES hotels(id),
 room_id uuid NOT NULL, start_date date NOT NULL, end_date date NOT NULL,
 reason text NOT NULL, CHECK(end_date>start_date),
 FOREIGN KEY(room_id,hotel_id) REFERENCES rooms(id,hotel_id)
);
ALTER TABLE room_blocks ADD CONSTRAINT room_blocks_no_overlap
 EXCLUDE USING gist (room_id WITH =, daterange(start_date,end_date,'[)') WITH &&);
CREATE TABLE audit_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), hotel_id uuid NOT NULL REFERENCES hotels(id),
 actor_id uuid REFERENCES staff(id), action text NOT NULL, entity_id uuid,
 occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reservations_by_hotel_dates ON reservations(hotel_id,arrival_date,departure_date);
CREATE INDEX rooms_by_hotel ON rooms(hotel_id);
-- A single-property record only; no fictional room numbers, prices, or guest data.
INSERT INTO hotels(name,expected_room_count) VALUES ('PK-Hotels',40);
