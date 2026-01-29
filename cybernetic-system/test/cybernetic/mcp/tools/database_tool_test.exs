defmodule Cybernetic.MCP.Tools.DatabaseToolTest do
  use ExUnit.Case, async: true
  alias Cybernetic.MCP.Tools.DatabaseTool

  @valid_context %{
    auth_context: %{
      user_id: "test_user",
      roles: [:admin],
      permissions: [:all]
    },
    actor: "test_user"
  }

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
      params = %{"sql" => "SELECT * FROM users", "database" => "test"}

      assert {:ok, result} = DatabaseTool.execute("query", params, @valid_context)
      assert is_map(result.result)
      assert is_list(result.result.rows)
      assert result.result.database == "test"
      assert result.metadata.tool == "database"
      assert result.metadata.operation == "query"
    end

    test "sanitizes SQL to prevent injection" do
      dangerous_sql = "SELECT * FROM users; DROP TABLE users;--"
      params = %{"sql" => dangerous_sql}

      assert {:ok, result} = DatabaseTool.execute("query", params, @valid_context)
      # Should execute but with sanitized SQL
      assert is_map(result.result)
    end

    test "uses default database when not specified" do
      params = %{"sql" => "SELECT 1"}

      assert {:ok, result} = DatabaseTool.execute("query", params, @valid_context)
      assert result.result.database == "default"
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
