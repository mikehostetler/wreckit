defmodule Cybernetic.VSM.System4.LLM.Pipeline.Steps.Router do
  @moduledoc """
  Select the provider and model based on policy, episode kind, and availability.
  """

  require Logger

  @default_provider :anthropic
  @default_model "claude-3-5-sonnet-20241022"

  @doc """
  Determine routing based on policy and context.

  Sets `:route` in context with provider and model information.
  """
  def run(ctx) do
    route = select_route(ctx)

    Logger.info("Routing to provider: #{route.provider}, model: #{route.model}")

    {:ok, Map.put(ctx, :route, route)}
  end

  defp select_route(%{policy: %{force_provider: provider, force_model: model}})
       when not is_nil(provider) and not is_nil(model) do
    %{
      provider: provider,
      model: format_model_name(provider, model)
    }
  end

  defp select_route(%{episode: %{kind: kind}}) do
    # Route based on episode kind (matching existing logic)
    route_by_kind(kind)
  end

  defp select_route(%{op: op}) do
    # Route based on operation type
    route_by_operation(op)
  end

  defp select_route(_ctx) do
    # Default route
    route_for(@default_provider, @default_model)
  end

  defp route_by_kind(:policy_review) do
    route_for(:anthropic, @default_model)
  end

  defp route_by_kind(:code_gen) do
    route_for(:anthropic, @default_model)
  end

  defp route_by_kind(:root_cause) do
    route_for(:anthropic, @default_model)
  end

  defp route_by_kind(:anomaly_detection) do
    route_for(:anthropic, @default_model)
  end

  defp route_by_kind(:optimization) do
    route_for(:anthropic, @default_model)
  end

  defp route_by_kind(_kind) do
    route_for(@default_provider, @default_model)
  end

  defp route_by_operation(:analyze) do
    route_for(:anthropic, @default_model)
  end

  defp route_by_operation(:generate) do
    route_for(:anthropic, @default_model)
  end

  defp route_by_operation(:chat) do
    route_for(:anthropic, @default_model)
  end

  defp route_by_operation(_op) do
    route_for(@default_provider, @default_model)
  end

  # Format model names for req_llm compatibility
  defp format_model_name(:anthropic, model) do
    # req_llm expects "anthropic:model-name" format
    if String.contains?(model, ":") do
      model
    else
      "anthropic:#{model}"
    end
  end

  defp format_model_name(:openai, model) do
    if String.contains?(model, ":") do
      model
    else
      "openai:#{model}"
    end
  end

  defp format_model_name(:together, model) do
    # Together models often already have full path
    if String.contains?(model, ":") do
      model
    else
      "together:#{model}"
    end
  end

  defp format_model_name(:ollama, model) do
    if String.starts_with?(model, "ollama:") do
      model
    else
      "ollama:#{model}"
    end
  end

  defp format_model_name(_provider, model), do: model

  defp route_for(provider, fallback_model) do
    %{
      provider: provider,
      model: format_model_name(provider, configured_model(provider, fallback_model))
    }
  end

  defp configured_model(:anthropic, fallback) do
    Application.get_env(:cybernetic, Cybernetic.VSM.System4.Providers.Anthropic, [])
    |> Keyword.get(:model, fallback)
  end

  defp configured_model(:openai, fallback) do
    Application.get_env(:cybernetic, Cybernetic.VSM.System4.Providers.OpenAI, [])
    |> Keyword.get(:model, fallback)
  end

  defp configured_model(:together, fallback) do
    Application.get_env(:cybernetic, Cybernetic.VSM.System4.Providers.Together, [])
    |> Keyword.get(:model, fallback)
  end

  defp configured_model(:ollama, fallback) do
    Application.get_env(:cybernetic, Cybernetic.VSM.System4.Providers.Ollama, [])
    |> Keyword.get(:model, fallback)
  end

  defp configured_model(_provider, fallback), do: fallback
end