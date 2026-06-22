-- 0001_init.sql
-- Roles and session helpers for multi-tenant row-level security.
--
-- Reflo isolates tenants in the database itself, not just in application code.
-- Every business table carries a tenant_id and is guarded by an RLS policy that
-- reads the current tenant from a session variable. The application connects as
-- the unprivileged "reflo_app" role (which cannot bypass RLS) and sets that
-- variable per request inside a transaction. Migrations and seeding run as the
-- superuser, which bypasses RLS by design.

-- The runtime application role. It owns no tables and cannot bypass RLS, so the
-- policies in 0004 are always enforced for it. The password is overridden from
-- the environment at provisioning time; the literal here is only a local default.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'reflo_app') THEN
    CREATE ROLE reflo_app LOGIN PASSWORD 'reflo_app_pw' NOBYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO reflo_app;

-- Helper: read the active tenant for the session, raising if it was never set.
-- A missing tenant context must fail loudly rather than leak across tenants.
CREATE OR REPLACE FUNCTION reflo_current_tenant() RETURNS uuid
LANGUAGE plpgsql STABLE AS $$
DECLARE
  raw text := current_setting('reflo.tenant_id', true);
BEGIN
  IF raw IS NULL OR raw = '' THEN
    RAISE EXCEPTION 'reflo.tenant_id is not set for this session';
  END IF;
  RETURN raw::uuid;
END
$$;

-- Helper: the optional partner scope. Empty means "no partner restriction"
-- (an admin or analyst), so the policy falls back to tenant-only isolation.
CREATE OR REPLACE FUNCTION reflo_current_partner() RETURNS uuid
LANGUAGE plpgsql STABLE AS $$
DECLARE
  raw text := current_setting('reflo.partner_id', true);
BEGIN
  IF raw IS NULL OR raw = '' THEN
    RETURN NULL;
  END IF;
  RETURN raw::uuid;
END
$$;
