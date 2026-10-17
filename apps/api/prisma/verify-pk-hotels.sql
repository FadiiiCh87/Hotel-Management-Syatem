-- PK-Hotels DB verification. Run ONLY on a disposable, dedicated test database
-- after phase1.sql, seed-pk-hotels-rooms.sql, phase2-billing.sql, phase2-tax-safety.sql.
-- No test guests or reservations are persisted: all writes are rolled back.
BEGIN;
DO $$
DECLARE h uuid; n int; r uuid; g uuid; x uuid; expected numeric;
BEGIN
 SELECT id INTO h FROM hotels WHERE name='PK-Hotels';
 IF h IS NULL THEN RAISE EXCEPTION 'Hotel not initialized'; END IF;
 SELECT count(*) INTO n FROM rooms WHERE hotel_id=h;
 IF n<>40 THEN RAISE EXCEPTION 'Expected 40 rooms, found %',n; END IF;
 IF (SELECT count(DISTINCT number) FROM rooms WHERE hotel_id=h)<>40 THEN RAISE EXCEPTION 'Duplicate room numbers'; END IF;
 IF EXISTS (
  SELECT 1 FROM room_types WHERE hotel_id=h AND (
   (name='Normal' AND nightly_rate<>60) OR
   (name='Standard' AND nightly_rate<>100) OR
   (name='Deluxe' AND nightly_rate<>200) OR
   (name='Super VVIP' AND nightly_rate<>500)
  )
 ) THEN RAISE EXCEPTION 'Room rates do not match approvals'; END IF;
 IF (SELECT count(*) FROM room_types WHERE hotel_id=h AND name IN ('Normal','Standard','Deluxe','Super VVIP'))<>4 THEN RAISE EXCEPTION 'Missing room type'; END IF;
 IF NOT EXISTS(SELECT 1 FROM billing_settings WHERE hotel_id=h AND registration_status='UNCONFIRMED' AND vat_rate IS NULL) THEN
  RAISE EXCEPTION 'Tax must remain unconfirmed with NULL VAT rate';
 END IF;
 SELECT r0.id INTO r FROM rooms r0 JOIN room_types t ON t.id=r0.room_type_id WHERE r0.hotel_id=h AND r0.number='101' AND t.name='Standard';
 IF r IS NULL THEN RAISE EXCEPTION 'Standard room 101 missing'; END IF;
 INSERT INTO guests(hotel_id,full_name) VALUES(h,'TEST ONLY - ROLLBACK') RETURNING id INTO g;
 INSERT INTO reservations(hotel_id,guest_id,room_id,arrival_date,departure_date,nightly_rate)
 VALUES(h,g,r,'2099-01-01','2099-01-04',100) RETURNING id INTO x;
 SELECT nightly_rate*(departure_date-arrival_date) INTO expected FROM reservations WHERE id=x;
 IF expected<>300 THEN RAISE EXCEPTION '3-night Standard subtotal must be SAR 300'; END IF;
 BEGIN
  INSERT INTO reservations(hotel_id,guest_id,room_id,arrival_date,departure_date,nightly_rate)
  VALUES(h,g,r,'2099-01-02','2099-01-05',100);
  RAISE EXCEPTION 'Overlapping reservation was incorrectly allowed';
 EXCEPTION WHEN exclusion_violation THEN NULL;
 END;
 RAISE NOTICE 'PASS: 40 rooms, approved rates, VAT unconfirmed, 3-night subtotal, overlap constraint';
END $$;
ROLLBACK;
