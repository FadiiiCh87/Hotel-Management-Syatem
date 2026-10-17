-- PK-Hotels approved room inventory: exactly 40 unique room numbers.
-- Idempotent inventory seed. Run only after phase1.sql on the DEDICATED PK-Hotels database.
-- Rates intentionally not invented: zero is a disabled placeholder; manager must approve rates before bookings.
BEGIN;
DO $$
DECLARE h uuid; normal_type uuid; standard_type uuid; deluxe_type uuid; vvip_type uuid; n text;
BEGIN
 SELECT id INTO h FROM hotels WHERE name='PK-Hotels';
 IF h IS NULL THEN RAISE EXCEPTION 'PK-Hotels not found; apply phase1.sql first'; END IF;
 INSERT INTO room_types(hotel_id,name,nightly_rate,capacity)
 VALUES (h,'Normal',0,2),(h,'Standard',0,2),(h,'Deluxe',0,2),(h,'Super VVIP',0,2)
 ON CONFLICT(hotel_id,name) DO NOTHING;
 SELECT id INTO normal_type FROM room_types WHERE hotel_id=h AND name='Normal';
 SELECT id INTO standard_type FROM room_types WHERE hotel_id=h AND name='Standard';
 SELECT id INTO deluxe_type FROM room_types WHERE hotel_id=h AND name='Deluxe';
 SELECT id INTO vvip_type FROM room_types WHERE hotel_id=h AND name='Super VVIP';
 FOR n IN SELECT generate_series(1,10)::text LOOP
  INSERT INTO rooms(hotel_id,room_type_id,number) VALUES(h,normal_type,n)
  ON CONFLICT(hotel_id,number) DO NOTHING;
 END LOOP;
 FOR n IN SELECT generate_series(101,110)::text LOOP
  INSERT INTO rooms(hotel_id,room_type_id,number) VALUES(h,standard_type,n)
  ON CONFLICT(hotel_id,number) DO NOTHING;
 END LOOP;
 FOR n IN SELECT generate_series(201,210)::text LOOP
  INSERT INTO rooms(hotel_id,room_type_id,number) VALUES(h,deluxe_type,n)
  ON CONFLICT(hotel_id,number) DO NOTHING;
 END LOOP;
 FOREACH n IN ARRAY ARRAY['111','222','333','77','66','11','22','33','55','44'] LOOP
  INSERT INTO rooms(hotel_id,room_type_id,number) VALUES(h,vvip_type,n)
  ON CONFLICT(hotel_id,number) DO NOTHING;
 END LOOP;
 IF (SELECT count(*) FROM rooms WHERE hotel_id=h) <> 40 THEN
  RAISE EXCEPTION 'Expected 40 rooms after seed, got %',(SELECT count(*) FROM rooms WHERE hotel_id=h);
 END IF;
END $$;
COMMIT;
-- Verify: SELECT t.name, count(*) FROM rooms r JOIN room_types t ON t.id=r.room_type_id GROUP BY t.name;
