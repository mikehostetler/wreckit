defmodule Cybernetic.VSM.System1.Operational do
  use Supervisor

  @moduledoc """
  S1: Entry points, AMQP workers, Telegram agent, etc.
  """

  @spec start_link(keyword()) :: Supervisor.on_start()
  def start_link(opts \\ []), do: Supervisor.start_link(__MODULE__, opts, name: __MODULE__)

  def init(_opts) do
    children = [
      {DynamicSupervisor, name: Cybernetic.VSM.System1.AgentSupervisor, strategy: :one_for_one}
    ]

    Supervisor.init(children, strategy: :one_for_one)
  end

  @doc "Test interface - routes messages through the message handler"
  @spec handle_message(map(), map()) :: :ok | {:error, term()}
  def handle_message(message, meta \\ %{}) do
    # Extract operation from type field or operation field
    operation =
      case Map.get(message, :type) || Map.get(message, "type") do
        "vsm.s1.operation" ->
          "operation"

        "vsm.s1.error" ->
          "error"

        "vsm.s1.success" ->
          "success"

        "vsm.s1.status" ->
          "status_update"

        "vsm.s1.resource" ->
          "resource_request"

        "vsm.s1.coordination" ->
          "coordination"

        "vsm.s1.telemetry" ->
          "telemetry"

        _ ->
          # Fallback to operation field or operation extracted from message
          Map.get(message, :operation, Map.get(message, "operation", "default"))
      end

    Cybernetic.VSM.System1.MessageHandler.handle_message(operation, message, meta)
  end
end
