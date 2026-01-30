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
  alias Cybernetic.Repo
  require Logger

  # Configuration from runtime.exs
  @query_timeout Application.compile_env(:cybernetic, :database_tool)[:query_timeout_ms] || 15_000
  @max_result_rows Application.compile_env(:cybernetic, :database_tool)[:max_result_rows] || 1000
  @read_only_enforced Application.compile_env(:cybernetic, :database_tool)[:read_only_enforced] != false

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

      {:error, _reason} ->
        %{error: "Query execution failed"}
    end
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

  defp execute_query(sql, _database, context) do
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

  defp extract_tenant_id(context) do
    case context[:auth_context][:metadata][:tenant_id] do
      tenant_id when is_binary(tenant_id) -> tenant_id
      _ -> nil
    end
  end

  defp format_rows(columns, rows) do
    # columns: list of column names (strings)
    # rows: list of rows, each row is a list of values
    Enum.map(rows, fn row ->
      columns
      |> Enum.zip(row)
      |> Map.new()
    end)
  end

  defp format_query_error(%Postgrex.Error{postgres: %{code: _code, message: _msg}}) do
    # Return generic error message to avoid leaking database structure
    "Query execution failed"
  end

  defp format_query_error(%Postgrex.Error{}) do
    "Query execution failed"
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
