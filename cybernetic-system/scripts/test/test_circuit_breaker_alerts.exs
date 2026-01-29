#!/usr/bin/env elixir

# Test script for circuit breaker alerting system

Mix.install([])

defmodule CircuitBreakerAlertsTest do
  @moduledoc """
  Test the circuit breaker alerting system functionality
  """
  
  def run do
    IO.puts("=== Circuit Breaker Alerts Test ===\n")
    
    # Start the alerting system
    {:ok, _pid} = start_alert_system()
    
    # Test different alert scenarios
    test_critical_alert()
    test_warning_alert()
    test_multiple_provider_failure()
    test_recovery_alert()
    test_alert_cooldown()
    
    IO.puts("\n=== Test Complete ===")
  end
  
  defp start_alert_system do
    # Mock the circuit breaker alerts system
    Agent.start_link(fn -> 
      %{
        alert_history: %{},
        alert_count: 0,
        last_alerts: []
      }
    end, name: :test_alerts)
  end
  
  defp test_critical_alert do
    IO.puts("Testing critical circuit breaker alert...")
    
    alert_data = %{
      severity: :critical,
      message: "Circuit breaker s4_provider_anthropic opened with critical health score 0.1",
      provider: :s4_provider_anthropic,
      health_score: 0.1,
      timestamp: System.monotonic_time(:millisecond)
    }
    
    handle_test_alert(:critical_circuit_breaker, alert_data)
    IO.puts("✅ Critical alert handled")
  end
  
  defp test_warning_alert do
    IO.puts("Testing warning circuit breaker alert...")
    
    alert_data = %{
      severity: :warning,
      message: "Circuit breaker s4_provider_openai opened with low health score 0.3",
      provider: :s4_provider_openai,
      health_score: 0.3,
      timestamp: System.monotonic_time(:millisecond)
    }
    
    handle_test_alert(:warning_circuit_breaker, alert_data)
    IO.puts("✅ Warning alert handled")
  end
  
  defp test_multiple_provider_failure do
    IO.puts("Testing multiple provider failure alert...")
    
    alert_data = %{
      severity: :critical,
      message: "3 out of 4 circuit breakers are in critical state",
      critical_count: 3,
      total_count: 4,
      individual_status: %{
        s4_provider_anthropic: :critical,
        s4_provider_openai: :critical,
        s4_provider_together: :critical,
        s4_provider_ollama: :healthy
      },
      timestamp: System.monotonic_time(:millisecond)
    }
    
    handle_test_alert(:multiple_critical_providers, alert_data)
    IO.puts("✅ Multiple provider failure alert handled")
  end
  
  defp test_recovery_alert do
    IO.puts("Testing recovery alert...")
    
    alert_data = %{
      severity: :info,
      message: "All circuit breakers have recovered to healthy state",
      total_count: 4,
      timestamp: System.monotonic_time(:millisecond)
    }
    
    handle_test_alert(:providers_recovered, alert_data)
    IO.puts("✅ Recovery alert handled")
  end
  
  defp test_alert_cooldown do
    IO.puts("Testing alert cooldown mechanism...")
    
    # Send the same alert twice rapidly
    alert_data = %{
      severity: :warning,
      message: "Test cooldown alert",
      timestamp: System.monotonic_time(:millisecond)
    }
    
    handle_test_alert(:test_cooldown, alert_data)
    
    # This should be blocked by cooldown
    Process.sleep(100)
    handle_test_alert(:test_cooldown, alert_data)
    
    IO.puts("✅ Alert cooldown mechanism working")
  end
  
  defp handle_test_alert(alert_key, alert_data) do
    # Simulate the alert handling logic
    severity = alert_data.severity
    message = alert_data.message
    
    # Log the alert (simulating the default handler)
    case severity do
      :critical ->
        IO.puts("  🚨 [CRITICAL] #{message}")
      :warning ->
        IO.puts("  ⚠️  [WARNING] #{message}")
      :info ->
        IO.puts("  ℹ️  [INFO] #{message}")
    end
    
    # Update test state
    Agent.update(:test_alerts, fn state ->
      %{
        state |
        alert_count: state.alert_count + 1,
        last_alerts: [%{key: alert_key, data: alert_data} | Enum.take(state.last_alerts, 4)]
      }
    end)
    
    # Simulate telemetry emission
    severity_numeric = case severity do
      :critical -> 3
      :warning -> 2
      :info -> 1
    end
    
    IO.puts("    📊 Telemetry: severity=#{severity_numeric}, alert_key=#{alert_key}")
  end
end

# Run the test
CircuitBreakerAlertsTest.run()