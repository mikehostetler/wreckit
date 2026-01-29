import os
import requests
import json

code = \"\"\"defmodule Cybernetic.VSM.System4.LLM.Pipeline.Steps.PromptTemplate do
  @moduledoc """
  Normalize messages and apply templating if needed.

  Converts Episode structs and other formats to normalized message format.
  """

  require Logger

  @doc """
  Normalize messages for LLM consumption.
  """
  def run(%{episode: episode} = ctx) when not is_nil(episode) do
    # Convert Episode to messages format
    messages = episode_to_messages(episode)
    {:ok, Map.put(ctx, :messages, messages)}
  end

  def run(%{messages: messages} = ctx) when is_list(messages) do
    # Normalize existing messages
    normalized = normalize_messages(messages)
    {:ok, Map.put(ctx, :messages, normalized)}
  end

  def run(%{prompt: prompt} = ctx) when is_binary(prompt) do
    # Simple prompt to messages
    messages = [%{role: "user", content: prompt}]
    {:ok, Map.put(ctx, :messages, messages)}
  end

  def run(ctx) do
    # No messages to process
    Logger.warning("PromptTemplate: No messages to process")
    {:ok, ctx}
  end

  defp episode_to_messages(episode) do
    # Convert Episode struct to message format
    system_prompt = build_system_prompt(episode)
    user_content = build_user_content(episode)

    # Start with system prompt
    base_messages = [%{role: "system", content: system_prompt}]

    # Add historical context messages if they exist
    context_messages = episode.context[:messages] || []

    # Build final message list: system → context → current user message
    base_messages ++ context_messages ++ [%{role: "user", content: user_content}]
  end

  defp build_system_prompt(episode) do
    load_template("system_analysis.md", [
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

    load_template("user_analysis.md", [
      {"data", data_str},
      {"source_system", to_string(episode.source_system)},
      {"created_at", to_string(episode.created_at)},
      {"metadata", metadata_str}
    ])
  end

  defp load_template(filename, bindings) do
    path = Path.join(:code.priv_dir(:cybernetic), "prompts/#{filename}")

    case File.read(path) do
      {:ok, content} ->
        Enum.reduce(bindings, content, fn {key, value}, acc ->
          String.replace(acc, "{{#{key}}}", to_string(value))
        end)

      {:error, reason} ->
        Logger.error("Failed to load prompt template #{filename}: #{inspect(reason)}")
        "Error loading prompt template. Bindings: #{inspect(bindings)}"
    end
  end

  defp normalize_messages(messages) do
    Enum.map(messages, &normalize_message/1)
  end

  defp normalize_message(%{role: role, content: content} = msg) do
    %{
      role: to_string(role),
      content: to_string(content)
    }
    |> maybe_add_name(msg)
  end

  defp normalize_message(%{"role" => role, "content" => content} = msg) do
    %{
      role: to_string(role),
      content: to_string(content)
    }
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
end\"\"\"
prompt = f\"\"\"You are a Senior Elixir Architect. Refactor the following code to use a simple ETS-based cache for templates and provide a hardcoded fallback prompt. Output ONLY the code, no explanation, no markdown JSON wrapper, just the raw Elixir code.

CODE:
{code}\"\"\"

# Using direct Anthropic API via Z.AI
headers = {
    "Content-Type": "application/json",
    "x-api-key": "1cd54a1d237e4693b516a56e8513366a.1r4gXJRbfYp0Nw52",
    "anthropic-version": "2023-06-01"
}

payload = {
    "model": "glm-4.7",
    "max_tokens": 4096,
    "messages": [{"role": "user", "content": prompt}]
}

response = requests.post("https://api.z.ai/api/anthropic/v1/messages", json=payload, headers=headers)
print(response.json()['content'][0]['text'])
