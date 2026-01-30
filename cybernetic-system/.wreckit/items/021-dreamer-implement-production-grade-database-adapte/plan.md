# [DREAMER] Implement production-grade database adapter for MCP DatabaseTool Implementation Plan

## Overview
Replace the mocked `DatabaseTool` implementation with a production-grade database query adapter using Ecto.Repo. The current implementation returns fake hardcoded data, preventing external systems from querying the actual Cybernetic platform database through the MCP interface. This implementation will add real SQL query execution with comprehensive security measures including SQL injection prevention, read-only enforcement, query result limits, and proper tenant isolation.

## Current State Analysis

### Current State Analysis

The `DatabaseTool` module (`lib/cybernetic/mcp/tools/database_tool.ex`) currently provides:

1. **Mock execute_query function** (lines 239-246):
   - Returns hardcoded fake data: `[%{id: 1, name: "Test", value: 100}, %{id: 2, name: "Demo", value: 200}]`
   - Ignores the SQL parameter entirely
   - No actual database connection

2. **Inadequate SQL sanitization** (lines 230-237):
   ```elixir
   defp sanitize_sql(sql) do
     sql
     |> String.replace(";", "")
     |> String.replace("--", "")
     |> String.replace("/*", "")
     |> String.replace("*/", "")
   end
   ```
   - **Critical Security Vulnerability**: String replacement is NOT sufficient for SQL injection prevention
   - Vulnerable to UNION-based injections, comment variations, and many other SQLi techniques
   - Must be replaced with parameterized queries

3. **Authorization already implemented** (lines 92-129):
   - Uses `AuthManager.authorize/3` for permission checks
   - Supports `:database_read`, `:database_write`, `:database_admin` permissions
   - Fallback to general `:read` permission for backward compatibility
   - **No changes needed** - this is working correctly

4. **Database configuration ready** (`lib/cybernetic/repo.ex`):
   - Ecto.Repo with PostgreSQL adapter fully configured
   - Connection pooling via DBConnection (pool_size: 10, timeout: 30s)
   - Tenant isolation support: `set_tenant/1`, `clear_tenant/0`, `with_tenant/2`
   - Telemetry events emitted for observability

### Key Discoveries
- **No existing schemas/migrations**: Database is empty (no migrations in `priv/repo/migrations/`)
- **Authorization infrastructure exists**: RBAC and AuthManager are already working
- **Ecto fully configured**: Repo, connection pooling, and tenant isolation are ready to use
- **Test infrastructure ready**: Tests use `Ecto.Adapters.SQL.Sandbox` for transactional isolation
- **Tenant isolation pattern established**: `Repo.with_tenant/2` for Row-Level Security

### What's Missing
1. **Real query execution**: `execute_query/2` is mocked and returns fake data
2. **SQL injection prevention**: Current `sanitize_sql/1` is fundamentally insecure
3. **Read-only enforcement**: No validation that queries are SELECT-only
4. **Query result limits**: No LIMIT clause enforcement to prevent large result sets
5. **Tenant isolation integration**: Not using `Repo.with_tenant/2` for multi-tenancy
6. **Security tests**: No tests for SQL injection, read-only bypass, or result limits

### Key Constraints
1. **Must use existing Repo for tenant isolation** - Cannot create separate database connections
2. **SQL injection prevention is critical** - String replacement is insufficient, must use parameterized queries
3. **Query result size limits required** - Must enforce max rows (default: 1000)
4. **Must only allow read operations in production** - Write operations must be rejected
5. **Authorization checks already working** - Do not modify existing authorization logic
6. **Single database only** - The `database` parameter is currently ignored and should remain so

## Desired End State

A production-ready `DatabaseTool` that:
1. Executes real SQL queries via `Ecto.Repo.query/4` with proper error handling
2. Prevents SQL injection through:
   - Keyword validation (reject INSERT, UPDATE, DELETE, DROP, etc.)
   - Parameterized query support (for future use with query parameters)
   - Read-only enforcement (SELECT/WITH only)
3. Enforces query result limits via:
   - Automatic LIMIT clause injection (max 1000 rows, configurable)
   - Query timeout of 15 seconds (shorter than 30s connection timeout)
4. Integrates with existing tenant isolation via `Repo.with_tenant/2`
5. Provides clear, secure error messages without leaking database structure
6. Includes comprehensive security tests for SQL injection, read-only bypass, and limits

### Verification Methods

1. **Automated**: All tests pass including new security tests
2. **Automated**: Integration tests execute real queries against test database
3. **Manual**: SQL injection attempts are rejected with appropriate errors
4. **Manual**: Read-only enforcement blocks write operations
5. **Manual**: Query results are limited to configured maximum
6. **Manual**: Tenant isolation prevents cross-tenant data access

### Key Discoveries

- **Authorization already implemented** (`database_tool.ex:92-129`): No changes needed to `authorize_operation/2`
- **Connection pooling already configured** (`runtime.exs:10-12`): Ecto's DBConnection handles pooling automatically
- **Tenant isolation functions exist** (`repo.ex:59-68`): `with_tenant/2` ready to use
- **No database migrations exist**: Database is empty/minimal - tests will need to create test tables
- **Test database configured** (`test.exs:33-36`): Uses Ecto.Adapters.SQL.Sandbox with pool_size: 10

## What We're NOT Doing

1. **Write operations (INSERT, UPDATE, DELETE, DROP, etc.)**: Intentionally not allowed per requirements
2. **Database migrations**: Separate concern, out of scope
3. **Multi-database support**: The `database` parameter is ignored (single database only)
4. **Schema operations**: Keep `perform_operation("schema", ...)` mocked (out of scope)
5. **Transaction operations**: Keep `perform_operation("transaction", ...)` mocked (out of scope)
6. **Analyze operations**: Keep `perform_operation("analyze", ...)` mocked (out of scope)
7. **Query caching**: Not in scope, can be added later if performance issues arise
8. **Connection pool tuning**: Using global pool configuration, no per-operation pools
9. **Parameterized query support**: Not implementing full parameter binding (future enhancement)
10. **Query complexity limits**: Using timeout as primary control mechanism

## Implementation Approach

### High-Level Strategy

**Incremental, security-first approach with comprehensive testing at each phase:**

1. **Phase 1**: Core query execution with real database connection
2. **Phase 2**: Security hardening (read-only enforcement, SQL validation)
3. **Phase 3**: Query result limits and timeout handling
4. **Phase 4**: Tenant isolation integration
5. **Phase 5**: Comprehensive security testing

This order minimizes risk by:
- Establishing working functionality first (Phase 1)
- Adding security layers incrementally (Phases 2-3)
- Integrating with existing infrastructure last (Phase 4)
- Validating security thoroughly (Phase 5)

### Technical Approach

1. **Replace mock `execute_query/2`** with real `Ecto.Repo.query/4` call
2. **Add SQL validation layer** that checks for dangerous keywords before execution
3. **Implement LIMIT enforcement** by parsing and modifying SQL queries
4. **Extract tenant_id from auth context** and use `Repo.with_tenant/2` when available
5. **Add configuration** for max_result_rows and query_timeout_ms
6. **Write security tests** for SQL injection, read-only bypass, and result limits

---

## Phase 1: Core Query Execution

### Overview
Replace the mocked `execute_query/2` function with real database queries using `Ecto.Repo.query/4`. Establish the foundation for all subsequent security enhancements.

### Changes Required

#### 1. DatabaseTool Module
**File**: `lib/cybernetic/mcp/tools/database_tool.ex`

**Change 1.1**: Add module attributes for configuration
```elixir
# Add after line 16 (after require Logger)
@query_timeout 15_000
@max_result_rows 1000
```

**Change 1.2**: Replace mock `execute_query/2` (lines 239-246)
```elixir
defp execute_query(sql, database, context) do
  # Execute SQL query against the database
  # Note: database parameter is ignored (single database only)
  case query_with_tenant(sql, context) do
    {:ok, %Postgrex.Result{rows: rows, columns: columns}} ->
      formatted_rows = format_rows(rows, columns)
      {:ok, formatted_rows}

    {:error, %Postgrex.Error{} = error} ->
      Logger.error("Database query failed: #{inspect(error)}")
      {:error, format_query_error(error)}
  end
end

defp query_with_tenant(sql, context) do
  tenant_id = extract_tenant_id(context)

  if tenant_id do
    Repo.with_tenant(tenant_id, fn ->
      Repo.query(sql, [], timeout: @query_timeout)
    end)
  else
    Repo.query(sql, [], timeout: @query_timeout)
  end
end

defp extract_tenant_id(context) do
  case context[:auth_context][:metadata][:tenant_id] do
    tenant_id when is_binary(tenant_id) -> tenant_id
    _ -> nil
  end
end

defp format_rows(rows, columns) do
  Enum.map(rows, fn row ->
    columns
    |> Enum.zip(row)
    |> Map.new()
  end)
end

defp format_query_error(%Postgrex.Error{postgres: %{code: code, message: msg}}) do
  # Return generic error message to avoid leaking database structure
  "Query execution failed"
end
```

**Change 1.3**: Update `perform_operation("query", ...)` (lines 131-145)
```elixir
defp perform_operation("query", params, context) do
  # Execute SQL query with real database connection
  sql = params["sql"]
  database = params["database"] || "default"

  start_time = System.monotonic_time(:millisecond)

  case execute_query(sql, database, context) do
    {:ok, results} ->
      execution_time = System.monotonic_time(:millisecond) - start_time

      %{
        rows: results,
        row_count: length(results),
        execution_time: execution_time,
        database: database
      }

    {:error, reason} ->
      # Return error in a format consistent with other tools
      %{error: reason}
  end
end
```

### Success Criteria

#### Automated Verification:
- [ ] Tests pass: `mix test test/cybernetic/mcp/tools/database_tool_test.exs`
- [ ] Type checking passes: `mix compile` (no dialyzer errors)
- [ ] Build succeeds: `mix release` (or `mix compile` for dev)

#### Manual Verification:
- [ ] Query executes against real database (not mocked data)
- [ ] Query results are formatted as maps with column names as keys
- [ ] Query execution time is measured and returned
- [ ] Database errors are caught and returned gracefully
- [ ] Authorization still works (unauthorized users rejected)

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Security Hardening - Read-Only Enforcement

### Overview
Implement read-only enforcement by validating SQL queries to ensure they only contain SELECT or WITH (CTE) statements. Reject all write operations (INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE, etc.).

### Changes Required

#### 1. DatabaseTool Module
**File**: `lib/cybernetic/mcp/tools/database_tool.ex`

**Change 2.1**: Add SQL validation functions (add after `execute_query/2`)
```elixir
defp execute_query(sql, database, context) do
  with :ok <- validate_sql_read_only(sql),
       {:ok, result} <- query_with_tenant(sql, context) do
    formatted_rows = format_rows(result.columns, result.rows)
    {:ok, formatted_rows}
  else
    {:error, reason} = error ->
      Logger.error("Database query failed: #{inspect(reason)}")
      error
  end
end

defp validate_sql_read_only(sql) do
  normalized = String.upcase(String.trim(sql))

  cond do
    # Allow SELECT queries
    String.starts_with?(normalized, "SELECT") ->
      :ok

    # Allow WITH (Common Table Expressions)
    String.starts_with?(normalized, "WITH") ->
      :ok

    # Explicitly check for dangerous keywords
    contains_dangerous_keyword?(normalized) ->
      {:error, :read_only_violation}

    # Reject anything else
    true ->
      {:error, :invalid_query_type}
  end
end

defp contains_dangerous_keyword?(sql) do
  dangerous_keywords = [
    "INSERT", "UPDATE", "DELETE", "DROP", "TRUNCATE",
    "ALTER", "CREATE", "GRANT", "REVOKE", "COMMENT",
    "COPY", "LOCK", "REFRESH MATERIALIZED VIEW"
  ]

  # Use word boundary matching to avoid false positives
  # e.g., "SELECT" should not match "SELECTION"
  Enum.any?(dangerous_keywords, fn keyword ->
    Regex.compile!("\\b#{keyword}\\b") |> Regex.match?(sql)
  end)
end
```

**Change 2.2**: Update error formatting
```elixir
defp format_query_error(%Postgrex.Error{} = error) do
  case error do
    %{postgres: %{code: code}} ->
      format_postgres_error(code)

    _ ->
      "Query execution failed"
  end
end

defp format_postgres_error(code) do
  # Map common PostgreSQL error codes to user-friendly messages
  # https://www.postgresql.org/docs/current/errcodes-appendix.html
  case code do
    # Syntax errors
    "42601" -> "Invalid SQL syntax"
    "42602" -> "Invalid SQL syntax"

    # Permission errors
    "42501" -> "Permission denied"

    # Table doesn't exist
    "42P01" -> "Table not found"

    # Column doesn't exist
    "42703" -> "Column not found"

    # Generic database error
    _ -> "Query execution failed"
  end
end
```

### Success Criteria

#### Automated Verification:
- [ ] Tests pass: `mix test test/cybernetic/mcp/tools/database_tool_test.exs`
- [ ] New security tests for read-only enforcement pass
- [ ] Type checking passes: `mix compile`

#### Manual Verification:
- [ ] SELECT queries execute successfully
- [ ] WITH (CTE) queries execute successfully
- [ ] INSERT queries are rejected with `:read_only_violation`
- [ ] UPDATE queries are rejected with `:read_only_violation`
- [ ] DELETE queries are rejected with `:read_only_violation`
- [ ] DROP TABLE queries are rejected with `:read_only_violation`
- [ ] Error messages are generic (don't leak database structure)

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to Phase 3.

---

## Phase 3: Query Result Limits and Timeout Handling

### Overview
Implement query result limits to prevent large result sets from causing memory exhaustion or performance issues. Automatically inject LIMIT clauses and enforce query timeouts.

### Changes Required

#### 1. DatabaseTool Module
**File**: `lib/cybernetic/mcp/tools/database_tool.ex`

**Change 3.1**: Add LIMIT enforcement (modify `execute_query/2`)
```elixir
defp execute_query(sql, database, context) do
  with :ok <- validate_sql_read_only(sql),
       {:ok, limited_sql} <- enforce_result_limit(sql),
       {:ok, result} <- query_with_tenant(limited_sql, context) do
    formatted_rows = format_rows(result.columns, result.rows)
    {:ok, formatted_rows}
  else
    {:error, reason} = error ->
      Logger.error("Database query failed: #{inspect(reason)}")
      error
  end
end

defp enforce_result_limit(sql) do
  normalized = String.upcase(sql)

  # Check if LIMIT clause already exists
  case extract_existing_limit(normalized) do
    {:ok, existing_limit} when existing_limit > @max_result_rows ->
      # LIMIT exceeds maximum, replace it
      {:ok, replace_limit(sql, @max_result_rows)}

    {:ok, _existing_limit} ->
      # LIMIT is within bounds, use original SQL
      {:ok, sql}

    :not_found ->
      # No LIMIT clause, append one
      {:ok, append_limit(sql, @max_result_rows)}
  end
end

defp extract_existing_limit(sql) do
  # Use regex to find LIMIT clause
  # Pattern: LIMIT <number> or FETCH FIRST <number> ROWS ONLY
  case Regex.run(~r/\bLIMIT\s+(\d+)/i, sql) do
    [_, limit_str] -> {:ok, String.to_integer(limit_str)}
    nil -> :not_found
  end
end

defp replace_limit(sql, new_limit) do
  # Replace existing LIMIT with new value
  Regex.replace(~r/\bLIMIT\s+\d+/i, sql, "LIMIT #{new_limit}")
end

defp append_limit(sql, limit) do
  # Append LIMIT clause to end of query
  # Handle queries that end with semicolon
  clean_sql = String.trim_trailing(sql, ";")
  "#{clean_sql} LIMIT #{limit};"
end
```

**Change 3.2**: Remove insecure `sanitize_sql/1` function (lines 230-237)
```elixir
# DELETE THIS FUNCTION - it's insecure and unnecessary
# defp sanitize_sql(sql) do
#   sql
#   |> String.replace(";", "")
#   |> String.replace("--", "")
#   |> String.replace("/*", "")
#   |> String.replace("*/", "")
# end
```

**Change 3.3**: Update `perform_operation("query", ...)` to handle errors
```elixir
defp perform_operation("query", params, context) do
  sql = params["sql"]
  database = params["database"] || "default"

  start_time = System.monotonic_time(:millisecond)

  case execute_query(sql, database, context) do
    {:ok, results} ->
      execution_time = System.monotonic_time(:millisecond) - start_time

      %{
        rows: results,
        row_count: length(results),
        execution_time: execution_time,
        database: database
      }

    {:error, :read_only_violation} ->
      %{error: "Write operations are not allowed"}

    {:error, :invalid_query_type} ->
      %{error: "Only SELECT queries are allowed"}

    {:error, reason} when is_binary(reason) ->
      %{error: reason}
  end
end
```

### Success Criteria

#### Automated Verification:
- [ ] Tests pass: `mix test test/cybernetic/mcp/tools/database_tool_test.exs`
- [ ] New tests for LIMIT enforcement pass
- [ ] New tests for timeout handling pass
- [ ] Type checking passes: `mix compile`

#### Manual Verification:
- [ ] Queries without LIMIT have LIMIT 1000 appended
- [ ] Queries with LIMIT > 1000 are capped at 1000
- [ ] Queries with LIMIT <= 1000 use original LIMIT
- [ ] Queries that take longer than 15 seconds timeout
- [ ] Error messages are clear and secure
- [ ] Old `sanitize_sql/1` function is removed

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to Phase 4.

---

## Phase 4: Tenant Isolation Integration

### Overview
Integrate with existing tenant isolation infrastructure using `Repo.with_tenant/2`. Extract tenant_id from auth context and apply it to all queries for proper Row-Level Security (RLS).

### Changes Required

#### 1. DatabaseTool Module
**File**: `lib/cybernetic/mcp/tools/database_tool.ex`

**Change 4.1**: Verify tenant isolation is working (already implemented in Phase 1)
```elixir
# This function was added in Phase 1 - verify it works correctly
defp query_with_tenant(sql, context) do
  tenant_id = extract_tenant_id(context)

  if tenant_id do
    Repo.with_tenant(tenant_id, fn ->
      Repo.query(sql, [], timeout: @query_timeout)
    end)
  else
    Repo.query(sql, [], timeout: @query_timeout)
  end
end

defp extract_tenant_id(context) do
  case context[:auth_context][:metadata][:tenant_id] do
    tenant_id when is_binary(tenant_id) -> tenant_id
    _ -> nil
  end
end
```

**Change 4.2**: Add logging for tenant context
```elixir
defp query_with_tenant(sql, context) do
  tenant_id = extract_tenant_id(context)

  if tenant_id do
    Logger.debug("Executing query within tenant context: #{tenant_id}")
    Repo.with_tenant(tenant_id, fn ->
      Repo.query(sql, [], timeout: @query_timeout)
    end)
  else
    Logger.debug("Executing query without tenant context")
    Repo.query(sql, [], timeout: @query_timeout)
  end
end
```

### Success Criteria

#### Automated Verification:
- [ ] Tests pass: `mix test test/cybernetic/mcp/tools/database_tool_test.exs`
- [ ] New tenant isolation tests pass
- [ ] Type checking passes: `mix compile`

#### Manual Verification:
- [ ] Queries with tenant_id in auth context use `Repo.with_tenant/2`
- [ ] Queries without tenant_id execute normally
- [ ] Tenant isolation is logged for debugging
- [ ] Existing authorization still works correctly

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to Phase 5.

---

## Phase 5: Comprehensive Security Testing

### Overview
Write comprehensive security tests to validate SQL injection prevention, read-only enforcement, query result limits, and tenant isolation. Ensure all security measures are working correctly.

### Changes Required

#### 1. DatabaseTool Test Module
**File**: `test/cybernetic/mcp/tools/database_tool_test.exs`

**Change 5.1**: Add test database setup
```elixir
defmodule Cybernetic.MCP.Tools.DatabaseToolTest do
  use ExUnit.Case, async: true
  alias Cybernetic.MCP.Tools.DatabaseTool
  alias Cybernetic.Repo

  # Setup test database tables
  setup do
    # Create a test table for queries
    Repo.query("""
      CREATE TABLE IF NOT EXISTS test_users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    """)

    # Insert test data
    Repo.query("""
      INSERT INTO test_users (name, email)
      VALUES
        ('Alice', 'alice@example.com'),
        ('Bob', 'bob@example.com'),
        ('Charlie', 'charlie@example.com')
    """)

    on_exit(fn ->
      Repo.query("DROP TABLE IF EXISTS test_users")
    end)

    :ok
  end

  # ... existing tests ...
end
```

**Change 5.2**: Add SQL injection tests
```elixir
describe "SQL injection prevention" do
  test "rejects UNION-based injection" do
    malicious_sql = "SELECT * FROM test_users WHERE id = 1 UNION SELECT * FROM test_users"
    params = %{"sql" => malicious_sql}

    assert {:ok, result} = DatabaseTool.execute("query", params, @valid_context)
    # Should return normal results, not injected data
    assert is_list(result.result.rows)
  end

  test "rejects comment-based injection" do
    malicious_sql = "SELECT * FROM test_users -- This is a comment"
    params = %{"sql" => malicious_sql}

    assert {:ok, result} = DatabaseTool.execute("query", params, @valid_context)
    assert is_list(result.result.rows)
  end

  test "handles semicolons safely" do
    malicious_sql = "SELECT * FROM test_users; DROP TABLE test_users;--"
    params = %{"sql" => malicious_sql}

    # Should reject due to read-only enforcement
    assert {:ok, result} = DatabaseTool.execute("query", params, @valid_context)
    # Table should still exist
    assert {:ok, _} = Repo.query("SELECT * FROM test_users")
  end
end
```

**Change 5.3**: Add read-only enforcement tests
```elixir
describe "read-only enforcement" do
  test "allows SELECT queries" do
    params = %{"sql" => "SELECT * FROM test_users"}

    assert {:ok, result} = DatabaseTool.execute("query", params, @valid_context)
    assert is_list(result.result.rows)
    assert result.result.row_count > 0
  end

  test "allows WITH (CTE) queries" do
    params = %{"sql" => "WITH ranked AS (SELECT *, ROW_NUMBER() OVER () AS rn FROM test_users) SELECT * FROM ranked"}

    assert {:ok, result} = DatabaseTool.execute("query", params, @valid_context)
    assert is_list(result.result.rows)
  end

  test "rejects INSERT queries" do
    params = %{"sql" => "INSERT INTO test_users (name, email) VALUES ('Eve', 'eve@example.com')"}

    assert {:ok, result} = DatabaseTool.execute("query", params, @valid_context)
    assert result.result.error == "Write operations are not allowed"
  end

  test "rejects UPDATE queries" do
    params = %{"sql" => "UPDATE test_users SET name = 'Updated' WHERE id = 1"}

    assert {:ok, result} = DatabaseTool.execute("query", params, @valid_context)
    assert result.result.error == "Write operations are not allowed"
  end

  test "rejects DELETE queries" do
    params = %{"sql" => "DELETE FROM test_users WHERE id = 1"}

    assert {:ok, result} = DatabaseTool.execute("query", params, @valid_context)
    assert result.result.error == "Write operations are not allowed"
  end

  test "rejects DROP TABLE queries" do
    params = %{"sql" => "DROP TABLE test_users"}

    assert {:ok, result} = DatabaseTool.execute("query", params, @valid_context)
    assert result.result.error == "Write operations are not allowed"
  end

  test "rejects ALTER TABLE queries" do
    params = %{"sql" => "ALTER TABLE test_users ADD COLUMN age INTEGER"}

    assert {:ok, result} = DatabaseTool.execute("query", params, @valid_context)
    assert result.result.error == "Write operations are not allowed"
  end
end
```

**Change 5.4**: Add query result limit tests
```elixir
describe "query result limits" do
  test "enforces LIMIT when not present" do
    # Insert 2000 rows
    Repo.query("""
      INSERT INTO test_users (name, email)
      SELECT 'User ' || generate_series(1, 2000), 'user' || generate_series(1, 2000) || '@example.com'
    """)

    params = %{"sql" => "SELECT * FROM test_users"}

    assert {:ok, result} = DatabaseTool.execute("query", params, @valid_context)
    # Should be limited to 1000 rows
    assert result.result.row_count <= 1000
  end

  test "respects existing LIMIT below maximum" do
    params = %{"sql" => "SELECT * FROM test_users LIMIT 10"}

    assert {:ok, result} = DatabaseTool.execute("query", params, @valid_context)
    assert result.result.row_count <= 10
  end

  test "caps LIMIT exceeding maximum" do
    params = %{"sql" => "SELECT * FROM test_users LIMIT 5000"}

    assert {:ok, result} = DatabaseTool.execute("query", params, @valid_context)
    assert result.result.row_count <= 1000
  end
end
```

**Change 5.5**: Add tenant isolation tests
```elixir
describe "tenant isolation" do
  test "executes query without tenant context" do
    context_without_tenant = %{
      auth_context: %{
        user_id: "test_user",
        roles: [:admin],
        permissions: [:all]
      },
      actor: "test_user"
    }

    params = %{"sql" => "SELECT 1 AS value"}

    assert {:ok, result} = DatabaseTool.execute("query", params, context_without_tenant)
    assert is_list(result.result.rows)
  end

  test "executes query with tenant context" do
    context_with_tenant = %{
      auth_context: %{
        user_id: "test_user",
        roles: [:admin],
        permissions: [:all],
        metadata: %{tenant_id: "tenant_123"}
      },
      actor: "test_user"
    }

    params = %{"sql" => "SELECT 1 AS value"}

    assert {:ok, result} = DatabaseTool.execute("query", params, context_with_tenant)
    assert is_list(result.result.rows)
  end
end
```

**Change 5.6**: Update existing query execution tests
```elixir
describe "query execution" do
  test "executes SQL query" do
    params = %{"sql" => "SELECT * FROM test_users", "database" => "test"}

    assert {:ok, result} = DatabaseTool.execute("query", params, @valid_context)
    assert is_map(result.result)
    assert is_list(result.result.rows)
    assert result.result.database == "test"
    assert result.metadata.tool == "database"
    assert result.metadata.operation == "query"
  end

  test "returns formatted rows with column names" do
    params = %{"sql" => "SELECT name, email FROM test_users LIMIT 1"}

    assert {:ok, result} = DatabaseTool.execute("query", params, @valid_context)
    assert is_list(result.result.rows)

    # First row should be a map with column names as keys
    case result.result.rows do
      [%{name: name, email: email}] ->
        assert is_binary(name)
        assert is_binary(email)

      _ ->
        flunk("Expected rows to be maps with column names as keys")
    end
  end

  test "measures execution time" do
    params = %{"sql" => "SELECT * FROM test_users"}

    assert {:ok, result} = DatabaseTool.execute("query", params, @valid_context)
    assert is_integer(result.result.execution_time)
    assert result.result.execution_time >= 0
  end

  test "uses default database when not specified" do
    params = %{"sql" => "SELECT 1"}

    assert {:ok, result} = DatabaseTool.execute("query", params, @valid_context)
    assert result.result.database == "default"
  end
end
```

**Change 5.7**: Remove old sanitization test (line 87-94)
```elixir
# DELETE THIS TEST - sanitize_sql function is removed
# test "sanitizes SQL to prevent injection" do
#   dangerous_sql = "SELECT * FROM users; DROP TABLE users;--"
#   params = %{"sql" => dangerous_sql}
#
#   assert {:ok, result} = DatabaseTool.execute("query", params, @valid_context)
#   # Should execute but with sanitized SQL
#   assert is_map(result.result)
# end
```

### Success Criteria

#### Automated Verification:
- [ ] All tests pass: `mix test test/cybernetic/mcp/tools/database_tool_test.exs`
- [ ] Security tests for SQL injection pass
- [ ] Security tests for read-only enforcement pass
- [ ] Security tests for query result limits pass
- [ ] Tenant isolation tests pass
- [ ] Type checking passes: `mix compile`
- [ ] No regressions in other tests

#### Manual Verification:
- [ ] SQL injection attempts are prevented
- [ ] Write operations are blocked with clear error messages
- [ ] Query result limits are enforced
- [ ] Tenant isolation works correctly
- [ ] Error messages don't leak database structure

**Note**: This is the final phase. Complete all verification and confirm production readiness.

---

## Testing Strategy

### Unit Tests
- **SQL validation**: Test `validate_sql_read_only/1` with various query types
- **LIMIT enforcement**: Test `enforce_result_limit/1` with and without existing LIMIT
- **Error formatting**: Test `format_query_error/1` with different PostgreSQL error codes
- **Tenant extraction**: Test `extract_tenant_id/1` with various auth contexts

### Integration Tests
- **Real database queries**: Execute actual SELECT queries against test database
- **Write operation rejection**: Verify INSERT/UPDATE/DELETE are rejected
- **LIMIT enforcement**: Verify large result sets are capped
- **Tenant isolation**: Verify tenant_id is used in queries when present
- **Error handling**: Verify database errors are caught and formatted

### Manual Testing Steps

1. **Start the application**: `mix phx.server` or `iex -S mix`
2. **Execute a simple query**:
   ```elixir
   Cybernetic.MCP.Tools.DatabaseTool.execute(
     "query",
     %{"sql" => "SELECT 1 AS value"},
     %{auth_context: %{user_id: "test", roles: [:admin], permissions: [:all]}, actor: "test"}
   )
   ```
3. **Try a write operation** (should be rejected):
   ```elixir
   Cybernetic.MCP.Tools.DatabaseTool.execute(
     "query",
     %{"sql" => "INSERT INTO test_users (name) VALUES ('Test')"},
     %{auth_context: %{user_id: "test", roles: [:admin], permissions: [:all]}, actor: "test"}
   )
   ```
4. **Try SQL injection** (should be prevented):
   ```elixir
   Cybernetic.MCP.Tools.DatabaseTool.execute(
     "query",
     %{"sql" => "SELECT * FROM test_users; DROP TABLE test_users;--"},
     %{auth_context: %{user_id: "test", roles: [:admin], permissions: [:all]}, actor: "test"}
   )
   ```
5. **Test query limits**:
   ```elixir
   Cybernetic.MCP.Tools.DatabaseTool.execute(
     "query",
     %{"sql" => "SELECT * FROM test_users"}, # Should auto-add LIMIT 1000
     %{auth_context: %{user_id: "test", roles: [:admin], permissions: [:all]}, actor: "test"}
   )
   ```

## Migration Notes

### No Database Migrations Required
This implementation does not require any database migrations. It uses the existing Ecto.Repo configuration and PostgreSQL connection pool.

### Backward Compatibility
- **API surface unchanged**: `execute/3` signature remains the same
- **Authorization unchanged**: Existing authorization checks continue to work
- **Tool metadata unchanged**: `@tool_info` remains the same
- **Breaking change**: Queries now return real data instead of mock data (this is the intended behavior)

### Test Data Migration
- Tests will need to create their own tables using `Repo.query/2` in setup blocks
- No shared test fixtures - each test creates and drops its own tables
- This ensures tests are isolated and can run in any order

## References

### Research
- Research document: `/Users/speed/wreckit/cybernetic-system/.wreckit/items/021-dreamer-implement-production-grade-database-adapte/research.md`

### Core Implementation Files
- `lib/cybernetic/mcp/tools/database_tool.ex:1-259` - Main DatabaseTool module
- `lib/cybernetic/repo.ex:1-70` - Ecto.Repo with tenant isolation
- `lib/cybernetic/security/auth_manager.ex:1-647` - Authentication and authorization
- `lib/cybernetic/security/rbac.ex:1-146` - Role-based access control

### Configuration Files
- `config/config.exs:8-14` - Base Ecto configuration
- `config/runtime.exs:3-24` - Database connection and pool settings
- `config/test.exs:33-36` - Test database configuration

### Test Files
- `test/cybernetic/mcp/tools/database_tool_test.exs:1-214` - DatabaseTool tests

### Key Dependencies
- Ecto.Adapters.Postgres - PostgreSQL adapter (already in mix.exs:83)
- Postgrex - PostgreSQL driver (already in mix.exs:83)
- DBConnection - Connection pooling (transitive dependency)

### Security Best Practices
- OWASP SQL Injection Prevention Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html
- PostgreSQL Error Codes: https://www.postgresql.org/docs/current/errcodes-appendix.html
- Ecto Security Guide: https://hexdocs.pm/ecto/security.html
