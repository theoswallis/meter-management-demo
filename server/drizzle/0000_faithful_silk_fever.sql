CREATE TYPE meter_type AS ENUM ('water','electric','gas');
CREATE TYPE meter_status AS ENUM ('active', 'inactive', 'maintenance', 'decommissioned');

CREATE TABLE service_locations (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  address_line1 text NOT NULL,
  address_line2 text,
  city          text NOT NULL,
  state         char(2) NOT NULL,
  postal_code   text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT state_is_upper     CHECK (state = upper(state)),
  CONSTRAINT postal_code_format CHECK (postal_code ~ '^[0-9]{5}(-[0-9]{4})?$')
);

-- separate service points for e.g. separately metered apts
CREATE TABLE service_points (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  service_location_id bigint NOT NULL 
                        REFERENCES service_locations(id) ON DELETE RESTRICT,
  identifier          text NOT NULL, -- e.g. apartment number
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_points_location_identifier_key UNIQUE (service_location_id, identifier),
  CONSTRAINT service_points_id_location_key UNIQUE (id, service_location_id) -- redundant, but pg engine requires this for meters table's composite FK
);
-- Note: Redundant index on (service_location_id, id) removed; service_points_location_identifier_key already indexes service_location_id as the leading B-tree key

CREATE TABLE meters (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  service_point_id    bigint NOT NULL,
  service_location_id bigint NOT NULL, -- service_points bridges meters and service_locations already, but we want this key here so we can add the unique constraint of serial_number per location
  serial_number       text NOT NULL,
  type                meter_type NOT NULL,
  status              meter_status NOT NULL DEFAULT 'active',
  installed_on        date NOT NULL DEFAULT CURRENT_DATE,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meters_serial_number_key UNIQUE (serial_number),
  CONSTRAINT meters_location_serial_key UNIQUE (service_location_id, serial_number), --also generates an index that can be used to quickly grab all meters for a location
  CONSTRAINT meters_service_point_location_fkey -- composite FK to enforce that the service point belongs to the same location as the meter
  FOREIGN KEY (service_point_id, service_location_id) 
  REFERENCES service_points(id, service_location_id) 
  ON DELETE RESTRICT
);
CREATE INDEX meters_service_point_idx ON meters(service_point_id); --quickly grab all meters for a service point

CREATE TABLE meter_readings (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  meter_id      bigint NOT NULL REFERENCES meters(id) ON DELETE CASCADE,
  read_at       timestamptz NOT NULL,
  reading_value numeric(14,3) NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reading_value_positive CHECK (reading_value >= 0)
);
CREATE INDEX meter_readings_meter_id_read_at_idx ON meter_readings(meter_id, read_at DESC);