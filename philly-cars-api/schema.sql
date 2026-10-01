-- Philly Cars v4 self-hosted PostgreSQL blueprint
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL, stock_number text UNIQUE NOT NULL, vin text UNIQUE,
  year int NOT NULL, make text NOT NULL, model text NOT NULL, trim text,
  price integer NOT NULL DEFAULT 0, mileage integer NOT NULL DEFAULT 0,
  purchase_price integer NOT NULL DEFAULT 0, auction_fees integer NOT NULL DEFAULT 0,
  transport_cost integer NOT NULL DEFAULT 0, recon_cost integer NOT NULL DEFAULT 0, other_cost integer NOT NULL DEFAULT 0,
  acquired_at date,
  body_style text, exterior_color text, interior_color text, drivetrain text,
  transmission text, engine text, fuel_type text, title_status text,
  status text NOT NULL DEFAULT 'acquired' CHECK (status IN ('acquired','reconditioning','photo_needed','ready_to_publish','available','deposit','sold','archived')),
  description text, features jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE vehicle_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  path text NOT NULL, alt_text text, sort_order int NOT NULL DEFAULT 0, is_cover boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE vehicle_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('website','facebook','google','cargurus','cars','autotrader')),
  status text NOT NULL DEFAULT 'not_connected' CHECK (status IN ('not_connected','draft','ready','published','error','removal_queued','removed','manual')),
  external_listing_id text, external_url text, last_error text, last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(vehicle_id, channel)
);

CREATE TABLE leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), type text NOT NULL, vehicle_id uuid REFERENCES vehicles(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'website', name text NOT NULL, phone text, email text, vin text, message text, payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','appointment','test_drive','negotiation','sold','lost')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text UNIQUE NOT NULL, password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'manager' CHECK (role IN ('owner','manager')), active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), last_login_at timestamptz
);

CREATE TABLE admin_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  token_hash text UNIQUE NOT NULL, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX admin_sessions_expires_idx ON admin_sessions(expires_at);
CREATE INDEX vehicles_status_idx ON vehicles(status);
CREATE INDEX vehicles_make_model_idx ON vehicles(make, model);
CREATE INDEX vehicle_publications_vehicle_idx ON vehicle_publications(vehicle_id);
CREATE INDEX leads_status_created_idx ON leads(status, created_at DESC);