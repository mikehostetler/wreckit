defmodule Cybernetic.Plugin do
  @moduledoc """
  Behaviour for domain-specific, pluggable handlers in Cybernetic.
  """
  @callback init(opts :: map()) :: {:ok, state :: term()} | {:error, term()}
  @callback handle_event(event :: map(), state :: term()) ::
              {:ok, new_state :: term()} | {:error, term()}
  @callback metadata() :: map()
end
