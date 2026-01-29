defmodule Cybernetic.Storage.Supervisor do
  @moduledoc """
  Supervisor for storage-related processes.

  Starts and supervises:
  - Memory adapter GenServer (when configured)
  - Future: Connection pools, cache servers, etc.

  ## Usage

  Add to your application supervision tree:

      children = [
        {Cybernetic.Storage.Supervisor, []}
      ]

  Or with options:

      children = [
        {Cybernetic.Storage.Supervisor, adapter: Cybernetic.Storage.Adapters.Memory}
      ]
  """
  use Supervisor

  alias Cybernetic.Config

  @doc """
  Start the storage supervisor.

  ## Options

    * `:adapter` - Override the configured adapter
    * `:name` - Override supervisor name (default: __MODULE__)
  """
  @spec start_link(keyword()) :: Supervisor.on_start()
  def start_link(opts \\ []) do
    name = Keyword.get(opts, :name, __MODULE__)
    Supervisor.start_link(__MODULE__, opts, name: name)
  end

  @impl true
  def init(opts) do
    adapter = Keyword.get(opts, :adapter, Config.storage_adapter())

    children = build_children(adapter)

    Supervisor.init(children, strategy: :one_for_one)
  end

  # Build child specs based on configured adapter
  @spec build_children(module()) :: [Supervisor.child_spec()]
  defp build_children(Cybernetic.Storage.Adapters.Memory) do
    [
      Cybernetic.Storage.Adapters.Memory
    ]
  end

  defp build_children(_adapter) do
    # Local and S3 adapters don't need supervised processes
    []
  end
end
