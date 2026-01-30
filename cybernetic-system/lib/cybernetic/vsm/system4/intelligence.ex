defmodule Cybernetic.VSM.System4.Intelligence do
  use GenServer

  @moduledoc """
  S4: LLM reasoning, scenario simulation, MCP tool calls.
  """
  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(_opts \\ []), do: GenServer.start_link(__MODULE__, %{}, name: __MODULE__)
  def init(state), do: {:ok, state}

  # Handle transport messages from in-memory transport
  def handle_cast({:transport_message, message, opts}, state) do
    # Extract operation from type field first (for routing keys), then fallback to operation field
    operation =
      case Map.get(message, :type) || Map.get(message, "type") do
        "vsm.s4.intelligence" ->
          "intelligence"

        "vsm.s4.analyze" ->
          "analyze"

        "vsm.s4.learn" ->
          "learn"

        "vsm.s4.predict" ->
          "predict"

        "algedonic.pain" ->
          "algedonic"

        "algedonic.pleasure" ->
          "algedonic"

        _ ->
          # Fallback to operation field
          Map.get(message, :operation, Map.get(message, "operation", "unknown"))
      end

    meta = Keyword.get(opts, :meta, %{})

    # Process the message through the message handler
    Cybernetic.VSM.System4.MessageHandler.handle_message(operation, message, meta)

    {:noreply, state}
  end

  @doc "Test interface - routes messages through the message handler"
  @spec handle_message(map(), map()) :: :ok | {:error, term()}
  def handle_message(message, meta \\ %{}) do
    operation = Map.get(message, :operation, "unknown")
    Cybernetic.VSM.System4.MessageHandler.handle_message(operation, message, meta)
  end
end
