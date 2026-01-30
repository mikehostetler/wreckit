defmodule Cybernetic.VSM.System5.SOPShim do
  @moduledoc """
  Temporary shim for integrating S4 analysis results with the SOP engine.

  Converts S4 intelligence analysis into structured SOPs and stores them
  via the existing policy store until the full SOP engine is implemented.
  """

  require Logger
  alias Cybernetic.VSM.System5.SOPEngine

  @doc """
  Convert S4 analysis result into SOPs and store them.

  ## Parameters

  - episode: The analyzed episode
  - s4_result: Result from S4 provider analysis

  ## Returns

  {:ok, sop_ids} | {:error, reason}
  """
  def from_s4(episode, s4_result) do
    case extract_sop_suggestions(s4_result) do
      [] ->
        {:ok, []}

      sop_suggestions ->
        sops =
          Enum.map(sop_suggestions, fn suggestion ->
            convert_suggestion_to_sop(episode, s4_result, suggestion)
          end)

        {:ok, sop_ids} = store_sops(sops)
        Logger.info("Created #{length(sop_ids)} SOPs from S4 analysis of episode #{episode.id}")
        {:ok, sop_ids}
    end
  end

  @doc """
  Extract SOP suggestions from S4 analysis result.
  """
  def extract_sop_suggestions(s4_result) do
    case s4_result do
      %{sop_suggestions: suggestions} when is_list(suggestions) ->
        suggestions

      %{"sop_suggestions" => suggestions} when is_list(suggestions) ->
        suggestions

      _ ->
        # Fallback: create generic SOP from summary if no specific suggestions
        case s4_result do
          %{summary: summary} when is_binary(summary) ->
            [create_generic_sop_suggestion(summary)]

          %{"summary" => summary} when is_binary(summary) ->
            [create_generic_sop_suggestion(summary)]

          _ ->
            []
        end
    end
  end

  @doc """
  Convert S4 suggestion to SOP format.
  """
  def convert_suggestion_to_sop(episode, s4_result, suggestion) do
    trace_id = get_trace_id()
    provider_info = extract_provider_info(s4_result)

    %{
      "id" => generate_sop_id(),
      "title" => Map.get(suggestion, "title", "SOP from S4 Analysis"),
      "category" => Map.get(suggestion, "category", "operational"),
      "priority" => Map.get(suggestion, "priority", "medium"),
      "description" =>
        Map.get(suggestion, "description", "Generated from S4 intelligence analysis"),
      "triggers" => Map.get(suggestion, "triggers", ["episode analysis"]),
      "actions" => Map.get(suggestion, "actions", ["follow SOP guidelines"]),
      "status" => "draft",
      "version" => "1.0",
      "created_at" => DateTime.utc_now() |> DateTime.to_iso8601(),
      "metadata" => %{
        "source" => "s4_intelligence",
        "episode_id" => episode.id,
        "episode_kind" => episode.kind,
        "source_system" => episode.source_system,
        "analysis_provider" => provider_info.provider,
        "analysis_model" => provider_info.model,
        "trace_id" => trace_id,
        "confidence" => Map.get(s4_result, :confidence, 0.7),
        "risk_level" => Map.get(s4_result, :risk_level, "medium"),
        "automation_potential" => Map.get(suggestion, "automation_potential", "medium"),
        "local_processing" => Map.get(suggestion, "local_processing", false),
        "privacy_level" => Map.get(suggestion, "privacy_level", "medium")
      },
      "provenance" => %{
        "created_by" => "s4_intelligence",
        "created_from" => "episode_analysis",
        "provider" => provider_info.provider,
        "model" => provider_info.model,
        "trace_id" => trace_id,
        "analysis_timestamp" => DateTime.utc_now() |> DateTime.to_iso8601()
      }
    }
  end

  @doc """
  Store SOPs via the SOP Engine.
  """
  def store_sops(sops) do
    results =
      Enum.map(sops, fn sop ->
        case SOPEngine.create(sop) do
          {:ok, %{id: id}} -> {:ok, id}
          {:error, reason} -> {:error, reason}
        end
      end)

    case Enum.split_with(results, &match?({:ok, _}, &1)) do
      {successes, []} ->
        sop_ids = Enum.map(successes, fn {:ok, id} -> id end)
        {:ok, sop_ids}

      {successes, failures} ->
        sop_ids = Enum.map(successes, fn {:ok, id} -> id end)

        Logger.warning(
          "Partial SOP storage success: #{length(sop_ids)} succeeded, #{length(failures)} failed"
        )

        {:ok, sop_ids}
    end
  end

  @doc """
  Get current OpenTelemetry trace ID if available.
  """
  def get_trace_id do
    try do
      case OpenTelemetry.Tracer.current_span_ctx() do
        span_ctx when span_ctx != :undefined ->
          # Extract trace ID from span context
          case :otel_span.trace_id(span_ctx) do
            trace_id when trace_id != 0 ->
              trace_id |> Integer.to_string(16) |> String.pad_leading(32, "0")

            _ ->
              nil
          end

        _ ->
          nil
      end
    rescue
      _ -> nil
    end
  end

  @doc """
  Extract provider information from S4 result.
  """
  def extract_provider_info(s4_result) do
    # Try to extract from metadata or fallback to defaults
    provider =
      case s4_result do
        %{provider: provider} -> provider
        %{"provider" => provider} -> provider
        _ -> "unknown"
      end

    model =
      case s4_result do
        %{model: model} -> model
        %{"model" => model} -> model
        _ -> "unknown"
      end

    %{provider: provider, model: model}
  end

  @doc """
  Generate a unique SOP ID.
  """
  def generate_sop_id do
    timestamp = System.system_time(:millisecond)
    random = :crypto.strong_rand_bytes(8) |> Base.encode16(case: :lower)
    "sop_s4_#{timestamp}_#{random}"
  end

  @doc """
  Create a generic SOP suggestion from summary text.
  """
  def create_generic_sop_suggestion(summary) do
    %{
      "title" => "Review and Action from Analysis",
      "category" => "operational",
      "priority" => "medium",
      "description" => "Review the following analysis and take appropriate action: #{summary}",
      "triggers" => ["analysis complete"],
      "actions" => [
        "Review analysis results",
        "Identify actionable items",
        "Implement recommended changes",
        "Monitor outcomes"
      ]
    }
  end

  @doc """
  Enrich episode with SOP context for future analysis.
  """
  def enrich_episode_with_sops(episode, sop_ids) do
    sop_metadata = %{
      "related_sops" => sop_ids,
      "sop_creation_timestamp" => DateTime.utc_now() |> DateTime.to_iso8601(),
      "sop_count" => length(sop_ids)
    }

    updated_metadata = Map.merge(episode.metadata, sop_metadata)
    %{episode | metadata: updated_metadata}
  end

  @doc """
  Get SOPs created from a specific episode.
  """
  def get_sops_for_episode(_episode_id) do
    # TODO: Implement when SOPEngine.list/0 is available
    # This would query the SOP store for SOPs with episode_id in metadata
    {:ok, []}
  end

  @doc """
  Validate SOP suggestion structure.
  """
  def validate_sop_suggestion(suggestion) do
    required_fields = ["title", "description", "actions"]

    missing_fields =
      Enum.filter(required_fields, fn field ->
        not Map.has_key?(suggestion, field) or is_nil(Map.get(suggestion, field))
      end)

    case missing_fields do
      [] -> :ok
      fields -> {:error, {:missing_fields, fields}}
    end
  end
end
