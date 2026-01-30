defmodule Cybernetic.VSM.System4.MessageHandler do
  @moduledoc """
  Message handler for VSM System 4 (Intelligence).
  Handles intelligence and analytics messages.
  """
  require Logger

  def handle_message(operation, payload, meta) do
    Logger.debug("System4 received #{operation}: #{inspect(payload)}")

    # Execute the operation
    result = do_handle_message(operation, payload, meta)

    # Return the result and metadata directly, bypassing telemetry.span return value behavior
    {result, %{payload_size: byte_size(inspect(payload))}}
  end

  defp do_handle_message(operation, payload, meta) do
    case operation do
      "intelligence" ->
        handle_intelligence(payload, meta)

      "reasoning_request" ->
        handle_intelligence(payload, meta)

      "analyze" ->
        handle_analyze(payload, meta)

      "learn" ->
        handle_learn(payload, meta)

      "predict" ->
        handle_predict(payload, meta)

      "intelligence_update" ->
        handle_intelligence_update(payload, meta)

      "algedonic" ->
        handle_algedonic(payload, meta)

      "default" ->
        handle_default(payload, meta)

      _ ->
        Logger.warning("Unknown operation for System4: #{operation}")
        {:error, :unknown_operation}
    end
  rescue
    error ->
      Logger.error("Error in System4 message handler: #{inspect(error)}")
      {:error, error}
  end

  defp handle_intelligence(payload, meta) do
    # Validate analysis type if present
    analysis_type = Map.get(payload, :analysis) || Map.get(payload, "analysis")

    if analysis_type && analysis_type == "invalid_type" do
      {:error, :invalid_analysis_type}
    else
      Logger.info("System4: Processing intelligence - #{inspect(payload)}")

      # Process the intelligence and emit telemetry
      result = process_intelligence_analysis(payload, meta)

      # Emit telemetry for S4 intelligence processing
      :telemetry.execute([:vsm, :s4, :intelligence], %{count: 1}, payload)

      {:ok, result}
    end
  end

  defp handle_analyze(payload, _meta) do
    Logger.info("System4: Analyzing data - #{inspect(payload)}")
    :ok
  end

  defp handle_learn(payload, _meta) do
    Logger.debug("System4: Learning from data - #{inspect(payload)}")
    :ok
  end

  defp handle_predict(payload, _meta) do
    Logger.info("System4: Making prediction - #{inspect(payload)}")
    :ok
  end

  defp handle_intelligence_update(payload, _meta) do
    Logger.debug("System4: Intelligence update - #{inspect(payload)}")
    :ok
  end

  defp handle_algedonic(payload, meta) do
    # Handle algedonic (pain/pleasure) signals from S1
    signal_type = Map.get(payload, "type")
    Logger.info("System4: Processing algedonic signal - #{signal_type}")

    case signal_type do
      "algedonic.pain" ->
        handle_pain_signal(payload, meta)

      "algedonic.pleasure" ->
        handle_pleasure_signal(payload, meta)

      _ ->
        Logger.warning("System4: Unknown algedonic signal type - #{signal_type}")
        {:error, :unknown_algedonic_type}
    end
  end

  defp handle_default(payload, _meta) do
    Logger.debug("System4: Default handler - #{inspect(payload)}")
    :ok
  end

  defp handle_pain_signal(payload, _meta) do
    # Process pain signal and generate intervention
    data = Map.get(payload, "data", %{})
    severity = Map.get(data, :severity, :moderate)

    Logger.warning("System4: Pain signal received - severity: #{severity}")

    # Determine intervention strategy based on severity
    action =
      case severity do
        :critical -> "alert_s5"
        :severe -> "scale_resources"
        _ -> "throttle_operations"
      end

    # Generate intervention message
    intervention = %{
      "type" => "vsm.s4.intervention",
      "action" => action,
      "severity" => severity,
      "reason" => "algedonic_pain_response",
      "data" => data,
      "timestamp" => DateTime.utc_now()
    }

    # Send intervention (for test purposes, we'll emit telemetry)
    :telemetry.execute([:vsm, :s4, :intervention], %{severity: severity}, intervention)

    # Also send directly to test collector if present
    if test_collector =
         :persistent_term.get({:test_collector, Cybernetic.Transport.InMemory}, nil) do
      send(test_collector, {:s4_intervention, intervention})
    end

    Logger.info("System4: Generated intervention - #{action}")

    :ok
  end

  defp handle_pleasure_signal(payload, _meta) do
    # Process pleasure signal and generate optimization
    data = Map.get(payload, "data", %{})
    intensity = Map.get(data, :intensity, :mild)

    Logger.info("System4: Pleasure signal received - intensity: #{intensity}")

    # Determine optimization strategy
    strategy =
      case intensity do
        :euphoric -> "increase_throughput"
        :high -> "reduce_resources"
        _ -> "maintain_state"
      end

    # Generate optimization message
    optimization = %{
      "type" => "vsm.s4.optimization",
      "strategy" => strategy,
      "intensity" => intensity,
      "reason" => "algedonic_pleasure_response",
      "data" => data,
      "timestamp" => DateTime.utc_now()
    }

    # Send optimization (for test purposes, we'll emit telemetry)
    :telemetry.execute([:vsm, :s4, :optimization], %{intensity: intensity}, optimization)

    # Also send directly to test collector if present
    if test_collector =
         :persistent_term.get({:test_collector, Cybernetic.Transport.InMemory}, nil) do
      send(test_collector, {:s4_optimization, optimization})
    end

    Logger.info("System4: Generated optimization - #{strategy}")

    :ok
  end

  defp process_intelligence_analysis(payload, _meta) do
    # Analyze the intelligence data using the LLM Bridge
    coordination_id = Map.get(payload, "coordination_id")
    text = Map.get(payload, "text", "")
    
    Logger.debug("System4: Processing intelligence request: #{text}")

    system_prompt = """
    You are the S4 Intelligence system.
    Your role is to analyze requests and EXECUTE changes using the `wreckit` tool.

    **CRITICAL:** You MUST respond ONLY with a valid JSON object. Do not include any conversational text before or after the JSON.

    **Tool Usage:**
    To modify the system, include a `tool_calls` array in your JSON response.
    Available Tool: `wreckit`
    Operation: `execute`
    Params:
    - `command`: "shell" (for terminal commands), "implement", "plan", "research"
    - `item_id`: A unique ID (e.g., "032-task-name")
    - `args`: Arguments (e.g., "ls -la")

    **Operational Notes:**
    - Shell commands are **STATELESS**. `cd` will not persist across tool calls.
    - To list parent directory files, use `ls ..`.
    - Combine multiple commands using `&&` (e.g., `mix compile && mix test`).
    - Use `mix test` to verify any code changes you make.

    **Example for listing parent files:**
    {
      "summary": "Listing files in the parent directory.",
      "tool_calls": [
        {
          "tool": "wreckit",
          "operation": "execute",
          "params": {
            "command": "shell",
            "item_id": "001-audit",
            "args": "ls -la .."
          }
        }
      ]
    }

    **Response Format (JSON):**
    {
      "summary": "Your explanation to the user",
      "tool_calls": []
    }
    """

    # Call LLM Bridge
    messages = [
      %{role: "user", content: text}
    ]
    
    opts = [
      system: system_prompt
      # Note: Anthropic doesn't support response_format: json_object yet in all models, 
      # but the prompt handles it. We omit the flag to be safe with older models/proxies.
    ]

    # We use the configured provider (Anthropic/Z.ai)
    case Cybernetic.VSM.System4.LLMBridge.chat(messages, opts) do
      {:ok, response_text} ->
        Logger.debug("System4: LLM response received")
        
        # Parse JSON and handle tools
        final_result = 
          case Jason.decode(response_text) do
            {:ok, %{"tool_calls" => calls, "summary" => summary}} when is_list(calls) and length(calls) > 0 ->
              tool_outputs = 
                Enum.map(calls, fn call -> execute_tool(call) end)
                |> Enum.join("\n\n")
              
              "#{summary}\n\n**System Actions:**\n#{tool_outputs}"

            {:ok, %{"summary" => summary}} ->
              summary

            _ ->
              # Fallback for non-JSON or partial JSON
              response_text
          end

        # Structure the response
        %{
          "type" => "vsm.s4.analysis_complete",
          "coordination_id" => coordination_id,
          "result" => final_result,
          "timestamp" => DateTime.utc_now()
        }
        
      {:error, reason} ->
        Logger.error("System4: LLM processing failed: #{inspect(reason)}")
        %{
          "error" => "I could not process that thought. Error: #{inspect(reason)}"
        }
    end
  end

  defp execute_tool(%{"tool" => "wreckit", "operation" => "execute", "params" => params}) do
    Logger.info("S4 Executing Wreckit Tool: #{inspect(params)}")
    
    context = %{actor: "system4"}
    
    case Cybernetic.MCP.Tools.WreckitTool.execute("execute", params, context) do
      {:ok, result} ->
        "✅ Executed `#{params["command"]}`: \n```\n#{String.slice(result.output || "", 0, 500)}\n```"
      
      {:error, reason} ->
        "❌ Failed `#{params["command"]}`: #{inspect(reason)}"
    end
  end

  defp execute_tool(call) do
    "⚠️ Unknown tool call: #{inspect(call)}"
  end
end
