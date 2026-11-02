import type { QueryInterface } from 'sequelize';

const installSql = `
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE apartment_inventory_claims
  ADD CONSTRAINT inventory_claims_stay_dates_ck
  CHECK (
    NOT isempty(stay_dates)
    AND lower_inc(stay_dates)
    AND NOT upper_inc(stay_dates)
    AND NOT lower_inf(stay_dates)
    AND NOT upper_inf(stay_dates)
  );

ALTER TABLE apartment_inventory_claims
  ADD CONSTRAINT apartment_inventory_claims_no_overlap
  EXCLUDE USING gist (apartment_id WITH =, stay_dates WITH &&);

CREATE FUNCTION expire_pending_bookings_for_apartment(target_apartment uuid, except_booking uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE bookings
     SET status = 'expired', updated_at = now()
   WHERE apartment_id = target_apartment
     AND id IS DISTINCT FROM except_booking
     AND status = 'pending'
     AND expires_at <= now();
END;
$$;

CREATE FUNCTION expire_pending_before_booking_write()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF pg_trigger_depth() = 1 AND NEW.status = 'pending' THEN
    PERFORM expire_pending_bookings_for_apartment(NEW.apartment_id, NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER bookings_expire_stale_before_write
BEFORE INSERT OR UPDATE OF apartment_id, check_in, check_out, status, expires_at
ON bookings FOR EACH ROW EXECUTE FUNCTION expire_pending_before_booking_write();

CREATE FUNCTION sync_booking_inventory_claim()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM apartment_inventory_claims WHERE booking_id = OLD.id;
    RETURN OLD;
  END IF;

  IF NEW.status IN ('pending', 'confirmed', 'checked_in') AND NEW.deleted_at IS NULL THEN
    INSERT INTO apartment_inventory_claims
      (id, apartment_id, booking_id, stay_dates, created_at)
    VALUES
      (gen_random_uuid(), NEW.apartment_id, NEW.id, daterange(NEW.check_in, NEW.check_out, '[)'), now())
    ON CONFLICT (booking_id) DO UPDATE
      SET apartment_id = EXCLUDED.apartment_id,
          stay_dates = EXCLUDED.stay_dates;
  ELSE
    DELETE FROM apartment_inventory_claims WHERE booking_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER bookings_sync_inventory_after_write
AFTER INSERT OR UPDATE OF apartment_id, check_in, check_out, status, deleted_at OR DELETE
ON bookings FOR EACH ROW EXECUTE FUNCTION sync_booking_inventory_claim();

CREATE FUNCTION expire_pending_before_block_write()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF pg_trigger_depth() = 1 THEN
    PERFORM expire_pending_bookings_for_apartment(NEW.apartment_id, NULL);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER availability_blocks_expire_stale_before_write
BEFORE INSERT OR UPDATE OF apartment_id, start_date, end_date, deleted_at
ON availability_blocks FOR EACH ROW EXECUTE FUNCTION expire_pending_before_block_write();

CREATE FUNCTION sync_availability_block_inventory_claim()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM apartment_inventory_claims WHERE availability_block_id = OLD.id;
    RETURN OLD;
  END IF;

  IF NEW.deleted_at IS NULL THEN
    INSERT INTO apartment_inventory_claims
      (id, apartment_id, availability_block_id, stay_dates, created_at)
    VALUES
      (gen_random_uuid(), NEW.apartment_id, NEW.id, daterange(NEW.start_date, NEW.end_date, '[)'), now())
    ON CONFLICT (availability_block_id) DO UPDATE
      SET apartment_id = EXCLUDED.apartment_id,
          stay_dates = EXCLUDED.stay_dates;
  ELSE
    DELETE FROM apartment_inventory_claims WHERE availability_block_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER availability_blocks_sync_inventory_after_write
AFTER INSERT OR UPDATE OF apartment_id, start_date, end_date, deleted_at OR DELETE
ON availability_blocks FOR EACH ROW EXECUTE FUNCTION sync_availability_block_inventory_claim();

CREATE FUNCTION record_booking_status_event()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO booking_status_events
      (id, booking_id, previous_status, next_status, actor_admin_id, source, metadata, created_at)
    VALUES
      (gen_random_uuid(), NEW.id, NULL, NEW.status,
       nullif(current_setting('app.admin_id', true), '')::uuid,
       coalesce(nullif(current_setting('app.event_source', true), ''), 'system'), '{}'::jsonb, now());
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO booking_status_events
      (id, booking_id, previous_status, next_status, actor_admin_id, source, metadata, created_at)
    VALUES
      (gen_random_uuid(), NEW.id, OLD.status, NEW.status,
       nullif(current_setting('app.admin_id', true), '')::uuid,
       coalesce(nullif(current_setting('app.event_source', true), ''), 'system'), '{}'::jsonb, now());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER bookings_record_status_event
AFTER INSERT OR UPDATE OF status ON bookings
FOR EACH ROW EXECUTE FUNCTION record_booking_status_event();
`;

const removeSql = `
DROP TRIGGER IF EXISTS bookings_record_status_event ON bookings;
DROP FUNCTION IF EXISTS record_booking_status_event();
DROP TRIGGER IF EXISTS availability_blocks_sync_inventory_after_write ON availability_blocks;
DROP FUNCTION IF EXISTS sync_availability_block_inventory_claim();
DROP TRIGGER IF EXISTS availability_blocks_expire_stale_before_write ON availability_blocks;
DROP FUNCTION IF EXISTS expire_pending_before_block_write();
DROP TRIGGER IF EXISTS bookings_sync_inventory_after_write ON bookings;
DROP FUNCTION IF EXISTS sync_booking_inventory_claim();
DROP TRIGGER IF EXISTS bookings_expire_stale_before_write ON bookings;
DROP FUNCTION IF EXISTS expire_pending_before_booking_write();
DROP FUNCTION IF EXISTS expire_pending_bookings_for_apartment(uuid, uuid);
ALTER TABLE apartment_inventory_claims DROP CONSTRAINT IF EXISTS apartment_inventory_claims_no_overlap;
ALTER TABLE apartment_inventory_claims DROP CONSTRAINT IF EXISTS inventory_claims_stay_dates_ck;
`;

export async function up({
  context: queryInterface,
}: {
  context: QueryInterface;
}) {
  await queryInterface.sequelize.query(installSql);
}

export async function down({
  context: queryInterface,
}: {
  context: QueryInterface;
}) {
  await queryInterface.sequelize.query(removeSql);
}
