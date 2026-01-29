defmodule Mix.Tasks.Cyb.Doctor do
  @moduledoc """
  Autonomously diagnoses and treats the codebase using System 4 Intelligence.

  Usage:
      mix cyb.doctor

  This task:
  1. Runs static analysis (Credo).
  2. Identifies the "sickest" file (highest technical debt).
  3. Triggers `mix cyb.evolve` to cure it.
  """
  use Mix.Task
  require Logger

  @shortdoc "Diagnoses and treats codebase issues"

  def run(_args) do
    # Ensure dependencies
    Application.ensure_all_started(:jason)

    Mix.shell().info([:green, "🩺 Cybernetic Doctor is scanning...", :reset])

    # Run Credo
    case System.cmd("mix", ["credo", "--format", "json", "--strict"], stderr_to_stdout: true) do
      {output, _exit_code} ->
        # Credo returns non-zero exit code if issues found, which is what we want
        process_credo_output(output)
    end
  end

  defp process_credo_output(output) do
    # Find the JSON part (skip any compilation noise)
    case extract_json(output) do
      {:ok, %{"issues" => issues}} when issues != [] ->
        treat_patient(issues)
      _ ->
        Mix.shell().info([:green, "✅ Patient is healthy! No critical issues found.", :reset])
    end
  end

  defp extract_json(output) do
    # Try to find the start of the JSON array/object
    case :binary.match(output, "{") do
      {pos, _} ->
        json_part = binary_part(output, pos, byte_size(output) - pos)
        Jason.decode(json_part)
      :nomatch ->
        :error
    end
  end

  defp treat_patient(issues) do
    # Group by file
    grouped = Enum.group_by(issues, fn i -> i["filename"] end)

    # Find worst file
    {filename, file_issues} = 
      grouped
      |> Enum.max_by(fn {_f, issues} -> length(issues) end)

    issue_count = length(file_issues)
    
    Mix.shell().info([:red, "🤒 Sickest patient identified: ", :reset, filename])
    Mix.shell().info("Symptoms (#{issue_count}):")
    
    Enum.each(Enum.take(file_issues, 3), fn issue ->
      Mix.shell().info(" - [#{issue["category"]}] #{issue["message"]}")
    end)
    if issue_count > 3, do: Mix.shell().info(" - ... and #{issue_count - 3} more.")

    # Formulate a prescription (Goal)
    prescription = 
      file_issues
      |> Enum.map(fn i -> "- #{i["message"]} (Line #{i["line_no"]})" end)
      |> Enum.join("\n")
    
    goal = "Fix the following static analysis issues:\n#{prescription}\n\nRefactor for readability and idiomatic Elixir."

    Mix.shell().info([:green, "💊 Administering treatment (Evolution)...", :reset])
    
    # Trigger Evolution
    Mix.Task.run("cyb.evolve", [filename, "--goal", goal])
  end
end
