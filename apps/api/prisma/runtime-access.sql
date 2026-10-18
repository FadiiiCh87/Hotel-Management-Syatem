-- Apply only to the dedicated PK-Hotels database.
-- Provision pk_hotels_runtime LOGIN separately through a secure credential workflow.
-- Its generated password belongs only in Render DATABASE_URL, never in source or migrations.
GRANT CONNECT ON DATABASE postgres TO pk_hotels_runtime;
GRANT USAGE ON SCHEMA public TO pk_hotels_runtime;
GRANT SELECT ON public.hotels, public.staff, public.billing_settings TO pk_hotels_runtime;
GRANT SELECT,INSERT,UPDATE ON public.room_types,public.rooms,public.reservations,public.folios TO pk_hotels_runtime;
GRANT SELECT,INSERT ON public.guests,public.room_blocks,public.folio_lines,public.folio_payments,public.audit_logs TO pk_hotels_runtime;
CREATE POLICY pk_hotels_runtime_scope ON public.hotels FOR SELECT TO pk_hotels_runtime USING(name='PK-Hotels');
CREATE POLICY pk_hotels_runtime_scope ON public.staff FOR ALL TO pk_hotels_runtime USING(hotel_id IN (SELECT id FROM public.hotels WHERE name='PK-Hotels')) WITH CHECK(hotel_id IN (SELECT id FROM public.hotels WHERE name='PK-Hotels'));
CREATE POLICY pk_hotels_runtime_scope ON public.billing_settings FOR ALL TO pk_hotels_runtime USING(hotel_id IN (SELECT id FROM public.hotels WHERE name='PK-Hotels')) WITH CHECK(hotel_id IN (SELECT id FROM public.hotels WHERE name='PK-Hotels'));
CREATE POLICY pk_hotels_runtime_scope ON public.room_types FOR ALL TO pk_hotels_runtime USING(hotel_id IN (SELECT id FROM public.hotels WHERE name='PK-Hotels')) WITH CHECK(hotel_id IN (SELECT id FROM public.hotels WHERE name='PK-Hotels'));
CREATE POLICY pk_hotels_runtime_scope ON public.rooms FOR ALL TO pk_hotels_runtime USING(hotel_id IN (SELECT id FROM public.hotels WHERE name='PK-Hotels')) WITH CHECK(hotel_id IN (SELECT id FROM public.hotels WHERE name='PK-Hotels'));
CREATE POLICY pk_hotels_runtime_scope ON public.guests FOR ALL TO pk_hotels_runtime USING(hotel_id IN (SELECT id FROM public.hotels WHERE name='PK-Hotels')) WITH CHECK(hotel_id IN (SELECT id FROM public.hotels WHERE name='PK-Hotels'));
CREATE POLICY pk_hotels_runtime_scope ON public.reservations FOR ALL TO pk_hotels_runtime USING(hotel_id IN (SELECT id FROM public.hotels WHERE name='PK-Hotels')) WITH CHECK(hotel_id IN (SELECT id FROM public.hotels WHERE name='PK-Hotels'));
CREATE POLICY pk_hotels_runtime_scope ON public.room_blocks FOR ALL TO pk_hotels_runtime USING(hotel_id IN (SELECT id FROM public.hotels WHERE name='PK-Hotels')) WITH CHECK(hotel_id IN (SELECT id FROM public.hotels WHERE name='PK-Hotels'));
CREATE POLICY pk_hotels_runtime_scope ON public.folios FOR ALL TO pk_hotels_runtime USING(hotel_id IN (SELECT id FROM public.hotels WHERE name='PK-Hotels')) WITH CHECK(hotel_id IN (SELECT id FROM public.hotels WHERE name='PK-Hotels'));
CREATE POLICY pk_hotels_runtime_scope ON public.folio_lines FOR ALL TO pk_hotels_runtime USING(hotel_id IN (SELECT id FROM public.hotels WHERE name='PK-Hotels')) WITH CHECK(hotel_id IN (SELECT id FROM public.hotels WHERE name='PK-Hotels'));
CREATE POLICY pk_hotels_runtime_scope ON public.folio_payments FOR ALL TO pk_hotels_runtime USING(hotel_id IN (SELECT id FROM public.hotels WHERE name='PK-Hotels')) WITH CHECK(hotel_id IN (SELECT id FROM public.hotels WHERE name='PK-Hotels'));
CREATE POLICY pk_hotels_runtime_scope ON public.audit_logs FOR ALL TO pk_hotels_runtime USING(hotel_id IN (SELECT id FROM public.hotels WHERE name='PK-Hotels')) WITH CHECK(hotel_id IN (SELECT id FROM public.hotels WHERE name='PK-Hotels'));
