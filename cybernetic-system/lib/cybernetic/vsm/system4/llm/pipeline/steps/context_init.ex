defmodule Cybernetic.VSM.System4.LLM.Pipeline.Steps.ContextInit do
  @moduledoc """
  Initialize the pipeline context with defaults and tracking information.
  """

  require Logger

  @doc """
  Initialize context with tracking and default values.
  """
  def run(ctx) do
    initialized =
      ctx
      |> Map.put_new(:t0, System.monotonic_time())
      |> Map.put_new(:started_at, DateTime.utc_now())
      |> Map.put_new(:usage, %{
        tokens_in: 0,
        tokens_out: 0,
        cost_usd: nil
      })
      |> Map.put_new(:telemetry, %{})
      |> Map.put_new(:stream?, false)
      |> Map.put_new(:params, %{})
      |> Map.put_new(:policy, %{})
      |> ensure_request_id()

    Logger.metadata(
      request_id: initialized[:request_id],
      operation: initialized[:op]
    )

    {:ok, initialized}
  end

  defp ensure_request_id(%{request_id: id} = ctx) when is_binary(id), do: ctx

  defp ensure_request_id(%{meta: %{request_id: id}} = ctx) when is_binary(id) do
    Map.put(ctx, :request_id, id)
  end

  defp ensure_request_id(ctx) do
    Map.put(ctx, :request_id, generate_request_id())
  end

  defp generate_request_id do
    "req_" <> Base.encode16(:crypto.strong_rand_bytes(8), case: :lower)
  end
end
