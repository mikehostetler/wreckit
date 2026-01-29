defmodule Cybernetic.MCP.Tools.DatabaseTool do
  @moduledoc """
  MCP Database Tool - Provides database query and management capabilities.

  Allows the VSM systems to:
  - Execute SQL queries
  - Manage database schemas
  - Perform data analysis
  - Handle transactions
  """

  @behaviour Cybernetic.MCP.Tool

  alias Cybernetic.Security.AuthManager
  require Logger

  @tool_info %{
    name: "database",
    version: "1.0.0",
    description: "Database query and management tool",
    capabilities: ["query", "schema", "transaction", "analyze"],
    requires_auth: true
  }

  @impl true
  def info, do: @tool_info

  @impl true
  def execute(operation, params, context) do
    # Verify authorization
    with :ok <- authorize_operation(operation, context),
         :ok <- validate_params(operation, params) do
      # Log the operation (AuditLogger disabled for now)
      Logger.info("Database tool: #{operation} by #{context[:actor]}")

      # Execute the operation
      result = perform_operation(operation, params, context)

      # Return result with metadata
      {:ok,
       %{
         result: result,
         metadata: %{
           tool: "database",
           operation: operation,
           timestamp: DateTime.utc_now()
         }
       }}
    else
      {:error, reason} -> {:error, reason}
    end
  end

  @impl true
  def validate_params(operation, params) do
    case operation do
      "query" ->
        if params["sql"] && is_binary(params["sql"]) do
          :ok
        else
          {:error, "Missing or invalid 'sql' parameter"}
        end

      "schema" ->
        if params["action"] in ["list", "describe", "create", "drop"] do
          :ok
        else
          {:error, "Invalid schema action"}
        end

      "transaction" ->
        if params["operations"] && is_list(params["operations"]) do
          :ok
        else
          {:error, "Missing or invalid 'operations' parameter"}
        end

      "analyze" ->
        if params["table"] && params["metrics"] do
          :ok
        else
          {:error, "Missing table or metrics parameters"}
        end

      _ ->
        {:error, "Unknown operation: #{operation}"}
    end
  end

  # ========== PRIVATE FUNCTIONS ==========

  defp authorize_operation(operation, context) do
    # Check if user has permission for this operation
    case operation do
      "query" ->
        # Allow both specific database_read permission and general read permission
        auth_context = context[:auth_context]

        case AuthManager.authorize(auth_context, :database, :database_read) do
          :ok ->
            :ok

          {:error, :unauthorized} ->
            # Fallback to general read permission for backward compatibility
            AuthManager.authorize(auth_context, :database, :read)
        end

      "analyze" ->
        # Same logic for analyze operations
        auth_context = context[:auth_context]

        case AuthManager.authorize(auth_context, :database, :database_read) do
          :ok ->
            :ok

          {:error, :unauthorized} ->
            AuthManager.authorize(auth_context, :database, :read)
        end

      "schema" ->
        AuthManager.authorize(context[:auth_context], :database, :database_admin)

      "transaction" ->
        AuthManager.authorize(context[:auth_context], :database, :database_write)

      _ ->
        AuthManager.authorize(context[:auth_context], :database, :database_admin)
    end
  end

  defp perform_operation("query", params, _context) do
    # Execute SQL query
    sql = sanitize_sql(params["sql"])
    database = params["database"] || "default"

    # In production, use actual database connection
    {:ok, results} = execute_query(sql, database)

    %{
      rows: results,
      row_count: length(results),
      execution_time: 42,
      database: database
    }
  end

  defp perform_operation("schema", params, _context) do
    action = params["action"]

    case action do
      "list" ->
        # List all tables/schemas
        %{
          schemas: ["public", "cybernetic", "audit"],
          tables: [
            "vsm_events",
            "policies",
            "audit_log",
            "crdt_state"
          ]
        }

      "describe" ->
        # Describe a specific table
        table = params["table"]

        %{
          table: table,
          columns: [
            %{name: "id", type: "uuid", nullable: false},
            %{name: "data", type: "jsonb", nullable: true},
            %{name: "created_at", type: "timestamp", nullable: false}
          ],
          indexes: ["id_idx", "created_at_idx"],
          constraints: ["pk_id"]
        }

      "create" ->
        # Create new table/schema
        %{
          status: "created",
          schema: params["schema_definition"]
        }

      "drop" ->
        # Drop table/schema
        %{
          status: "dropped",
          table: params["table"]
        }
    end
  end

  defp perform_operation("transaction", params, context) do
    operations = params["operations"]

    # Execute operations in transaction
    results =
      operations
      |> Enum.map(fn op ->
        perform_operation(op["type"], op["params"], context)
      end)

    %{
      transaction_id: generate_transaction_id(),
      operations_count: length(operations),
      results: results,
      status: "committed"
    }
  end

  defp perform_operation("analyze", params, _context) do
    table = params["table"]
    metrics = params["metrics"]

    # Perform analysis
    %{
      table: table,
      row_count: 10000,
      size_bytes: 1_048_576,
      metrics: calculate_metrics(table, metrics),
      statistics: %{
        mean: 42.5,
        median: 40,
        std_dev: 12.3
      }
    }
  end

  defp sanitize_sql(sql) do
    # Basic SQL injection prevention
    sql
    |> String.replace(";", "")
    |> String.replace("--", "")
    |> String.replace("/*", "")
    |> String.replace("*/", "")
  end

  defp execute_query(_sql, _database) do
    # Mock implementation - replace with actual database connection
    {:ok,
     [
       %{id: 1, name: "Test", value: 100},
       %{id: 2, name: "Demo", value: 200}
     ]}
  end

  defp calculate_metrics(_table, metrics) do
    Enum.map(metrics, fn metric ->
      {metric, :rand.uniform(100)}
    end)
    |> Map.new()
  end

  defp generate_transaction_id do
    "txn_" <> (:crypto.strong_rand_bytes(8) |> Base.encode16())
  end
end
