defmodule Cybernetic.Core.Aggregator.Behaviour do
  @moduledoc "Contract for fact aggregators."
  @callback ingest(event :: map(), state :: term()) :: {:ok, state :: term()}
  @callback snapshot(state :: term()) :: %{facts: list(map())}
end
