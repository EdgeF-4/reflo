-- 0004_rls.sql
-- Enable row-level security and define the isolation policies. Two shapes:
--   * tenant-only:    a row is visible only within its own tenant.
--   * tenant+partner: additionally, when a partner scope is set (a partner user),
--                     only that partner's own rows are visible.
-- The application connects as reflo_app, which cannot bypass RLS, and sets
-- reflo.tenant_id (and optionally reflo.partner_id) per request.

-- A tenant sees only itself.
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenants_isolation ON tenants
  USING (id = reflo_current_tenant())
  WITH CHECK (id = reflo_current_tenant());

-- Tenant-only tables.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users', 'offers', 'commission_rules', 'tracking_keys',
    'customers', 'conversions', 'ledger_events', 'fraud_assessments', 'audit_log'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (tenant_id = reflo_current_tenant()) WITH CHECK (tenant_id = reflo_current_tenant());',
      t || '_isolation', t
    );
  END LOOP;
END
$$;

-- Tenant + optional partner-scope tables that carry a partner_id column.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'partner_offers', 'events', 'attributions', 'ledger_entries', 'payouts'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I '
      'USING (tenant_id = reflo_current_tenant() '
      '  AND (reflo_current_partner() IS NULL OR partner_id = reflo_current_partner())) '
      'WITH CHECK (tenant_id = reflo_current_tenant());',
      t || '_isolation', t
    );
  END LOOP;
END
$$;

-- The partners table scopes on its own id rather than a partner_id column.
ALTER TABLE partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE partners FORCE ROW LEVEL SECURITY;
CREATE POLICY partners_isolation ON partners
  USING (
    tenant_id = reflo_current_tenant()
    AND (reflo_current_partner() IS NULL OR id = reflo_current_partner())
  )
  WITH CHECK (tenant_id = reflo_current_tenant());

-- Privileges. The append-only tables (events, ledger_events, audit_log) grant
-- INSERT and SELECT but never UPDATE or DELETE, so immutability is enforced by
-- the database, not merely by convention.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  tenants, users, partners, offers, commission_rules, partner_offers,
  tracking_keys, customers, conversions, attributions, ledger_entries,
  fraud_assessments, payouts
TO reflo_app;

GRANT SELECT, INSERT ON events, ledger_events, audit_log TO reflo_app;
