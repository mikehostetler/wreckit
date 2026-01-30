defmodule Cybernetic.VSM.System4.LLM.Pipeline.Steps.PromptTemplate do
  @moduledoc """
  Normalize messages and apply templating if needed.

  Converts Episode structs and other formats to normalized message format.
  Uses ETS table :cybernetic_prompts for caching templates.
  """

  require Logger

  @table_name :cybernetic_prompts

  @system_analysis_fallback """
  You are a sophisticated AI model tasked with analysis.
  Analysis Type: {{kind}}
  Priority Level: {{priority}}
  
  Please analyze the provided data with high precision.
  """

  @user_analysis_fallback """
  Please process the following information:
  
  Source System: {{source_system}}
  Timestamp: {{created_at}}
  
  Data Content:
  {{data}}
  
  {{metadata}}
  
  Provide a comprehensive evaluation based on the parameters above.
  """

  def init do
    case :ets.whereis(@table_name) do
      :undefined ->
        :ets.new(@table_name, [:named_table, :public, read_concurrency: true])
      _ref ->
        :ok
    end
  end

  @doc """
  Normalize messages for LLM consumption.
  """
  def run(%{episode: episode} = ctx) when not is_nil(episode) do
    messages = episode_to_messages(episode)
    {:ok, Map.put(ctx, :messages, messages)}
  end

  def run(%{messages: messages} = ctx) when is_list(messages) do
    normalized = normalize_messages(messages)
    {:ok, Map.put(ctx, :messages, normalized)}
  end

  def run(%{prompt: prompt} = ctx) when is_binary(prompt) do
    messages = [%{role: "user", content: prompt}]
    {:ok, Map.put(ctx, :messages, messages)}
  end

  def run(ctx) do
    Logger.warning("PromptTemplate: No messages to process")
    {:ok, ctx}
  end

  defp episode_to_messages(episode) do
    system_prompt = build_system_prompt(episode)
    user_content = build_user_content(episode)

    base_messages = [%{role: "system", content: system_prompt}]
    context_messages = episode.context[:messages] || []

    base_messages ++ context_messages ++ [%{role: "user", content: user_content}]
  end

  defp build_system_prompt(episode) do
    load_template("system_analysis.md", @system_analysis_fallback, [
      {"kind", to_string(episode.kind)},
      {"priority", to_string(episode.priority)}
    ])
  end

  defp build_user_content(episode) do
    data_str =
      case episode.data do
        data when is_binary(data) -> data
        data -> inspect(data)
      end

    metadata_str =
      if episode.metadata do
        "- Metadata: #{inspect(episode.metadata)}"
      else
        ""
      end

    load_template("user_analysis.md", @user_analysis_fallback, [
      {"data", data_str},
      {"source_system", to_string(episode.source_system)},
      {"created_at", to_string(episode.created_at)},
      {"metadata", metadata_str}
    ])
  end

  defp load_template(filename, fallback, bindings) do
    content = get_cached_content(filename, fallback)
    apply_bindings(content, bindings)
  end

  defp get_cached_content(filename, fallback) do
    ensure_table_exists()
    case :ets.lookup(@table_name, filename) do
      [{^filename, content}] -> content
      [] ->
        content = read_from_disk(filename, fallback)
        :ets.insert(@table_name, {filename, content})
        content
    end
  end

  defp ensure_table_exists do
    if :ets.whereis(@table_name) == :undefined do
      :ets.new(@table_name, [:named_table, :public, :set, read_concurrency: true])
    end
  end

  defp read_from_disk(filename, fallback) do
    path = Path.join(:code.priv_dir(:cybernetic), "prompts/#{filename}")

    case File.read(path) do
      {:ok, content} ->
        content
      {:error, _reason} ->
        Logger.warning("Failed to load prompt template #{filename} from disk, using fallback.")
        fallback
    end
  end

  defp apply_bindings(content, bindings) do
    Enum.reduce(bindings, content, fn {key, value}, acc ->
      String.replace(acc, "{{#{key}}}", to_string(value))
    end)
  end

  defp normalize_messages(messages) do
    Enum.map(messages, &normalize_message/1)
  end

  defp normalize_message(%{role: role, content: content} = msg) do
    %{role: to_string(role), content: to_string(content)}
    |> maybe_add_name(msg)
  end

  defp normalize_message(%{"role" => role, "content" => content} = msg) do
    %{role: to_string(role), content: to_string(content)}
    |> maybe_add_name(msg)
  end

  defp normalize_message(msg) when is_map(msg) do
    %{
      role: to_string(msg[:role] || msg["role"] || "user"),
      content: to_string(msg[:content] || msg["content"] || "")
    }
  end

  defp maybe_add_name(normalized, original) do
    case original[:name] || original["name"] do
      nil -> normalized
      name -> Map.put(normalized, :name, to_string(name))
    end
  end
end
