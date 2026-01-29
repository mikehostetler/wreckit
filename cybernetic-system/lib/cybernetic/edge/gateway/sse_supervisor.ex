defmodule Cybernetic.Edge.Gateway.SSESupervisor do
  @moduledoc """
  Supervisor for SSE (Server-Sent Events) related processes.

  Manages:
  - Connection tracking ETS table ownership
  - Future: Connection manager GenServer, metrics collector

  ## Usage

  Add to your application supervision tree:

      children = [
        Cybernetic.Edge.Gateway.SSESupervisor
      ]
  """
  use Supervisor

  require Logger

  @connection_table :sse_connections

  @doc """
  Start the SSE supervisor.
  """
  @spec start_link(keyword()) :: Supervisor.on_start()
  def start_link(opts \\ []) do
    name = Keyword.get(opts, :name, __MODULE__)
    Supervisor.start_link(__MODULE__, opts, name: name)
  end

  @impl true
  def init(_opts) do
    # Initialize ETS table for connection tracking
    # The supervisor owns the table so it persists across controller processes
    init_connection_table()

    children = [
      # Connection tracker GenServer (future: replace ETS with proper state management)
      # {Cybernetic.Edge.Gateway.ConnectionTracker, []}
    ]

    Supervisor.init(children, strategy: :one_for_one)
  end

  @doc """
  Get the current connection count for a tenant.
  """
  @spec get_connection_count(String.t()) :: non_neg_integer()
  def get_connection_count(tenant_id) do
    case :ets.lookup(@connection_table, tenant_id) do
      [{^tenant_id, count}] -> count
      [] -> 0
    end
  rescue
    ArgumentError -> 0
  end

  @doc """
  Get all connection counts.
  """
  @spec get_all_connections() :: [{String.t(), non_neg_integer()}]
  def get_all_connections do
    :ets.tab2list(@connection_table)
  rescue
    ArgumentError -> []
  end

  @doc """
  Reset all connection counts. Use with caution!
  """
  @spec reset_connections() :: :ok
  def reset_connections do
    :ets.delete_all_objects(@connection_table)
    :ok
  rescue
    ArgumentError -> :ok
  end

  # Initialize the connection tracking ETS table
  defp init_connection_table do
    case :ets.whereis(@connection_table) do
      :undefined ->
        :ets.new(@connection_table, [
          :named_table,
          :public,
          :set,
          {:write_concurrency, true},
          {:read_concurrency, true}
        ])

        Logger.debug("SSE connection tracking table initialized")

      _ ->
        :ok
    end
  rescue
    ArgumentError ->
      # Table already exists (race condition)
      :ok
  end
end
