defmodule Cybernetic.Repo.Migrations.EnableRowLevelSecurity do
  @moduledoc """
  Enables Row-Level Security (RLS) on tenant-scoped tables.

  RLS ensures that queries only return rows belonging to the
  current tenant, providing database-level isolation.

  Usage in application:
    Cybernetic.Repo.set_tenant(tenant_id)
    # All subsequent queries are filtered by tenant_id
  """
  use Ecto.Migration

  def up do
    # Enable RLS on all tenant-scoped tables
    execute "ALTER TABLE system_states ENABLE ROW LEVEL SECURITY"
    execute "ALTER TABLE episodes ENABLE ROW LEVEL SECURITY"
    execute "ALTER TABLE policies ENABLE ROW LEVEL SECURITY"
    execute "ALTER TABLE artifacts ENABLE ROW LEVEL SECURITY"

    # Create RLS policies for tenant isolation
    # These policies use the app.current_tenant session variable
    execute """
    CREATE POLICY tenant_isolation_system_states ON system_states
      USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    """

    execute """
    CREATE POLICY tenant_isolation_episodes ON episodes
      USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    """

    execute """
    CREATE POLICY tenant_isolation_policies ON policies
      USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    """

    execute """
    CREATE POLICY tenant_isolation_artifacts ON artifacts
      USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    """

    # Grant necessary permissions to the application role
    # Note: In production, replace 'cybernetic' with your actual DB user
    execute "GRANT ALL ON system_states TO cybernetic"
    execute "GRANT ALL ON episodes TO cybernetic"
    execute "GRANT ALL ON policies TO cybernetic"
    execute "GRANT ALL ON artifacts TO cybernetic"
  end

  def down do
    # Drop RLS policies
    execute "DROP POLICY IF EXISTS tenant_isolation_system_states ON system_states"
    execute "DROP POLICY IF EXISTS tenant_isolation_episodes ON episodes"
    execute "DROP POLICY IF EXISTS tenant_isolation_policies ON policies"
    execute "DROP POLICY IF EXISTS tenant_isolation_artifacts ON artifacts"

    # Disable RLS
    execute "ALTER TABLE system_states DISABLE ROW LEVEL SECURITY"
    execute "ALTER TABLE episodes DISABLE ROW LEVEL SECURITY"
    execute "ALTER TABLE policies DISABLE ROW LEVEL SECURITY"
    execute "ALTER TABLE artifacts DISABLE ROW LEVEL SECURITY"
  end
end
