-- 0003_events_ledger.sql
-- The event capture pipeline, attribution output, the append-only settlement
-- ledger, fraud assessments, payouts, and the audit log.

-- Raw tracking events from the widget or server-to-server calls. Append-only;
-- these are the first-party touch record that attribution reads from.
CREATE TABLE events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type            text NOT NULL CHECK (type IN ('click', 'lead_submit', 'conversion')),
  partner_id      uuid REFERENCES partners(id) ON DELETE SET NULL,
  offer_id        uuid REFERENCES offers(id) ON DELETE SET NULL,
  customer_id     uuid REFERENCES customers(id) ON DELETE SET NULL,
  tracking_key_id uuid REFERENCES tracking_keys(id) ON DELETE SET NULL,
  source_site     text,
  ip              inet,
  country         text,
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- A conversion is a sale or signup that may generate commission. It is created
-- from a server-to-server call and scored for fraud before any payout accrues.
CREATE TABLE conversions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  offer_id        uuid NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  customer_id     uuid REFERENCES customers(id) ON DELETE SET NULL,
  source_event_id uuid REFERENCES events(id) ON DELETE SET NULL,
  order_id        text,
  amount_cents    bigint NOT NULL CHECK (amount_cents >= 0),
  currency        char(3) NOT NULL DEFAULT 'USD',
  status          text NOT NULL DEFAULT 'received'
                  CHECK (status IN ('received', 'attributed', 'flagged', 'rejected')),
  attribution_model text,
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, order_id)
);

-- The per-partner attribution split for a conversion. weight_bps is the share
-- in basis points (sums to 10000 across a conversion); amount_cents is the exact
-- cent allocation, which always sums back to the conversion's commission base.
CREATE TABLE attributions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversion_id uuid NOT NULL REFERENCES conversions(id) ON DELETE CASCADE,
  partner_id    uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  model         text NOT NULL,
  weight_bps    int NOT NULL CHECK (weight_bps BETWEEN 0 AND 10000),
  amount_cents  bigint NOT NULL CHECK (amount_cents >= 0),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Current settlement ledger entry. This is a projection: the authoritative
-- history lives in ledger_events. state and amount_cents are kept in sync by
-- the application as each event is appended.
CREATE TABLE ledger_entries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  partner_id    uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  conversion_id uuid NOT NULL REFERENCES conversions(id) ON DELETE CASCADE,
  attribution_id uuid REFERENCES attributions(id) ON DELETE SET NULL,
  amount_cents  bigint NOT NULL CHECK (amount_cents >= 0),
  currency      char(3) NOT NULL DEFAULT 'USD',
  state         text NOT NULL
                CHECK (state IN ('pending', 'confirmed', 'payable', 'paid', 'reversed', 'clawed_back')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Append-only ledger event stream. seq is monotonic per entry. Nothing in this
-- table is ever updated or deleted; that is what makes the ledger auditable.
CREATE TABLE ledger_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entry_id     uuid NOT NULL REFERENCES ledger_entries(id) ON DELETE CASCADE,
  seq          int NOT NULL,
  type         text NOT NULL
               CHECK (type IN ('accrued', 'confirmed', 'marked_payable', 'paid', 'reversed', 'clawed_back', 'adjusted')),
  amount_cents bigint,
  actor        text,
  reason       text,
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entry_id, seq)
);

-- Fraud scoring results, one row per assessment of a conversion.
CREATE TABLE fraud_assessments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversion_id uuid NOT NULL REFERENCES conversions(id) ON DELETE CASCADE,
  risk_score    numeric(4, 3) NOT NULL,
  decision      text NOT NULL CHECK (decision IN ('allow', 'review', 'block')),
  signals       jsonb NOT NULL DEFAULT '[]'::jsonb,
  narrative     text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- A payout batch groups payable ledger entries for a partner.
CREATE TABLE payouts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  partner_id   uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  currency     char(3) NOT NULL DEFAULT 'USD',
  status       text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'processing', 'paid', 'failed')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Immutable audit log of every privileged action in the tenant.
CREATE TABLE audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor_id    uuid,
  actor_role  text,
  action      text NOT NULL,
  entity_type text NOT NULL,
  entity_id   uuid,
  before      jsonb,
  after       jsonb,
  ip          inet,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_events_tenant_customer ON events(tenant_id, customer_id, occurred_at);
CREATE INDEX idx_events_tenant_partner ON events(tenant_id, partner_id, occurred_at);
CREATE INDEX idx_conversions_tenant ON conversions(tenant_id, occurred_at);
CREATE INDEX idx_attributions_conversion ON attributions(tenant_id, conversion_id);
CREATE INDEX idx_attributions_partner ON attributions(tenant_id, partner_id);
CREATE INDEX idx_ledger_entries_partner ON ledger_entries(tenant_id, partner_id, state);
CREATE INDEX idx_ledger_events_entry ON ledger_events(tenant_id, entry_id, seq);
CREATE INDEX idx_fraud_conversion ON fraud_assessments(tenant_id, conversion_id);
CREATE INDEX idx_audit_tenant ON audit_log(tenant_id, occurred_at);
