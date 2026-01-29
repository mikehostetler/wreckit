defmodule Cybernetic.VSM.System4.LLM.Pipeline.Steps.Accounting do
  @moduledoc """
  Track usage, costs, and emit telemetry for LLM operations.

  Maintains compatibility with existing telemetry events.
  """

  require Logger

  @telemetry_prefix [:cybernetic, :s4]

  @doc """
  Emit telemetry and track usage metrics.
  """
  def run(%{result: result, route: route, t0: t0} = ctx) when not is_nil(result) do
    latency_ns = System.monotonic_time() - t0
    latency_ms = System.convert_time_unit(latency_ns, :native, :millisecond)

    usage = extract_usage(result, ctx)

    # Emit telemetry events matching existing patterns
    emit_telemetry(route, usage, latency_ms, ctx)

    # Update context with final usage
    {:ok, Map.put(ctx, :usage, usage)}
  end

  def run(%{raw_response: raw, route: route, t0: t0} = ctx) when not is_nil(raw) do
    latency_ns = System.monotonic_time() - t0
    latency_ms = System.convert_time_unit(latency_ns, :native, :millisecond)

    usage = %{
      tokens_in: get_in(raw, [:usage, :input_tokens]) || 0,
      tokens_out: get_in(raw, [:usage, :output_tokens]) || 0,
      cost_usd: get_in(raw, [:usage, :cost_usd])
    }

    emit_telemetry(route, usage, latency_ms, ctx)

    {:ok, Map.put(ctx, :usage, usage)}
  end

  def run(ctx) do
    # No response to account for (might be streaming)
    {:ok, ctx}
  end

  defp extract_usage(result, _ctx) do
    %{
      tokens_in: get_in(result, [:tokens, :input]) || 0,
      tokens_out: get_in(result, [:tokens, :output]) || 0,
      cost_usd: get_in(result, [:usage, :cost_usd])
    }
  end

  defp emit_telemetry(route, usage, latency_ms, ctx) do
    # Main request telemetry
    :telemetry.execute(
      @telemetry_prefix ++ [:request],
      %{count: 1},
      %{
        provider: route.provider,
        model: route.model,
        operation: ctx[:op],
        request_id: ctx[:request_id]
      }
    )

    # Response telemetry with usage
    :telemetry.execute(
      @telemetry_prefix ++ [:response],
      %{
        latency_ms: latency_ms,
        tokens_in: usage.tokens_in,
        tokens_out: usage.tokens_out,
        total_tokens: usage.tokens_in + usage.tokens_out
      },
      %{
        provider: route.provider,
        model: route.model,
        operation: ctx[:op],
        request_id: ctx[:request_id]
      }
    )

    # Cost telemetry if available
    if usage.cost_usd do
      :telemetry.execute(
        @telemetry_prefix ++ [:cost],
        %{cost_usd: usage.cost_usd},
        %{
          provider: route.provider,
          model: route.model,
          operation: ctx[:op]
        }
      )
    end

    # Provider-specific telemetry for compatibility
    :telemetry.execute(
      [:cybernetic, :s4, route.provider, :usage],
      Map.merge(usage, %{latency_ms: latency_ms}),
      %{
        model: route.model,
        operation: ctx[:op],
        request_id: ctx[:request_id]
      }
    )

    Logger.info(
      "LLM request completed",
      provider: route.provider,
      model: route.model,
      tokens_in: usage.tokens_in,
      tokens_out: usage.tokens_out,
      latency_ms: latency_ms,
      cost_usd: usage.cost_usd
    )
  end
end
