defmodule Cybernetic.VSM.System3.MessageHandler do
  @moduledoc """
  Message handler for VSM System 3 (Control).
  Handles control and monitoring messages.
  """
  require Logger

  def handle_message(operation, payload, meta) do
    # Wrap in telemetry span for dynamic tracing
    :telemetry.span(
      [:cybernetic, :archeology, :span],
      %{system: :s3, operation: operation},
      fn ->
        Logger.debug("System3 received #{operation}: #{inspect(payload)}")

        result = do_handle_message(operation, payload, meta)

        {result, %{payload_size: byte_size(inspect(payload))}}
      end
    )
  end

  defp do_handle_message(operation, payload, meta) do
    case operation do
      "control" ->
        handle_control(payload, meta)

      "monitor" ->
        handle_monitor(payload, meta)

      "alert" ->
        handle_alert(payload, meta)

      "default" ->
        handle_default(payload, meta)

      _ ->
        Logger.warning("Unknown operation for System3: #{operation}")
        {:error, :unknown_operation}
    end
  rescue
    error ->
      Logger.error("Error in System3 message handler: #{inspect(error)}")
      {:error, error}
  end

  defp handle_control(payload, _meta) do
    Logger.info("System3: Control action - #{inspect(payload)}")
    :ok
  end

  defp handle_monitor(payload, _meta) do
    Logger.debug("System3: Monitor update - #{inspect(payload)}")
    :ok
  end

  defp handle_alert(payload, _meta) do
    Logger.warning("System3: Alert received - #{inspect(payload)}")
    :ok
  end

  defp handle_default(payload, _meta) do
    Logger.debug("System3: Default handler - #{inspect(payload)}")
    :ok
  end
end
