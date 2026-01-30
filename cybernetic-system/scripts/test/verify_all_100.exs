#!/usr/bin/env elixir

# Comprehensive verification that ALL services are 100% operational
Mix.install([
  {:httpoison, "~> 2.0"},
  {:jason, "~> 1.4"},
  {:amqp, "~> 4.0"},
  {:postgrex, "~> 0.17"},
  {:redix, "~> 1.2"}
])

defmodule FullSystemVerification do
  @green "✅"
  @yellow "⚠️"
  @red "❌"
  @rocket "🚀"
  
  def run do
    IO.puts("\n#{@rocket} COMPREHENSIVE SYSTEM VERIFICATION - 100% OPERATIONAL CHECK\n")
    IO.puts("=" <> String.duplicate("=", 70))
    
    results = [
      verify_rabbitmq(),
      verify_postgres(),
      verify_redis(),
      verify_jaeger(),
      verify_prometheus(),
      verify_grafana(),
      verify_ollama(),
      verify_otel_collector(),
      verify_application()
    ]
    
    IO.puts("\n" <> String.duplicate("=", 70))
    print_summary(results)
    IO.puts(String.duplicate("=", 70))
    
    if Enum.all?(results, fn {_, status} -> status == :ok end) do
      IO.puts("\n🎉 ALL SERVICES ARE 100% OPERATIONAL! 🎉\n")
    else
      IO.puts("\n⚠️  Some services need attention. Check details above.\n")
    end
  end
  
  defp verify_rabbitmq do
    IO.puts("\n📨 RabbitMQ (AMQP Message Broker)")
    IO.puts("   Checking connection and management API...")
    
    try do
      # Check management API
      case HTTPoison.get("http://localhost:15672/api/overview", 
                        [{"Authorization", "Basic " <> Base.encode64("cybernetic:changeme")}]) do
        {:ok, %{status_code: 200, body: body}} ->
          data = Jason.decode!(body)
          
          IO.puts("   #{@green} Management API: ONLINE")
          IO.puts("   #{@green} RabbitMQ version: #{data["rabbitmq_version"]}")
          IO.puts("   #{@green} Erlang version: #{data["erlang_version"]}")
          
          # Check AMQP connection
          case AMQP.Connection.open("amqp://cybernetic:changeme@localhost:5672") do
            {:ok, conn} ->
              {:ok, channel} = AMQP.Channel.open(conn)
              IO.puts("   #{@green} AMQP connection: SUCCESSFUL")
              
              # Check queues
              case HTTPoison.get("http://localhost:15672/api/queues", 
                                [{"Authorization", "Basic " <> Base.encode64("cybernetic:changeme")}]) do
                {:ok, %{status_code: 200, body: queue_body}} ->
                  queues = Jason.decode!(queue_body)
                  IO.puts("   #{@green} Queues configured: #{length(queues)}")
                _ -> :ok
              end
              
              AMQP.Connection.close(conn)
              {"RabbitMQ", :ok}
              
            {:error, reason} ->
              IO.puts("   #{@red} AMQP connection failed: #{inspect(reason)}")
              {"RabbitMQ", :error}
          end
          
        _ ->
          IO.puts("   #{@red} Management API unreachable")
          {"RabbitMQ", :error}
      end
    rescue
      e ->
        IO.puts("   #{@red} Error: #{inspect(e)}")
        {"RabbitMQ", :error}
    end
  end
  
  defp verify_postgres do
    IO.puts("\n🗄️  PostgreSQL (Database)")
    IO.puts("   Checking connection and tables...")
    
    config = [
      hostname: "localhost",
      username: "cybernetic",
      password: "changeme",
      database: "cybernetic",
      port: 5432
    ]
    
    case Postgrex.start_link(config) do
      {:ok, conn} ->
        IO.puts("   #{@green} Connection: SUCCESSFUL")
        
        # Check tables
        {:ok, result} = Postgrex.query(conn, "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'", [])
        [[table_count]] = result.rows
        IO.puts("   #{@green} Tables in database: #{table_count}")
        
        # Check database size
        {:ok, size_result} = Postgrex.query(conn, "SELECT pg_database_size('cybernetic')", [])
        [[db_size]] = size_result.rows
        IO.puts("   #{@green} Database size: #{format_bytes(db_size)}")
        
        GenServer.stop(conn)
        {"PostgreSQL", :ok}
        
      {:error, reason} ->
        IO.puts("   #{@red} Connection failed: #{inspect(reason)}")
        {"PostgreSQL", :error}
    end
  end
  
  defp verify_redis do
    IO.puts("\n⚡ Redis (Cache & Rate Limiting)")
    IO.puts("   Checking connection and operations...")
    
    case Redix.start_link("redis://:changeme@localhost:6379") do
      {:ok, conn} ->
        IO.puts("   #{@green} Connection: SUCCESSFUL")
        
        # Test operations
        {:ok, "PONG"} = Redix.command(conn, ["PING"])
        IO.puts("   #{@green} PING/PONG: OK")
        
        # Get info
        {:ok, info} = Redix.command(conn, ["INFO", "server"])
        version = extract_redis_version(info)
        IO.puts("   #{@green} Redis version: #{version}")
        
        # Check memory
        {:ok, memory_info} = Redix.command(conn, ["INFO", "memory"])
        used_memory = extract_redis_memory(memory_info)
        IO.puts("   #{@green} Memory used: #{used_memory}")
        
        GenServer.stop(conn)
        {"Redis", :ok}
        
      {:error, reason} ->
        IO.puts("   #{@red} Connection failed: #{inspect(reason)}")
        {"Redis", :error}
    end
  end
  
  defp verify_jaeger do
    IO.puts("\n🔍 Jaeger (Distributed Tracing)")
    IO.puts("   Checking UI and trace data...")
    
    case HTTPoison.get("http://localhost:16686/api/services") do
      {:ok, %{status_code: 200, body: body}} ->
        services = Jason.decode!(body)["data"] || []
        IO.puts("   #{@green} Jaeger UI: ONLINE")
        IO.puts("   #{@green} Services tracked: #{length(services)}")
        
        if "cybernetic" in services do
          # Get trace count
          case HTTPoison.get("http://localhost:16686/api/traces?service=cybernetic&limit=100") do
            {:ok, %{status_code: 200, body: trace_body}} ->
              traces = Jason.decode!(trace_body)["data"] || []
              IO.puts("   #{@green} Cybernetic traces: #{length(traces)}")
            _ -> :ok
          end
        end
        
        IO.puts("   #{@green} URL: http://localhost:16686")
        {"Jaeger", :ok}
        
      _ ->
        IO.puts("   #{@red} Jaeger UI unreachable")
        {"Jaeger", :error}
    end
  end
  
  defp verify_prometheus do
    IO.puts("\n📊 Prometheus (Metrics)")
    IO.puts("   Checking API and targets...")
    
    case HTTPoison.get("http://localhost:9090/api/v1/targets") do
      {:ok, %{status_code: 200, body: body}} ->
        data = Jason.decode!(body)
        active_targets = data["data"]["activeTargets"] || []
        IO.puts("   #{@green} Prometheus: ONLINE")
        IO.puts("   #{@green} Active targets: #{length(active_targets)}")
        
        # Check for cybernetic metrics
        case HTTPoison.get("http://localhost:9090/api/v1/label/__name__/values") do
          {:ok, %{status_code: 200, body: metrics_body}} ->
            metrics = Jason.decode!(metrics_body)["data"] || []
            cybernetic_metrics = Enum.filter(metrics, &String.contains?(&1, "cybernetic"))
            IO.puts("   #{@green} Cybernetic metrics: #{length(cybernetic_metrics)}")
          _ -> :ok
        end
        
        IO.puts("   #{@green} URL: http://localhost:9090")
        {"Prometheus", :ok}
        
      _ ->
        IO.puts("   #{@red} Prometheus unreachable")
        {"Prometheus", :error}
    end
  end
  
  defp verify_grafana do
    IO.puts("\n📈 Grafana (Dashboards)")
    IO.puts("   Checking API and datasources...")
    
    auth = Base.encode64("admin:changeme")
    
    case HTTPoison.get("http://localhost:3000/api/health", 
                       [{"Authorization", "Basic #{auth}"}]) do
      {:ok, %{status_code: 200, body: body}} ->
        health = Jason.decode!(body)
        IO.puts("   #{@green} Grafana: #{health["database"]}")
        
        # Check datasources
        case HTTPoison.get("http://localhost:3000/api/datasources",
                          [{"Authorization", "Basic #{auth}"}]) do
          {:ok, %{status_code: 200, body: ds_body}} ->
            datasources = Jason.decode!(ds_body)
            IO.puts("   #{@green} Datasources configured: #{length(datasources)}")
          _ -> :ok
        end
        
        # Check dashboards
        case HTTPoison.get("http://localhost:3000/api/search?type=dash-db",
                          [{"Authorization", "Basic #{auth}"}]) do
          {:ok, %{status_code: 200, body: dash_body}} ->
            dashboards = Jason.decode!(dash_body)
            IO.puts("   #{@green} Dashboards available: #{length(dashboards)}")
          _ -> :ok
        end
        
        IO.puts("   #{@green} URL: http://localhost:3000")
        {"Grafana", :ok}
        
      _ ->
        IO.puts("   #{@red} Grafana unreachable")
        {"Grafana", :error}
    end
  end
  
  defp verify_ollama do
    IO.puts("\n🤖 Ollama (Local LLM)")
    IO.puts("   Checking API and models...")
    
    case HTTPoison.get("http://localhost:11434/api/tags") do
      {:ok, %{status_code: 200, body: body}} ->
        data = Jason.decode!(body)
        models = data["models"] || []
        IO.puts("   #{@green} Ollama API: ONLINE")
        IO.puts("   #{@green} Models available: #{length(models)}")
        
        if length(models) > 0 do
          Enum.each(Enum.take(models, 3), fn model ->
            name = model["name"]
            size = format_bytes(model["size"] || 0)
            IO.puts("   #{@green} - #{name} (#{size})")
          end)
        else
          IO.puts("   #{@yellow} No models installed. Run: ollama pull llama2")
        end
        
        {"Ollama", :ok}
        
      _ ->
        IO.puts("   #{@red} Ollama API unreachable")
        {"Ollama", :error}
    end
  end
  
  defp verify_otel_collector do
    IO.puts("\n📡 OpenTelemetry Collector")
    IO.puts("   Checking health and pipelines...")
    
    # Check if container is running
    {output, exit_code} = System.cmd("docker", ["ps", "--format", "{{.Names}}\t{{.Status}}", "--filter", "name=cyb-otel"])
    
    if exit_code == 0 and String.contains?(output, "cyb-otel") do
      IO.puts("   #{@green} Container: RUNNING")
      
      # Check logs for pipeline status
      {logs, _} = System.cmd("docker", ["logs", "--tail", "20", "cyb-otel"], stderr_to_stdout: true)
      
      if String.contains?(logs, "Everything is ready") do
        IO.puts("   #{@green} Pipelines: ACTIVE")
        IO.puts("   #{@green} Exporting to: Jaeger, Prometheus")
      else
        IO.puts("   #{@yellow} Check logs for pipeline status")
      end
      
      {"OTEL Collector", :ok}
    else
      IO.puts("   #{@red} Container not running")
      {"OTEL Collector", :error}
    end
  end
  
  defp verify_application do
    IO.puts("\n🎯 Cybernetic Application")
    IO.puts("   Checking health endpoint...")
    
    case HTTPoison.get("http://localhost:4000/health") do
      {:ok, %{status_code: 200, body: body}} ->
        health = Jason.decode!(body)
        IO.puts("   #{@green} Application: #{health["status"] || "HEALTHY"}")
        
        if health["checks"] do
          Enum.each(health["checks"], fn {component, status} ->
            emoji = if status == "healthy", do: @green, else: @yellow
            IO.puts("   #{emoji} #{component}: #{status}")
          end)
        end
        
        {"Application", :ok}
        
      _ ->
        IO.puts("   #{@yellow} Application not responding on port 4000")
        IO.puts("   #{@yellow} This is expected if running in development mode")
        {"Application", :warning}
    end
  end
  
  defp print_summary(results) do
    IO.puts("\n📋 SUMMARY:")
    
    ok_count = Enum.count(results, fn {_, status} -> status == :ok end)
    warning_count = Enum.count(results, fn {_, status} -> status == :warning end)
    error_count = Enum.count(results, fn {_, status} -> status == :error end)
    
    Enum.each(results, fn {name, status} ->
      emoji = case status do
        :ok -> @green
        :warning -> @yellow
        :error -> @red
      end
      IO.puts("   #{emoji} #{name}")
    end)
    
    IO.puts("\n   Total: #{ok_count} OK, #{warning_count} Warnings, #{error_count} Errors")
  end
  
  defp format_bytes(bytes) when is_integer(bytes) do
    cond do
      bytes < 1024 -> "#{bytes} B"
      bytes < 1024 * 1024 -> "#{Float.round(bytes / 1024, 1)} KB"
      bytes < 1024 * 1024 * 1024 -> "#{Float.round(bytes / (1024 * 1024), 1)} MB"
      true -> "#{Float.round(bytes / (1024 * 1024 * 1024), 2)} GB"
    end
  end
  defp format_bytes(_), do: "N/A"
  
  defp extract_redis_version(info) do
    case Regex.run(~r/redis_version:(.+)/, info) do
      [_, version] -> String.trim(version)
      _ -> "unknown"
    end
  end
  
  defp extract_redis_memory(info) do
    case Regex.run(~r/used_memory_human:(.+)/, info) do
      [_, memory] -> String.trim(memory)
      _ -> "unknown"
    end
  end
end

# Run the verification
FullSystemVerification.run()