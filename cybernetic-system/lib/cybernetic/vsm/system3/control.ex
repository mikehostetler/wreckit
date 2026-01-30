defmodule Cybernetic.VSM.System3.Control do
  use GenServer

  @moduledoc """
  S3: Resource mgmt, policy enforcement hooks, algedonic signals.
  """
  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(_opts \\ []), do: GenServer.start_link(__MODULE__, %{}, name: __MODULE__)
  def init(state), do: {:ok, Map.merge(%{metrics: %{}, policies: %{}}, state)}

  # Handle transport messages from in-memory transport
  def handle_cast({:transport_message, message, opts}, state) do
    # Route message to the appropriate message handler
    operation = Map.get(message, "operation", "unknown")
    meta = Keyword.get(opts, :meta, %{})

    # Process the message through the message handler
    Cybernetic.VSM.System3.MessageHandler.handle_message(operation, message, meta)

    {:noreply, state}
  end

  @doc "Test interface - routes messages through the message handler"
  @spec handle_message(map(), map()) :: :ok | {:error, term()}
  def handle_message(message, meta \\ %{}) do
    operation = Map.get(message, :operation, "unknown")
    Cybernetic.VSM.System3.MessageHandler.handle_message(operation, message, meta)
  end
end
