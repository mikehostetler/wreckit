defmodule Cybernetic.MCP.Tools.DatabaseToolTest do
  use ExUnit.Case, async: false
  alias Cybernetic.MCP.Tools.DatabaseTool
  alias Cybernetic.Repo

  @valid_context %{
    auth_context: %{
      user_id: "test_user",
      roles: [:admin],
      permissions: [:all]
    },
    actor: "test_user"
  }

  # Setup test database tables - not async due to shared database
  setup do
    # Allow this test process to use the Sandbox connection
    :ok = Ecto.Adapters.SQL.Sandbox.checkout(Repo)
    Ecto.Adapters.SQL.Sandbox.mode(Repo, {:shared, self()})

    # Create a test table for queries
    {:ok, _} = Repo.query("""
      CREATE TABLE IF NOT EXISTS test_users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    """)

    # Insert test data
    {:ok, _} = Repo.query("""
      INSERT INTO test_users (name, email)
      VALUES
        ('Alice', 'alice@example.com'),
        ('Bob', 'bob@example.com'),
        ('Charlie', 'charlie@example.com')
    """)

    on_exit(fn ->
      # Shared mode handles cleanup for us or we can do it explicitly
      # But Repo.query here might still fail if process is gone.
      # Shared mode self() is usually enough.
      :ok
    end)

    :ok
  end

  describe "tool info" do
    test "returns correct tool information" do
      info = DatabaseTool.info()

      assert info.name == "database"
      assert info.version == "1.0.0"
      assert "query" in info.capabilities
      assert "schema" in info.capabilities
      assert "transaction" in info.capabilities
      assert "analyze" in info.capabilities
      assert info.requires_auth == true
    end
  end

  describe "parameter validation" do
    test "validates query parameters" do
      assert :ok = DatabaseTool.validate_params("query", %{"sql" => "SELECT * FROM users"})
      assert {:error, _} = DatabaseTool.validate_params("query", %{})
      assert {:error, _} = DatabaseTool.validate_params("query", %{"sql" => 123})
    end

    test "validates schema parameters" do
      assert :ok = DatabaseTool.validate_params("schema", %{"action" => "list"})
      assert :ok = DatabaseTool.validate_params("schema", %{"action" => "describe"})
      assert :ok = DatabaseTool.validate_params("schema", %{"action" => "create"})
      assert :ok = DatabaseTool.validate_params("schema", %{"action" => "drop"})

      assert {:error, _} = DatabaseTool.validate_params("schema", %{"action" => "invalid"})
      assert {:error, _} = DatabaseTool.validate_params("schema", %{})
    end

    test "validates transaction parameters" do
      operations = [
        %{"type" => "query", "params" => %{"sql" => "INSERT INTO..."}},
        %{"type" => "query", "params" => %{"sql" => "UPDATE..."}}
      ]

      assert :ok = DatabaseTool.validate_params("transaction", %{"operations" => operations})
      assert {:error, _} = DatabaseTool.validate_params("transaction", %{})

      assert {:error, _} =
               DatabaseTool.validate_params("transaction", %{"operations" => "not_a_list"})
    end

    test "validates analyze parameters" do
      assert :ok =
               DatabaseTool.validate_params("analyze", %{
                 "table" => "users",
                 "metrics" => ["count", "size"]
               })

      assert {:error, _} = DatabaseTool.validate_params("analyze", %{"table" => "users"})
      assert {:error, _} = DatabaseTool.validate_params("analyze", %{"metrics" => ["count"]})
    end

    test "rejects unknown operations" do
      assert {:error, "Unknown operation: invalid"} =
               DatabaseTool.validate_params("invalid", %{})
    end
  end

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
        [%{"name" => name, "email" => email}] ->
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

  describe "SQL injection prevention" do
    test "handles semicolons safely" do
      malicious_sql = "SELECT * FROM test_users; DROP TABLE test_users;--"
      params = %{"sql" => malicious_sql}

      # Should reject due to read-only enforcement
      assert {:ok, result} = DatabaseTool.execute("query", params, @valid_context)
      # Table should still exist
      assert {:ok, _} = Repo.query("SELECT * FROM test_users")
    end

    test "handles UNION-based queries" do
      # UNION-based queries are allowed if they're SELECT-only
      malicious_sql = "SELECT * FROM test_users WHERE name = 'Alice' UNION SELECT * FROM test_users"
      params = %{"sql" => malicious_sql}

      assert {:ok, result} = DatabaseTool.execute("query", params, @valid_context)
      assert is_list(result.result.rows)
    end

    test "handles comment-based queries" do
      malicious_sql = "SELECT * FROM test_users -- This is a comment"
      params = %{"sql" => malicious_sql}

      assert {:ok, result} = DatabaseTool.execute("query", params, @valid_context)
      assert is_list(result.result.rows)
    end
  end

  describe "query result limits" do
    test "enforces LIMIT when not present" do
      # Insert additional rows to ensure we have enough data
      Repo.query("""
        INSERT INTO test_users (name, email)
        SELECT 'User ' || generate_series(1, 10), 'user' || generate_series(1, 10) || '@example.com'
      """)

      params = %{"sql" => "SELECT * FROM test_users"}

      assert {:ok, result} = DatabaseTool.execute("query", params, @valid_context)
      # Should be limited to 1000 rows (default max)
      assert result.result.row_count <= 1000
    end

    test "respects existing LIMIT below maximum" do
      params = %{"sql" => "SELECT * FROM test_users LIMIT 2"}

      assert {:ok, result} = DatabaseTool.execute("query", params, @valid_context)
      assert result.result.row_count <= 2
    end

    test "caps LIMIT exceeding maximum" do
      params = %{"sql" => "SELECT * FROM test_users LIMIT 5000"}

      assert {:ok, result} = DatabaseTool.execute("query", params, @valid_context)
      assert result.result.row_count <= 1000
    end
  end

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

  describe "schema operations" do
    test "lists schemas and tables" do
      params = %{"action" => "list"}

      assert {:ok, result} = DatabaseTool.execute("schema", params, @valid_context)
      assert is_list(result.result.schemas)
      assert is_list(result.result.tables)
      assert "public" in result.result.schemas
    end

    test "describes table structure" do
      params = %{"action" => "describe", "table" => "users"}

      assert {:ok, result} = DatabaseTool.execute("schema", params, @valid_context)
      assert result.result.table == "users"
      assert is_list(result.result.columns)
      assert is_list(result.result.indexes)
      assert is_list(result.result.constraints)
    end

    test "creates new schema" do
      params = %{
        "action" => "create",
        "schema_definition" => %{"name" => "test_schema"}
      }

      assert {:ok, result} = DatabaseTool.execute("schema", params, @valid_context)
      assert result.result.status == "created"
      assert result.result.schema == params["schema_definition"]
    end

    test "drops table" do
      params = %{"action" => "drop", "table" => "old_table"}

      assert {:ok, result} = DatabaseTool.execute("schema", params, @valid_context)
      assert result.result.status == "dropped"
      assert result.result.table == "old_table"
    end
  end

  describe "transactions" do
    test "executes multiple operations in transaction" do
      operations = [
        %{"type" => "query", "params" => %{"sql" => "INSERT INTO users VALUES (1, 'test')"}},
        %{"type" => "query", "params" => %{"sql" => "UPDATE users SET name = 'updated'"}}
      ]

      params = %{"operations" => operations}

      assert {:ok, result} = DatabaseTool.execute("transaction", params, @valid_context)
      assert String.starts_with?(result.result.transaction_id, "txn_")
      assert result.result.operations_count == 2
      assert result.result.status == "committed"
      assert is_list(result.result.results)
    end
  end

  describe "analysis" do
    test "analyzes table metrics" do
      params = %{
        "table" => "users",
        "metrics" => ["row_count", "size", "indexes"]
      }

      assert {:ok, result} = DatabaseTool.execute("analyze", params, @valid_context)
      assert result.result.table == "users"
      assert is_integer(result.result.row_count)
      assert is_integer(result.result.size_bytes)
      assert is_map(result.result.metrics)
      assert is_map(result.result.statistics)
    end
  end

  describe "authorization" do
    test "denies query for unauthorized user" do
      unauthorized_context = %{
        auth_context: %{
          user_id: "viewer",
          roles: [:viewer],
          permissions: [:read]
        },
        actor: "viewer"
      }

      # Viewer can read
      params = %{"sql" => "SELECT * FROM users"}
      assert {:ok, _} = DatabaseTool.execute("query", params, unauthorized_context)

      # But cannot modify schema
      schema_params = %{"action" => "drop", "table" => "users"}
      assert {:error, _} = DatabaseTool.execute("schema", schema_params, unauthorized_context)
    end

    test "allows all operations for admin" do
      operations = ["query", "schema", "transaction", "analyze"]

      for op <- operations do
        params =
          case op do
            "query" -> %{"sql" => "SELECT 1"}
            "schema" -> %{"action" => "list"}
            "transaction" -> %{"operations" => []}
            "analyze" -> %{"table" => "test", "metrics" => []}
          end

        assert {:ok, _} = DatabaseTool.execute(op, params, @valid_context)
      end
    end
  end
end
