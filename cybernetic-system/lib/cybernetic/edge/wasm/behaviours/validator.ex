defmodule Cybernetic.Edge.WASM.Behaviours.Validator do
  @moduledoc """
  Contract for message validators executed in a WASM sandbox.
  """

  @type message :: map()
  @type decision :: :ok | {:error, term()}

  @callback init(opts :: map()) :: {:ok, state :: term()}
  @callback validate(message(), state :: term()) :: {decision(), state :: term()}
end
