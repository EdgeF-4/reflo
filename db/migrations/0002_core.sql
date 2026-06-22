-- 0002_core.sql
-- Tenants, identity, the offer catalog, partners, commission rules, customers,
-- and the tracking keys that authenticate the embeddable widget.

CREATE TABLE tenants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Application users. role drives RBAC:
--   owner   full control of the tenant, including user management
--   admin   manage offers, partners, commissions, approve payouts
--   analyst read-only access to every report in the tenant
--   partner scoped to a single partner row; sees only its own performance
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email         text NOT NULL,
  password_hash text NOT NULL,
  name          text NOT NULL,
  role          text NOT NULL CHECK (role IN ('owner', 'admin', 'analyst', 'partner')),
  partner_id    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);

-- Partners are the affiliates or referral partners in a program.
CREATE TABLE partners (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  email       text NOT NULL,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'suspended')),
  payout_handle text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);

-- A partner user references the partner it represents.
ALTER TABLE users
  ADD CONSTRAINT users_partner_fk
  FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL;

-- The offer catalog: what partners can promote.
CREATE TABLE offers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name            text NOT NULL,
  description     text NOT NULL DEFAULT '',
  destination_url text NOT NULL,
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  -- The fallback commission rule, applied when no more specific rule matches.
  default_rule    jsonb NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Commission rules. A rule with partner_id = NULL applies to every partner on
-- the offer; a rule with a partner_id overrides it for that partner. Higher
-- priority wins. The rule body is validated by the domain layer, not the DB.
CREATE TABLE commission_rules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  offer_id    uuid NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  partner_id  uuid REFERENCES partners(id) ON DELETE CASCADE,
  rule        jsonb NOT NULL,
  priority    int NOT NULL DEFAULT 0,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Which partners are approved on which offers, and their unique tracking code.
CREATE TABLE partner_offers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  partner_id    uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  offer_id      uuid NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  tracking_code text NOT NULL,
  approved      boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, tracking_code),
  UNIQUE (tenant_id, partner_id, offer_id)
);

-- Tracking keys authenticate the embeddable widget. The public key is safe to
-- ship in a script tag; events are only accepted from listed domains, and the
-- secret (hashed) signs server-to-server conversion calls.
CREATE TABLE tracking_keys (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  offer_id        uuid REFERENCES offers(id) ON DELETE CASCADE,
  public_key      text NOT NULL UNIQUE,
  secret_hash     text NOT NULL,
  allowed_domains text[] NOT NULL DEFAULT '{}',
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- First-party customer identities. We store only hashed contact data; the raw
-- email never touches the database.
CREATE TABLE customers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  external_ref  text,
  email_hash    text,
  fingerprint   text,
  country       text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, external_ref)
);

CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_partners_tenant ON partners(tenant_id);
CREATE INDEX idx_offers_tenant ON offers(tenant_id);
CREATE INDEX idx_commission_rules_offer ON commission_rules(tenant_id, offer_id);
CREATE INDEX idx_partner_offers_tenant ON partner_offers(tenant_id);
CREATE INDEX idx_customers_tenant ON customers(tenant_id);
CREATE INDEX idx_tracking_keys_tenant ON tracking_keys(tenant_id);
