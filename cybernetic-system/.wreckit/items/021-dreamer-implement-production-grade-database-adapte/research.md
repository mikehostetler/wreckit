# Research: [DREAMER] Implement production-grade database adapter for MCP DatabaseTool

**Date**: 2025-01-29
**Item**: 021-dreamer-implement-production-grade-database-adapte

## Research Question
Database queries through MCP are mocked, returning fake data. This prevents external systems from querying the Cybernetic platform's database through the MCP interface, limiting observability and integration capabilities.

**Motivation:** External tools need to query the platform database for monitoring, analytics, and integration. The MCP interface is the standard way to expose this capability securely.

**Success criteria:**
- execute_query/2 runs real SQL queries against configured database
- Proper SQL injection prevention (beyond basic string replacement)
- Connection pooling and timeout handling
- Query result limits to prevent large result sets
- Authorization checks for database access

**Technical constraints:**
- Must use existing Repo for tenant isolation
- SQL injection prevention is critical
- Query result size limits required
- Must only allow read operations in production
- Needs proper error messages

**In scope:**
- Implement execute_query/2 with Ecto.Repo.query
- Add proper SQL sanitization
- Implement connection pooling
- Add query timeouts and result limits
- Write security tests for SQL injection
**Out of scope:**
- Write operations (intentionally not allowed)
- Database migrations (separate concern)
- Multi-database support (single database only)

**Signals:** priority: high, urgency: Security risk with mock data

## Summary

The Cybernetic platform currently has a mocked `DatabaseTool` implementation that returns fake data, preventing external systems from querying the actual database through the MCP interface. The platform already has Ecto.Repo configured with PostgreSQL (`lib/cybernetic/repo.ex:1-70`) but it's not being utilized by the MCP DatabaseTool. The implementation needs to replace the mock `execute_query/2` function with real database queries using `Ecto.Repo.query/4`, while implementing critical security measures including SQL injection prevention, query result limits, read-only enforcement, and proper authorization checks. The existing authorization infrastructure through `AuthManager` and RBAC is already in place and can be leveraged for database access control.

## Current State Analysis

### Existing Implementation

The `DatabaseTool` module (`lib/cybernetic/mcp/tools/database_tool.ex:1-259`) implements a mock database query interface:

1. **Mock execute_query function** (`database_tool.ex:239-246`):
   - Returns hardcoded fake data
   - No actual database connection
   - Ignores the SQL parameter entirely

2. **Basic SQL sanitization** (`database_tool.ex:230-237`):
   - Only removes `;`, `--`, `/*`, `*/` characters
   - **Critical Security Issue**: This is insufficient for preventing SQL injection attacks
   - String replacement approach is fundamentally flawed

3. **Authorization already implemented** (`database_tool.ex:92-129`):
   - Uses `AuthManager.authorize/3` for permission checks
   - Supports `:database_read`, `:database_write`, `:database_admin` permissions
   - Fallback to general `:read` permission for backward compatibility
   - Proper authorization infrastructure exists

4. **Four operations supported**:
   - `query`: Execute SQL queries (currently mocked)
   - `schema`: Schema management operations (mocked)
   - `transaction`: Transaction support (mocked)
   - `analyze`: Table analysis (mocked)

### Database Configuration

The platform has a fully configured Ecto.Repo setup:

1. **Repo module** (`lib/cybernetic/repo.ex:1-70`):
   - Uses `Ecto.Repo` with PostgreSQL adapter
   - Connection pooling configured via `DBConnection` (Ecto default)
   - **Tenant isolation support**: `set_tenant/1`, `clear_tenant/0`, `with_tenant/2` functions for Row-Level Security (RLS)
   - Telemetry events emitted for observability
   - No existing schemas found (database is empty/minimal)

2. **Database configuration** (`config/runtime.exs:3-24`):
   - Supports `DATABASE_URL` or individual connection parameters
   - Configurable pool size (default: 10)
   - Query timeout: 30 seconds (configurable via `ECTO_TIMEOUT`)
   - SSL support for production
   - Test environment uses `Ecto.Adapters.SQL.Sandbox` with pool_size: 10

3. **Connection pooling**:
   - Handled automatically by Ecto's `DBConnection` library
   - Configurable via `pool_size`, `queue_target`, `queue_interval`
   - Test mode uses Sandbox for transactional isolation

### Key Files

#### Core Implementation Files

- **`lib/cybernetic/mcp/tools/database_tool.ex:1-259`** - Main DatabaseTool module
  - Line 239-246: Mock `execute_query/2` that needs replacement
  - Line 131-145: `perform_operation/3` for "query" operation
  - Line 230-237: Inadequate `sanitize_sql/1` function
  - Line 92-129: Authorization logic (already working correctly)
  - Line 55-88: Parameter validation

- **`lib/cybernetic/repo.ex:1-70`** - Ecto.Repo configuration
  - Line 24-26: Repo definition with PostgreSQL adapter
  - Line 36-42: `set_tenant/1` for tenant-scoped queries
  - Line 48-51: `clear_tenant/0` for tenant cleanup
  - Line 59-68: `with_tenant/2` for tenant context management
  - **Note**: `query!/2` and `query/2` are available from Ecto.Repo

- **`lib/cybernetic/mcp/tool.ex:1-37`** - Tool behavior definition
  - Defines the interface all MCP tools must implement
  - DatabaseTool correctly implements this behavior

- **`lib/cybernetic/security/auth_manager.ex:1-647`** - Authentication and authorization
  - Line 170-173: `authorize/3` function for permission checks
  - DatabaseTool already uses this correctly
  - Supports RBAC with role-based permissions

- **`lib/cybernetic/security/rbac.ex:1-146`** - Role-based access control
  - Line 18-24: Role permissions mapping
  - Line 104-119: `authorized?/3` for authorization logic
  - Line 128-138: `check_resource_permission/3` for resource:action checks

#### Configuration Files

- **`config/config.exs:8-14`** - Base Ecto configuration
  - Repo configuration with UUID primary keys
  - Migration timestamps in microseconds

- **`config/runtime.exs:3-24`** - Database connection settings
  - Connection parameters and pool configuration
  - Query timeout: 30 seconds
  - Pool size: 10 (configurable)

- **`config/test.exs:33-36`** - Test database configuration
  - Uses `Ecto.Adapters.SQL.Sandbox`
  - Pool size: 10 for concurrent tests

#### Test Files

- **`test/cybernetic/mcp/tools/database_tool_test.exs:1-214`** - DatabaseTool tests
  - Line 28-73: Parameter validation tests
  - Line 75-102: Query execution tests (testing mock behavior)
  - Line 87-94: SQL sanitization tests (currently testing inadequate implementation)
  - Line 177-212: Authorization tests
  - **Note**: Tests will need updating after implementation

## Technical Considerations

### Dependencies

1. **Ecto.Adapters.Postgres** - Already in `mix.exs:83`
   - Provides `Ecto.Repo.query/4` for raw SQL execution
   - Supports parameterized queries (critical for SQL injection prevention)

2. **Postgrex** - Already in `mix.exs:83`
   - PostgreSQL driver for Elixir
   - Handles connection pooling automatically
   - Provides timeout configuration

3. **DBConnection** - Transitive dependency (via Ecto)
   - Manages connection pooling
   - Configurable timeouts and queue settings
   - Already configured in runtime.exs

4. **No additional dependencies needed** - All required libraries are already installed

### Security Considerations

#### SQL Injection Prevention

**Current implementation vulnerability** (`database_tool.ex:230-237`):
```elixir
defp sanitize_sql(sql) do
  # Basic SQL injection prevention
  sql
  |> String.replace(";", "")
  |> String.replace("--", "")
  |> String.replace("/*", "")
  |> String.replace("*/", "")
end
```

**Critical issues**:
1. String replacement is NOT sufficient for SQL injection prevention
2. Many SQL injection techniques bypass simple character removal
3. No protection against UNION-based injections
4. No protection against comment variations (`--`, `#`, `/* */`)

**Required approach**:
1. **Use parameterized queries** via `Ecto.Repo.query(sql, params, opts)`
   - This is the ONLY reliable way to prevent SQL injection
   - Example: `Repo.query("SELECT * FROM users WHERE id = $1", [user_id])`

2. **Query validation**:
   - Parse SQL to detect dangerous keywords (INSERT, UPDATE, DELETE, DROP, etc.)
   - Use regex or SQL parser to validate query structure
   - Reject queries with multiple statements (prevent command stacking)

3. **Read-only enforcement**:
   - Check that SQL starts with `SELECT` or `WITH` (CTE)
   - Reject queries containing: INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE, etc.
   - Use PostgreSQL's `SET transaction_read_only = true` or `READ ONLY` transaction mode

4. **Query result limits**:
   - Enforce `LIMIT` clause in queries (append if not present)
   - Max rows limit: 1000 rows (configurable)
   - Use PostgreSQL's `FETCH FIRST` or `LIMIT` clause

#### Query Result Size Limits

**Implementation approach**:
1. **Parse and validate LIMIT**:
   - Extract existing LIMIT clause if present
   - If LIMIT > max_limit, replace with max_limit
   - If no LIMIT, append `LIMIT max_limit`

2. **PostgreSQL query timeout**:
   - Use `timeout` option in `Repo.query/4`
   - Default: 15 seconds (shorter than connection timeout)
   - Prevents runaway queries

3. **Row count validation**:
   - After query execution, verify row count
   - Return error if exceeds limit (shouldn't happen with LIMIT enforcement)

#### Authorization

**Current implementation** (`database_tool.ex:92-129`) is already correct:
- Uses `AuthManager.authorize(auth_context, :database, :database_read)` for queries
- Supports role-based permissions via RBAC
- Fallback to `:read` permission for backward compatibility
- No changes needed - this is working as designed

### Patterns to Follow

1. **Ecto.Repo.query/4 pattern**:
   ```elixir
   {:ok, %Postgrex.Result{rows: rows, columns: columns}} =
     Repo.query("SELECT * FROM users WHERE id = $1", [user_id], timeout: 15_000)
   ```

2. **Tenant isolation** (`repo.ex:59-68`):
   ```elixir
   Repo.with_tenant(tenant_id, fn ->
     Repo.query(sql, params, opts)
   end)
   ```
   - Extract tenant_id from context[:auth_context].metadata[:tenant_id]
   - Use if available, otherwise query without tenant context

3. **Error handling pattern** from other tools:
   - Return `{:error, reason}` tuples
   - Include descriptive error messages
   - Log errors for debugging

4. **Test pattern** (`database_tool_test.exs:75-102`):
   - Tests should verify real database queries in integration tests
   - Unit tests should mock Repo for speed
   - Security tests for SQL injection are critical

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **SQL Injection via string interpolation** | Critical | Use parameterized queries exclusively (`Repo.query(sql, params)`). Never interpolate user input into SQL strings. |
| **Unauthorized data access** | High | Leverage existing AuthManager RBAC. Only allow queries with valid auth context and `:database_read` permission. |
| **Denial of Service via large result sets** | High | Enforce LIMIT clause (max 1000 rows). Use query timeout (15s). Monitor query performance via telemetry. |
| **Write operations bypassing read-only** | Critical | Validate SQL keywords (reject INSERT/UPDATE/DELETE/etc). Use PostgreSQL read-only transactions. |
| **Connection pool exhaustion** | Medium | Rely on Ecto's built-in connection pooling. Configure appropriate pool_size (currently 10). Use timeouts to prevent hanging. |
| **Tenant data leakage** | High | Always use `Repo.with_tenant/2` when tenant_id present. Test tenant isolation thoroughly. |
| **Query performance issues** | Medium | Set query timeout (15s). Use telemetry to track slow queries. Consider query complexity limits in future. |
| **Breaking existing tests** | Low | Update tests to use real database queries or mock Repo appropriately. Maintain backward compatibility. |

## Recommended Approach

### Implementation Strategy

1. **Phase 1: Core Query Execution**
   - Replace mock `execute_query/2` with `Ecto.Repo.query/4`
   - Implement parameterized query support
   - Add proper error handling and result formatting
   - Maintain backward compatibility with existing interface

2. **Phase 2: Security Hardening**
   - Implement SQL keyword validation (read-only enforcement)
   - Add query result limits (max 1000 rows)
   - Enforce query timeouts (15 seconds)
   - Parse and validate LIMIT clauses

3. **Phase 3: Tenant Isolation**
   - Integrate with `Repo.with_tenant/2`
   - Extract tenant_id from auth context
   - Test tenant data isolation

4. **Phase 4: Testing**
   - Write comprehensive security tests for SQL injection
   - Test read-only enforcement (try to INSERT, UPDATE, DROP)
   - Test query result limits
   - Test timeout handling
   - Test tenant isolation

### Code Structure

```elixir
defp execute_query(sql, database, context) do
  with :ok <- validate_sql_read_only(sql),
       :ok <- enforce_result_limit(sql),
       {:ok, tenant_id} <- extract_tenant_id(context),
       {:ok, result} <- execute_with_tenant(sql, tenant_id) do
    format_result(result, database)
  end
end

defp validate_sql_read_only(sql) do
  normalized = String.upcase(String.trim(sql))
  cond do
    String.starts_with?(normalized, "SELECT") or
       String.starts_with?(normalized, "WITH") -> :ok
    true -> {:error, :read_only_violation}
  end
end

defp enforce_result_limit(sql) do
  # Parse and validate LIMIT clause
  # Add LIMIT if missing
  # Replace if exceeds max
  :ok
end

defp execute_with_tenant(sql, nil) do
  query(sql, [], timeout: @query_timeout)
end

defp execute_with_tenant(sql, tenant_id) do
  Repo.with_tenant(tenant_id, fn ->
    query(sql, [], timeout: @query_timeout)
  end)
end

defp query(sql, params, opts) do
  # Parameterized query with timeout
  case Repo.query(sql, params, opts) do
    {:ok, %Postgrex.Result{} = result} -> {:ok, result}
    {:error, %Postgrex.Error{} = error} -> {:error, format_error(error)}
  end
end
```

### Configuration Additions

Add to `config/runtime.exs`:
```elixir
config :cybernetic, :database_tool,
  max_result_rows: 1000,
  query_timeout_ms: 15_000,
  read_only_enforced: true
```

### Testing Strategy

1. **Unit tests** (mock Repo for speed):
   - Test SQL validation (read-only checks)
   - Test LIMIT clause enforcement
   - Test parameter extraction
   - Test error handling

2. **Integration tests** (real database):
   - Test actual queries against test database
   - Test tenant isolation
   - Test connection pooling behavior
   - Test timeout handling

3. **Security tests** (critical):
   - SQL injection attempts (UNION, comment-based, etc.)
   - Read-only bypass attempts (INSERT, UPDATE, DROP)
   - Large result set attempts
   - Timeout bypass attempts
   - Tenant isolation breaches

## Open Questions

1. **Should we support multiple databases?**
   - Current spec says "single database only"
   - `database` parameter in query is currently ignored
   - Recommendation: Remove `database` parameter or use for logging only

2. **What is the maximum query complexity allowed?**
   - Not specified in requirements
   - Recommendation: Start with simple queries, add complexity limits later if needed
   - Use query timeout as primary control mechanism

3. **Should we cache frequently-accessed data?**
   - Not in scope for this implementation
   - Recommendation: Add caching layer later if performance issues arise
   - Ecto has query caching built-in

4. **How should we handle schema operations?**
   - Currently mocked in `perform_operation("schema", ...)`
   - Recommendation: Keep schema operations mocked for now (out of scope)
   - Future work: Implement actual schema inspection via PostgreSQL queries

5. **Should we support connection pooling configuration per-operation?**
   - Current pool configuration is global
   - Recommendation: Use global pool for simplicity, tune if needed
   - Can add operation-specific pool configuration later

6. **Error message detail level?**
   - Security best practice: Don't leak database structure in errors
   - Recommendation: Generic error messages for users, detailed logs for admins
   - Example: "Query execution failed" vs "Table 'users' doesn't exist"

## Additional Notes

1. **No existing schemas**: The database appears to be empty (no migrations, no schema files found)
   - Integration tests will need to set up test tables
   - Consider creating a test schema setup in `test/support/test_repo.exs`

2. **Telemetry integration**: Ecto already emits query telemetry events
   - Use `[:cybernetic, :repo, :query]` events for monitoring
   - Track query performance and failed queries

3. **Oban integration**: Oban is configured and uses the same Repo
   - Ensure DatabaseTool queries don't interfere with Oban operations
   - Use separate connection pool if needed (via `:pool_key` option)

4. **Production readiness**: The platform is production-ready with proper secret management
   - Use environment-based configuration (already set up)
   - No hardcoded credentials
   - Proper SSL support for database connections

5. **Backward compatibility**: Maintain existing API surface
   - Keep `execute/3` function signature unchanged
   - Keep `@tool_info` metadata structure
   - Keep authorization checks as-is

6. **Performance considerations**:
   - Connection pooling is already configured (pool_size: 10)
   - Query timeout prevents runaway queries
   - Result limits prevent memory exhaustion
   - Consider adding query complexity tracking in future

7. **Documentation needs**:
   - Document allowed query patterns
   - Document security model (parameterized queries, read-only)
   - Document error codes and meanings
   - Document tenant isolation behavior
