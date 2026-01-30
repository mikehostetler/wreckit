defmodule Cybernetic.VSM.System4.LLM.Pipeline.Steps.Postprocess do
  @moduledoc """
  Post-process LLM responses for domain compatibility.

  Handles tool calls, JSON validation, and response shaping.
  """

  require Logger

  @doc """
  Shape the response to match domain contracts.
  """
  def run(%{result: result} = ctx) when not is_nil(result) do
    # Already have a result, ensure it's properly formatted
    processed = process_result(result, ctx)
    {:ok, Map.put(ctx, :result, processed)}
  end

  def run(%{raw_response: raw} = ctx) when not is_nil(raw) do
    # Process raw response
    result = translate_to_domain(raw, ctx)
    {:ok, Map.put(ctx, :result, result)}
  end

  def run(ctx) do
    # No response to process
    Logger.warning("Postprocess: No response to process")
    {:ok, ctx}
  end

  defp process_result(result, ctx) do
    result
    |> ensure_required_fields()
    |> process_tool_calls()
    |> add_episode_metadata(ctx)
  end

  defp translate_to_domain(raw, ctx) do
    %{
      text: extract_text(raw),
      tokens: extract_tokens(raw),
      usage: extract_usage(raw),
      finish_reason: extract_finish_reason(raw),
      tool_calls: extract_tool_calls(raw)
    }
    |> add_episode_metadata(ctx)
  end

  defp ensure_required_fields(result) do
    result
    |> Map.put_new(:text, "")
    |> Map.put_new(:tokens, %{input: 0, output: 0})
    |> Map.put_new(:usage, %{})
    |> Map.put_new(:finish_reason, :stop)
  end

  defp extract_text(raw) do
    get_in(raw, [:content]) ||
      get_in(raw, [:text]) ||
      get_in(raw, [:choices, Access.at(0), :message, :content]) ||
      ""
  end

  defp extract_tokens(raw) do
    %{
      input: get_in(raw, [:usage, :input_tokens]) || 0,
      output: get_in(raw, [:usage, :output_tokens]) || 0
    }
  end

  defp extract_usage(raw) do
    %{
      cost_usd: get_in(raw, [:usage, :cost_usd]),
      latency_ms: get_in(raw, [:latency_ms])
    }
  end

  defp extract_finish_reason(raw) do
    reason =
      get_in(raw, [:finish_reason]) ||
        get_in(raw, [:choices, Access.at(0), :finish_reason])

    case reason do
      "stop" -> :stop
      "length" -> :length
      "tool_calls" -> :tool_calls
      "content_filter" -> :content_filter
      nil -> :stop
      other when is_binary(other) -> {:unknown, other}
      other -> other
    end
  end

  defp extract_tool_calls(raw) do
    get_in(raw, [:tool_calls]) ||
      get_in(raw, [:choices, Access.at(0), :message, :tool_calls]) ||
      []
  end

  defp process_tool_calls(result) do
    case result[:tool_calls] do
      calls when is_list(calls) and length(calls) > 0 ->
        processed_calls = Enum.map(calls, &process_tool_call/1)
        Map.put(result, :tool_calls, processed_calls)

      _ ->
        result
    end
  end

  defp process_tool_call(call) do
    %{
      id: call["id"] || call[:id] || generate_tool_id(),
      type: call["type"] || call[:type] || "function",
      function: process_function_call(call["function"] || call[:function])
    }
  end

  defp process_function_call(nil), do: %{}

  defp process_function_call(func) do
    %{
      name: func["name"] || func[:name],
      arguments: parse_arguments(func["arguments"] || func[:arguments])
    }
  end

  defp parse_arguments(args) when is_binary(args) do
    case Jason.decode(args) do
      {:ok, parsed} -> parsed
      _ -> args
    end
  end

  defp parse_arguments(args), do: args

  defp add_episode_metadata(result, %{episode: episode}) when not is_nil(episode) do
    Map.put(result, :episode_metadata, %{
      id: episode.id,
      kind: episode.kind,
      priority: episode.priority,
      source: episode.source
    })
  end

  defp add_episode_metadata(result, _ctx), do: result

  defp generate_tool_id do
    "call_" <> Base.encode16(:crypto.strong_rand_bytes(8), case: :lower)
  end
end
