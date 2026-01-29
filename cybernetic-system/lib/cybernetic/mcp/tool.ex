defmodule Cybernetic.MCP.Tool do
  @moduledoc """
  Behavior definition for MCP tools.

  All MCP tools must implement this behavior to be compatible
  with the Cybernetic framework.
  """

  @type tool_info :: %{
          name: String.t(),
          version: String.t(),
          description: String.t(),
          capabilities: [String.t()],
          requires_auth: boolean()
        }

  @type operation :: String.t()
  @type params :: map()
  @type context :: map()
  @type result :: {:ok, map()} | {:error, any()}

  @doc """
  Returns information about the tool
  """
  @callback info() :: tool_info()

  @doc """
  Executes a tool operation with given parameters and context
  """
  @callback execute(operation(), params(), context()) :: result()

  @doc """
  Validates parameters for a given operation
  """
  @callback validate_params(operation(), params()) :: :ok | {:error, String.t()}
end
