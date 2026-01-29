defmodule Cybernetic.Core.Goldrush.Plugins.Behaviour do
  @moduledoc """
  Behaviour for Goldrush plugins that process telemetry events.
  """

  @doc """
  Return plugin capabilities - what it consumes and produces.
  """
  @callback capabilities() :: %{
              consumes: list(atom()),
              produces: list(atom())
            }

  @doc """
  Process a message through the plugin.

  Returns:
  - {:ok, message} - Continue processing with potentially modified message
  - {:halt, message} - Stop processing and return this message
  - {:error, reason} - Processing error
  """
  @callback process(message :: map()) ::
              {:ok, map()} | {:halt, map()} | {:error, term()}
end
