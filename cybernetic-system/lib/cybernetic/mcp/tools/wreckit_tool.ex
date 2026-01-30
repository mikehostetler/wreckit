defmodule Cybernetic.MCP.Tools.WreckitTool do
  @moduledoc """
  MCP Tool bridge to the Wreckit autonomous builder.
  Allows the Mind (S4) to use the Hand (Wreckit) to modify the codebase.
  """
  @behaviour Cybernetic.MCP.Tool
  require Logger

  @tool_info %{
    name: "wreckit",
    version: "1.0.0",
    description: "The autonomous builder. Use this to research, plan, or implement code changes.",
    operations: [
      %{
        name: "execute",
        description: "Execute a wreckit command (research, plan, implement, run)",
        parameters: %{
          "command" => "The wreckit command to run",
          "item_id" => "The ID of the item to work on",
          "args" => "Additional arguments for the command"
        },
        required: ["command", "item_id"]
      }
    ]
  }

  @impl true
  def info, do: @tool_info

  @impl true
  def execute("execute", params, context) do
    command = params["command"]
    item_id = params["item_id"]
    args = params["args"] || ""
    
    Logger.info("WreckitTool: Executing '#{command}' on item '#{item_id}' for #{context.actor}")

    cmd = "bun"
    
    # Base arguments for the bun runner
    cli_base = ["run", "dist/index.js", command, item_id, "--cwd", "cybernetic-system", "--agent", "rlm"]
    
    # Use -- to protect any following arguments
    final_args = if args != "" do
      cli_base ++ ["--"] ++ String.split(args)
    else
      cli_base
    end
    
    case System.cmd(cmd, final_args, cd: "..", stderr_to_stdout: true) do
      {output, 0} ->
        {:ok, %{
          status: "success",
          command: command,
          item_id: item_id,
          output: output
        }}
      {output, _exit_code} ->
        {:error, "Wreckit failed: #{output}"}
    end
  end
end
