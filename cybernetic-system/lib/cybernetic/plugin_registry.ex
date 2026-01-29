defmodule Cybernetic.Plugin.Registry do
  use GenServer

  def start_link(_), do: GenServer.start_link(__MODULE__, %{}, name: __MODULE__)

  def register(plugin_mod, opts \\ %{}),
    do: GenServer.call(__MODULE__, {:register, plugin_mod, opts})

  def list(), do: GenServer.call(__MODULE__, :list)

  @impl true
  def init(state), do: {:ok, state}

  @impl true
  def handle_call({:register, mod, opts}, _from, state) do
    case Code.ensure_loaded(mod) do
      {:module, _} ->
        {:reply, :ok, Map.put(state, mod, %{opts: opts})}

      _ ->
        {:reply, {:error, :not_loaded}, state}
    end
  end

  def handle_call(:list, _from, state), do: {:reply, Map.keys(state), state}
end
