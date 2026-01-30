defmodule Cybernetic.Content.Pipeline.Ingest do
  @moduledoc """
  Content Ingest Pipeline for processing external content into semantic containers.

  Pipeline stages:
  1. Fetch - Retrieve content from source (HTTP, S3, file)
  2. Normalize - Clean and standardize format
  3. Extract - Extract metadata and entities
  4. Embed - Generate vector embeddings via ReqLLM
  5. Containerize - Wrap in SemanticContainer
  6. Index - Add to HNSW for search

  Supports:
  - Batch processing for multiple items
  - Async processing via Oban jobs
  - Progress tracking and telemetry
  - Retry with exponential backoff
  """

  use GenServer
  require Logger

  alias Cybernetic.Content.SemanticContainer
  alias Cybernetic.Security.SSRF

  # Types
  @type source :: %{
          url: String.t() | nil,
          path: String.t() | nil,
          content: binary() | nil,
          content_type: String.t() | nil
        }

  @type pipeline_result :: %{
          id: String.t(),
          status: :success | :failed | :skipped,
          container_id: String.t() | nil,
          bytes_ingested: non_neg_integer(),
          error: term() | nil,
          duration_ms: non_neg_integer()
        }

  @type job :: %{
          id: String.t(),
          source: source(),
          tenant_id: String.t(),
          options: keyword(),
          status: :pending | :processing | :completed | :failed,
          result: pipeline_result() | nil,
          created_at: DateTime.t(),
          started_at: DateTime.t() | nil,
          completed_at: DateTime.t() | nil
        }

  # Configuration
  @max_concurrent 10
  @fetch_timeout 30_000
  # 50MB
  @max_content_size 52_428_800
  # P1: Jobs cleaned up after 24 hours
  @job_ttl_ms :timer.hours(24)
  @cleanup_interval :timer.minutes(15)
  @supported_content_types ~w(
    text/plain text/html text/markdown text/csv
    application/json application/xml application/pdf
    image/png image/jpeg image/gif image/webp
  )

  @telemetry [:cybernetic, :content, :pipeline]

  # Client API

  @doc "Start the ingest pipeline server"
  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts \\ []) do
    name = Keyword.get(opts, :name, __MODULE__)
    GenServer.start_link(__MODULE__, opts, name: name)
  end

  @doc "Ingest content from a URL"
  @spec ingest_url(GenServer.server(), String.t(), String.t(), keyword()) ::
          {:ok, pipeline_result()} | {:error, term()}
  def ingest_url(server \\ __MODULE__, url, tenant_id, opts \\ []) do
    source = %{url: url, path: nil, content: nil, content_type: nil}
    ingest(server, source, tenant_id, opts)
  end

  @doc "Ingest content from a file path"
  @spec ingest_file(GenServer.server(), String.t(), String.t(), keyword()) ::
          {:ok, pipeline_result()} | {:error, term()}
  def ingest_file(server \\ __MODULE__, path, tenant_id, opts \\ []) do
    source = %{url: nil, path: path, content: nil, content_type: nil}
    ingest(server, source, tenant_id, opts)
  end

  @doc "Ingest raw content directly"
  @spec ingest_content(GenServer.server(), binary(), String.t(), keyword()) ::
          {:ok, pipeline_result()} | {:error, term()}
  def ingest_content(server \\ __MODULE__, content, tenant_id, opts \\ []) do
    content_type = Keyword.get(opts, :content_type)
    source = %{url: nil, path: nil, content: content, content_type: content_type}
    ingest(server, source, tenant_id, opts)
  end

  @doc "Ingest from a source map"
  @spec ingest(GenServer.server(), source(), String.t(), keyword()) ::
          {:ok, pipeline_result()} | {:error, term()}
  def ingest(server \\ __MODULE__, source, tenant_id, opts \\ []) do
    timeout = Keyword.get(opts, :timeout, 60_000)
    GenServer.call(server, {:ingest, source, tenant_id, opts}, timeout)
  end

  @doc "Ingest multiple items in batch"
  @spec ingest_batch(GenServer.server(), [{source(), String.t(), keyword()}], keyword()) ::
          {:ok, [pipeline_result()]}
  def ingest_batch(server \\ __MODULE__, items, opts \\ []) do
    timeout = Keyword.get(opts, :timeout, 300_000)
    GenServer.call(server, {:ingest_batch, items, opts}, timeout)
  end

  @doc "Queue an async ingest job (returns immediately)"
  @spec queue_ingest(GenServer.server(), source(), String.t(), keyword()) ::
          {:ok, String.t()}
  def queue_ingest(server \\ __MODULE__, source, tenant_id, opts \\ []) do
    GenServer.call(server, {:queue_ingest, source, tenant_id, opts})
  end

  @doc "Get job status"
  @spec get_job(GenServer.server(), String.t()) :: {:ok, job()} | {:error, :not_found}
  def get_job(server \\ __MODULE__, job_id) do
    GenServer.call(server, {:get_job, job_id})
  end

  @doc "Get pipeline statistics"
  @spec stats(GenServer.server()) :: map()
  def stats(server \\ __MODULE__) do
    GenServer.call(server, :stats)
  end

  # Server Implementation

  @impl true
  def init(opts) do
    Logger.info("Ingest Pipeline starting")

    {:ok, task_supervisor} =
      Task.Supervisor.start_link(
        max_children: Keyword.get(opts, :max_concurrent, @max_concurrent)
      )

    state = %{
      jobs: %{},
      processing: MapSet.new(),
      tasks: %{},
      task_supervisor: task_supervisor,
      container_server: Keyword.get(opts, :container_server, SemanticContainer),
      max_concurrent: Keyword.get(opts, :max_concurrent, @max_concurrent),
      stats: %{
        total_ingested: 0,
        total_failed: 0,
        total_bytes: 0,
        avg_duration_ms: 0
      }
    }

    # P1: Schedule periodic job cleanup
    schedule_cleanup()

    {:ok, state}
  end

  @impl true
  def handle_call({:ingest, source, tenant_id, opts}, _from, state) do
    result = run_pipeline(source, tenant_id, opts, state)
    new_state = update_stats(state, result)
    {:reply, {:ok, result}, new_state}
  end

  @impl true
  def handle_call({:ingest_batch, items, _opts}, _from, state) do
    # Process items with limited concurrency
    results =
      items
      |> Task.async_stream(
        fn {source, tenant_id, opts} ->
          run_pipeline(source, tenant_id, opts, state)
        end,
        max_concurrency: state.max_concurrent,
        timeout: @fetch_timeout * 3
      )
      |> Enum.map(fn
        {:ok, result} -> result
        {:exit, reason} -> %{id: nil, status: :failed, error: reason, duration_ms: 0}
      end)

    new_state = Enum.reduce(results, state, &update_stats(&2, &1))
    {:reply, {:ok, results}, new_state}
  end

  @impl true
  def handle_call({:queue_ingest, source, tenant_id, opts}, _from, state) do
    job_id = generate_job_id()
    now = DateTime.utc_now()

    job = %{
      id: job_id,
      source: source,
      tenant_id: tenant_id,
      options: opts,
      status: :pending,
      result: nil,
      created_at: now,
      started_at: nil,
      completed_at: nil
    }

    new_state = %{state | jobs: Map.put(state.jobs, job_id, job)}

    # Process async
    send(self(), {:process_job, job_id})

    {:reply, {:ok, job_id}, new_state}
  end

  @impl true
  def handle_call({:get_job, job_id}, _from, state) do
    case Map.fetch(state.jobs, job_id) do
      {:ok, job} -> {:reply, {:ok, job}, state}
      :error -> {:reply, {:error, :not_found}, state}
    end
  end

  @impl true
  def handle_call(:stats, _from, state) do
    stats =
      Map.merge(state.stats, %{
        pending_jobs: count_jobs_by_status(state, :pending),
        processing_jobs: MapSet.size(state.processing)
      })

    {:reply, stats, state}
  end

  @impl true
  def handle_info({:process_job, job_id}, state) do
    case Map.fetch(state.jobs, job_id) do
      {:ok, %{status: :pending} = job} ->
        if MapSet.size(state.processing) < state.max_concurrent do
          # Process now
          new_state = %{
            state
            | processing: MapSet.put(state.processing, job_id),
              jobs:
                Map.update!(state.jobs, job_id, fn j ->
                  %{j | status: :processing, started_at: DateTime.utc_now()}
                end)
          }

          task =
            Task.Supervisor.async_nolink(state.task_supervisor, fn ->
              run_pipeline(job.source, job.tenant_id, job.options, new_state, job_id)
            end)

          new_state = %{new_state | tasks: Map.put(new_state.tasks, task.ref, job_id)}

          {:noreply, new_state}
        else
          # Queue for later
          Process.send_after(self(), {:process_job, job_id}, 1000)
          {:noreply, state}
        end

      _ ->
        {:noreply, state}
    end
  end

  @impl true
  def handle_info({ref, result}, state) when is_reference(ref) and is_map(result) do
    case Map.pop(state.tasks, ref) do
      {nil, _tasks} ->
        {:noreply, state}

      {job_id, remaining_tasks} ->
        Process.demonitor(ref, [:flush])

        state = %{state | tasks: remaining_tasks}

        case Map.fetch(state.jobs, job_id) do
          {:ok, _job} ->
            new_state = %{
              state
              | processing: MapSet.delete(state.processing, job_id),
                jobs:
                  Map.update!(state.jobs, job_id, fn j ->
                    %{
                      j
                      | status: if(result.status == :success, do: :completed, else: :failed),
                        result: result,
                        completed_at: DateTime.utc_now()
                    }
                  end)
            }

            {:noreply, update_stats(new_state, result)}

          :error ->
            # Job was already cleaned up
            {:noreply, state}
        end
    end
  end

  @impl true
  def handle_info({:DOWN, ref, :process, _pid, reason}, state) when is_reference(ref) do
    case Map.pop(state.tasks, ref) do
      {nil, _tasks} ->
        {:noreply, state}

      {job_id, remaining_tasks} ->
        Process.demonitor(ref, [:flush])

        state = %{state | tasks: remaining_tasks}

        case Map.fetch(state.jobs, job_id) do
          {:ok, job} ->
            result = failed_result(job_id, job, {:task_down, reason})

            new_state = %{
              state
              | processing: MapSet.delete(state.processing, job_id),
                jobs:
                  Map.update!(state.jobs, job_id, fn j ->
                    %{
                      j
                      | status: :failed,
                        result: result,
                        completed_at: DateTime.utc_now()
                    }
                  end)
            }

            {:noreply, update_stats(new_state, result)}

          :error ->
            {:noreply, state}
        end
    end
  end

  @impl true
  def handle_info(:cleanup_jobs, state) do
    # P1: Clean up old completed/failed jobs
    cutoff = DateTime.add(DateTime.utc_now(), -@job_ttl_ms, :millisecond)

    cleaned_jobs =
      state.jobs
      |> Enum.reject(fn {_id, job} ->
        job.status in [:completed, :failed] and
          job.completed_at != nil and
          DateTime.compare(job.completed_at, cutoff) == :lt
      end)
      |> Map.new()

    removed_count = map_size(state.jobs) - map_size(cleaned_jobs)

    if removed_count > 0 do
      Logger.debug("Cleaned up #{removed_count} old ingest jobs")
    end

    schedule_cleanup()
    {:noreply, %{state | jobs: cleaned_jobs}}
  end

  # Pipeline Stages

  @spec run_pipeline(source(), String.t(), keyword(), map()) :: pipeline_result()
  defp run_pipeline(source, tenant_id, opts, state) do
    run_pipeline(source, tenant_id, opts, state, generate_job_id())
  end

  @spec run_pipeline(source(), String.t(), keyword(), map(), String.t()) :: pipeline_result()
  defp run_pipeline(source, tenant_id, opts, state, job_id) do
    start_time = System.monotonic_time(:millisecond)

    try do
      with {:ok, content, content_type} <- stage_fetch(source),
           {:ok, normalized} <- stage_normalize(content, content_type),
           {:ok, metadata} <- stage_extract(normalized, content_type, opts),
           {:ok, container} <- stage_containerize(normalized, tenant_id, metadata, opts, state) do
        emit_telemetry(:success, start_time, %{
          tenant_id: tenant_id,
          content_size: byte_size(normalized)
        })

        %{
          id: job_id,
          status: :success,
          container_id: container.id,
          bytes_ingested: byte_size(normalized),
          error: nil,
          duration_ms: System.monotonic_time(:millisecond) - start_time
        }
      else
        {:error, :skipped, reason} ->
          %{
            id: job_id,
            status: :skipped,
            container_id: nil,
            bytes_ingested: 0,
            error: reason,
            duration_ms: System.monotonic_time(:millisecond) - start_time
          }

        {:error, reason} ->
          emit_telemetry(:error, start_time, %{tenant_id: tenant_id, reason: reason})

          %{
            id: job_id,
            status: :failed,
            container_id: nil,
            bytes_ingested: 0,
            error: reason,
            duration_ms: System.monotonic_time(:millisecond) - start_time
          }

        unexpected ->
          emit_telemetry(:error, start_time, %{
            tenant_id: tenant_id,
            reason: {:unexpected, unexpected}
          })

          %{
            id: job_id,
            status: :failed,
            container_id: nil,
            bytes_ingested: 0,
            error: {:unexpected, unexpected},
            duration_ms: System.monotonic_time(:millisecond) - start_time
          }
      end
    rescue
      e ->
        emit_telemetry(:error, start_time, %{tenant_id: tenant_id, reason: {:exception, e}})

        %{
          id: job_id,
          status: :failed,
          container_id: nil,
          bytes_ingested: 0,
          error: {:exception, e},
          duration_ms: System.monotonic_time(:millisecond) - start_time
        }
    catch
      :exit, reason ->
        emit_telemetry(:error, start_time, %{tenant_id: tenant_id, reason: {:exit, reason}})

        %{
          id: job_id,
          status: :failed,
          container_id: nil,
          bytes_ingested: 0,
          error: {:exit, reason},
          duration_ms: System.monotonic_time(:millisecond) - start_time
        }
    end
  end

  defp failed_result(job_id, job, error) do
    duration_ms =
      case job.started_at do
        %DateTime{} = started_at ->
          max(0, DateTime.diff(DateTime.utc_now(), started_at, :millisecond))

        _ ->
          0
      end

    %{
      id: job_id,
      status: :failed,
      container_id: nil,
      bytes_ingested: 0,
      error: error,
      duration_ms: duration_ms
    }
  end

  # Stage 1: Fetch
  @spec stage_fetch(source()) :: {:ok, binary(), String.t()} | {:error, term()}
  defp stage_fetch(%{content: content} = source)
       when is_binary(content) and byte_size(content) > 0 do
    content_type =
      case Map.get(source, :content_type) do
        type when is_binary(type) and type != "" -> type
        _ -> Cybernetic.Storage.ContentType.detect(content, "application/octet-stream")
      end

    {:ok, content, content_type}
  end

  defp stage_fetch(%{path: path}) when is_binary(path) do
    case File.read(path) do
      {:ok, content} ->
        content_type = Cybernetic.Storage.ContentType.from_path(path)
        {:ok, content, content_type}

      {:error, reason} ->
        {:error, {:fetch_failed, reason}}
    end
  end

  defp stage_fetch(%{url: url}) when is_binary(url) do
    fetch_url(url)
  end

  defp stage_fetch(_), do: {:error, :invalid_source}

  # HTTP timeouts for SSRF protection (consistent with JWKSCache)
  @http_connect_timeout_ms 5_000

  @spec fetch_url(String.t()) :: {:ok, binary(), String.t()} | {:error, term()}
  defp fetch_url(url) do
    env = Application.get_env(:cybernetic, :environment, :prod)

    with {:ok, %{connect_hostname: hostname, pinned_uris: pinned_uris}} <-
           SSRF.prepare_request(url,
             env: env,
             require_https_in_prod: false,
             # Ingest is user-input; block obvious internal hosts always.
             block_internal_hosts: true,
             # In prod, also fail-closed on private/reserved IPs (DNS + literals).
             block_private_ips: env == :prod,
             block_unresolvable_hosts: env == :prod
           ),
         {:ok, response} <- pinned_get(pinned_uris, hostname) do
      case response do
        %{status: 200, body: body, headers: headers} ->
          content_type = get_content_type_header(headers)

          if byte_size(body) > @max_content_size do
            {:error, :content_too_large}
          else
            {:ok, body, content_type}
          end

        %{status: status} when status in [301, 302, 303, 307, 308] ->
          {:error, {:redirect_blocked, status}}

        %{status: status} ->
          {:error, {:http_error, status}}
      end
    else
      {:error, :internal_host_blocked} ->
        {:error, :blocked_host}

      {:error, :dns_resolution_failed} ->
        {:error, :blocked_host}

      {:error, :invalid_scheme} ->
        {:error, :invalid_url}

      {:error, :missing_host} ->
        {:error, :invalid_url}

      {:error, :https_required_in_prod} ->
        {:error, :invalid_url}

      {:error, reason} ->
        {:error, {:fetch_failed, reason}}
    end
  end

  defp pinned_get([], _hostname), do: {:error, :dns_resolution_failed}

  defp pinned_get([%URI{} = pinned_uri | rest], hostname) when is_binary(hostname) do
    case Req.get(URI.to_string(pinned_uri),
           receive_timeout: @fetch_timeout,
           connect_options: [timeout: @http_connect_timeout_ms, hostname: hostname],
           max_redirects: 0,
           retry: false
         ) do
      {:ok, _} = ok ->
        ok

      {:error, _reason} = error ->
        if rest == [] do
          error
        else
          pinned_get(rest, hostname)
        end
    end
  end

  @spec get_content_type_header([{String.t(), String.t()}]) :: String.t()
  defp get_content_type_header(headers) do
    headers
    |> Enum.find(fn {k, _v} -> String.downcase(k) == "content-type" end)
    |> case do
      {_, value} -> String.split(value, ";") |> List.first() |> String.trim()
      nil -> "application/octet-stream"
    end
  end

  # Stage 2: Normalize
  # P2: 10MB limit for HTML processing to prevent ReDoS
  @max_html_size 10_485_760

  @spec stage_normalize(binary(), String.t()) :: {:ok, binary()} | {:error, term()}
  defp stage_normalize(content, content_type) do
    cond do
      String.starts_with?(content_type, "text/html") ->
        {:ok, normalize_html(content)}

      String.starts_with?(content_type, "text/") ->
        {:ok, normalize_text(content)}

      content_type == "application/json" ->
        {:ok, normalize_json(content)}

      content_type in @supported_content_types ->
        {:ok, content}

      true ->
        # Skip unsupported content types
        {:error, :skipped, {:unsupported_content_type, content_type}}
    end
  end

  @spec normalize_html(binary()) :: binary()
  defp normalize_html(html) do
    # P2: Limit input size to prevent ReDoS attacks
    truncated =
      if byte_size(html) > @max_html_size do
        binary_part(html, 0, @max_html_size)
      else
        html
      end

    # Basic HTML to text conversion with simple patterns
    truncated
    |> String.replace(~r/<script[^>]*>.*?<\/script>/is, "")
    |> String.replace(~r/<style[^>]*>.*?<\/style>/is, "")
    |> String.replace(~r/<[^>]+>/, " ")
    |> decode_html_entities()
    |> String.replace(~r/\s+/, " ")
    |> String.trim()
  end

  @spec decode_html_entities(binary()) :: binary()
  defp decode_html_entities(text) do
    text
    |> String.replace("&nbsp;", " ")
    |> String.replace("&amp;", "&")
    |> String.replace("&lt;", "<")
    |> String.replace("&gt;", ">")
    |> String.replace("&quot;", "\"")
    |> String.replace("&#39;", "'")
  end

  @spec normalize_text(binary()) :: binary()
  defp normalize_text(text) do
    text
    |> String.replace(~r/\r\n/, "\n")
    |> String.replace(~r/\r/, "\n")
    |> String.trim()
  end

  @spec normalize_json(binary()) :: binary()
  defp normalize_json(json) do
    case Jason.decode(json) do
      {:ok, decoded} -> Jason.encode!(decoded, pretty: false)
      {:error, _} -> json
    end
  end

  # Stage 3: Extract metadata
  @spec stage_extract(binary(), String.t(), keyword()) :: {:ok, map()} | {:error, term()}
  defp stage_extract(content, content_type, opts) do
    metadata = %{
      content_type: content_type,
      size: byte_size(content),
      word_count: count_words(content),
      extracted_at: DateTime.utc_now() |> DateTime.to_iso8601()
    }

    # Add source URL if available
    metadata =
      case Keyword.get(opts, :source_url) do
        nil -> metadata
        url -> Map.put(metadata, :source_url, url)
      end

    # Extract additional metadata based on content type
    metadata =
      if String.starts_with?(content_type, "text/") do
        Map.merge(metadata, extract_text_metadata(content))
      else
        metadata
      end

    {:ok, metadata}
  end

  @spec count_words(binary()) :: non_neg_integer()
  defp count_words(content) do
    content
    |> String.split(~r/\s+/)
    |> Enum.reject(&(&1 == ""))
    |> length()
  end

  @spec extract_text_metadata(binary()) :: map()
  defp extract_text_metadata(content) do
    lines = String.split(content, "\n")

    %{
      line_count: length(lines),
      char_count: String.length(content)
    }
  end

  # Stage 4 & 5: Containerize (embedding happens inside SemanticContainer.create)
  @spec stage_containerize(binary(), String.t(), map(), keyword(), map()) ::
          {:ok, SemanticContainer.t()} | {:error, term()}
  defp stage_containerize(content, tenant_id, metadata, opts, state) do
    container_opts =
      opts
      |> Keyword.put(:metadata, metadata)
      |> Keyword.put(:content_type, metadata.content_type)

    SemanticContainer.create(state.container_server, content, tenant_id, container_opts)
  end

  # Helpers

  @spec generate_job_id() :: String.t()
  defp generate_job_id do
    :crypto.strong_rand_bytes(8) |> Base.encode16(case: :lower)
  end

  @spec count_jobs_by_status(map(), atom()) :: non_neg_integer()
  defp count_jobs_by_status(state, status) do
    Enum.count(state.jobs, fn {_id, job} -> job.status == status end)
  end

  @spec update_stats(map(), pipeline_result()) :: map()
  defp update_stats(state, %{status: :success, duration_ms: duration} = result) do
    old_total = state.stats.total_ingested
    new_total = old_total + 1
    old_avg = state.stats.avg_duration_ms
    bytes_ingested = Map.get(result, :bytes_ingested, 0)

    new_avg_duration =
      if old_total == 0 do
        duration
      else
        div(old_avg * old_total + duration, new_total)
      end

    new_stats =
      state.stats
      |> Map.put(:total_ingested, new_total)
      |> Map.put(:avg_duration_ms, new_avg_duration)
      |> Map.update!(:total_bytes, &(&1 + bytes_ingested))

    %{state | stats: new_stats}
  end

  defp update_stats(state, %{status: :failed}) do
    new_stats = Map.update!(state.stats, :total_failed, &(&1 + 1))
    %{state | stats: new_stats}
  end

  defp update_stats(state, _), do: state

  @spec emit_telemetry(atom(), integer(), map()) :: :ok
  defp emit_telemetry(event, start_time, metadata) do
    duration = System.monotonic_time(:millisecond) - start_time

    :telemetry.execute(
      @telemetry ++ [event],
      %{duration: duration},
      metadata
    )
  end

  defp schedule_cleanup do
    Process.send_after(self(), :cleanup_jobs, @cleanup_interval)
  end
end
