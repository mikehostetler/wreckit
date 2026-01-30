defmodule Cybernetic.VSM.System4.Episode do
  @moduledoc """
  Episode data structure for S4 Intelligence analysis.

  Episodes represent discrete units of work that require AI analysis,
  categorized by kind to enable intelligent provider routing.
  """

  defstruct [
    :id,
    :kind,
    :title,
    :context,
    :data,
    :metadata,
    :priority,
    :created_at,
    :source_system
  ]

  @type kind ::
          :policy_review
          | :root_cause
          | :code_gen
          | :anomaly_detection
          | :compliance_check
          | :optimization
          | :prediction
          | :classification

  @type t :: %__MODULE__{
          id: String.t(),
          kind: kind(),
          title: String.t(),
          context: map(),
          data: any(),
          metadata: map(),
          priority: :low | :normal | :high | :critical,
          created_at: DateTime.t(),
          source_system: atom()
        }

  @doc """
  Create a new episode with generated ID and timestamp.
  """
  def new(kind, title, data, opts \\ []) do
    %__MODULE__{
      id: generate_id(),
      kind: kind,
      title: title,
      context: Keyword.get(opts, :context, %{}),
      data: data,
      metadata: Keyword.get(opts, :metadata, %{}),
      priority: Keyword.get(opts, :priority, :normal),
      created_at: DateTime.utc_now(),
      source_system: Keyword.get(opts, :source_system, :unknown)
    }
  end

  @doc """
  Generate a unique episode ID.
  """
  def generate_id do
    :crypto.strong_rand_bytes(16)
    |> Base.encode16(case: :lower)
  end

  @doc """
  Convert episode to a prompt-friendly format.
  """
  def to_prompt(%__MODULE__{} = episode) do
    """
    Episode Analysis Request

    ID: #{episode.id}
    Kind: #{episode.kind}
    Title: #{episode.title}
    Priority: #{episode.priority}
    Source: #{episode.source_system}

    Context:
    #{format_context(episode.context)}

    Data:
    #{format_data(episode.data)}

    Metadata:
    #{format_metadata(episode.metadata)}
    """
  end

  defp format_context(context) when is_map(context) do
    context
    |> Enum.map(fn {k, v} -> "  #{k}: #{inspect(v)}" end)
    |> Enum.join("\n")
  end

  defp format_data(data) when is_binary(data), do: data
  defp format_data(data), do: inspect(data, pretty: true, limit: :infinity)

  defp format_metadata(metadata) when is_map(metadata) do
    metadata
    |> Enum.map(fn {k, v} -> "  #{k}: #{inspect(v)}" end)
    |> Enum.join("\n")
  end
end
