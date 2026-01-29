defmodule Mix.Tasks.Cyb.Evolve do
  @moduledoc """
  Autonomously evolves a source file using the System 4 Intelligence Layer.
  """
  use Mix.Task
  require Logger

  @shortdoc "Autonomously refactors a file using AI"

  def run(args) do
    # Ensure dependencies are started
    Application.ensure_all_started(:req)
    Application.ensure_all_started(:jason)

    {opts, argv} = OptionParser.parse!(args, strict: [goal: :string, model: :string])

    case argv do
      [file_path] ->
        evolve_file(file_path, opts)

      _ ->
        Mix.raise("Usage: mix cyb.evolve <file_path> [--goal <string>]")
    end
  end

  defp evolve_file(file_path, opts) do
    unless File.exists?(file_path) do
      Mix.raise("File not found: #{file_path}")
    end

    Mix.shell().info([:green, "🧬 Evolving DNA: ", :reset, file_path])

    original_code = File.read!(file_path)
    goal = opts[:goal] || "Refactor for robustness, performance, and readability. Use best practices."
    
    # Generate new code
    refactored_code = request_evolution(original_code, goal, opts)

    # Validate syntax (basic compilation check)
    case validate_syntax(refactored_code) do
      :ok ->
        backup_path = "#{file_path}.bak"
        File.write!(backup_path, original_code)
        File.write!(file_path, refactored_code)
        
        Mix.shell().info([:green, "✅ Evolution Successful!", :reset])
        Mix.shell().info("Original backed up to: #{backup_path}")
        
      {:error, reason} ->
        Mix.shell().error("❌ Evolution Failed Syntax Check")
        Mix.shell().error(reason)
        # Maybe dump the failed code for inspection
        File.write!("#{file_path}.failed", refactored_code)
        Mix.shell().info("Failed code saved to: #{file_path}.failed")
    end
  end

  defp request_evolution(code, goal, _opts) do
    base_url = System.get_env("ANTHROPIC_BASE_URL") || "https://api.z.ai/api/anthropic"
    url = "#{base_url}/v1/messages"
    api_key = System.get_env("ANTHROPIC_API_KEY") || "1cd54a1d237e4693b516a56e8513366a.1r4gXJRbfYp0Nw52"
    model = System.get_env("ANTHROPIC_MODEL") || "glm-4.7"

    prompt = """
You are a Senior Elixir Architect and Cybernetic System Optimizer.

GOAL: #{goal}

INSTRUCTIONS:
1. Analyze the provided Elixir code.
2. Refactor it to meet the goal.
3. Maintain existing public API contract (function names/arity).
4. Improve error handling and efficiency.
5. Output ONLY the raw Elixir code. Do not use markdown backticks (```).

CODE:
#{code}
"""

    headers = [
      {"x-api-key", api_key},
      {"anthropic-version", "2023-06-01"},
      {"content-type", "application/json"}
    ]

    payload = %{
      "model" => model,
      "max_tokens" => 4096,
      "messages" => [
        %{"role" => "user", "content" => prompt}
      ]
    }

    Mix.shell().info("Consulting Intelligence (Z.AI)...")

    # Use Req directly (proven to work with Z.AI)
    case Req.post(url, headers: headers, json: payload, receive_timeout: 60_000) do
      {:ok, %{status: 200, body: body}} ->
        case body do
          %{"content" => [%{"text" => text} | _]} ->
            clean_code(text)
          
          other ->
            Mix.raise("Unexpected API response format: #{inspect(other)}")
        end

      {:ok, %{status: code, body: body}} ->
        Mix.raise("API Error #{code}: #{inspect(body)}")

      {:error, reason} ->
        Mix.raise("HTTP Request Failed: #{inspect(reason)}")
    end
  end

  defp clean_code(text) do
    text
    |> String.replace(~r/^```elixir\n/, "")
    |> String.replace(~r/^```\n/, "")
    |> String.replace(~r/\n```$/, "")
    |> String.trim()
  end

  defp validate_syntax(code) do
    try do
      Code.string_to_quoted!(code)
      :ok
    rescue
      e -> {:error, Exception.message(e)}
    end
  end
end