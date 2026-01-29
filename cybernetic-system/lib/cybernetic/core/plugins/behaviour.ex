defmodule Cybernetic.Core.Plugins.Behaviour do
  @moduledoc """
  Behavior for Cybernetic plugins.
  """

  @doc """
  Initialize the plugin with options.
  """
  @callback init_plugin(opts :: keyword()) :: {:ok, any()} | {:error, term()}

  @doc """
  Activate the plugin with configuration.
  """
  @callback activate(config :: map()) :: :ok | {:error, term()}

  @doc """
  Deactivate the plugin.
  """
  @callback deactivate(config :: map()) :: :ok | {:error, term()}

  @doc """
  Get plugin information.
  """
  @callback info() :: map()
end
