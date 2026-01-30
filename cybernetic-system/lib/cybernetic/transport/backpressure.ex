defmodule Cybernetic.Transport.Backpressure do
  @moduledoc """
  GenStage-based backpressure implementation for flow control.
  Manages demand between producers and consumers to prevent overload.
  """
  use GenStage
  require Logger

  def init(opts) do
    # This module is primarily a collection of GenStage implementations
    # The main entry point is build_pipeline/1
    {:ok, opts}
  end

  # Producer implementation
  defmodule Producer do
    use GenStage

    def start_link(opts \\ []) do
      GenStage.start_link(__MODULE__, opts, name: Keyword.get(opts, :name))
    end

    def init(opts) do
      state = %{
        queue: :queue.new(),
        demand: 0,
        max_buffer: Keyword.get(opts, :max_buffer, 10_000)
      }

      {:producer, state}
    end

    @doc "Push an event to the producer"
    def push(producer, event) do
      GenStage.cast(producer, {:push, event})
    end

    @doc "Get queue size"
    def queue_size(producer) do
      GenStage.call(producer, :queue_size)
    end

    def handle_cast({:push, event}, %{queue: queue, max_buffer: max_buffer} = state) do
      if :queue.len(queue) >= max_buffer do
        Logger.warning("Backpressure: Queue full (#{max_buffer}), dropping event")
        {:noreply, [], state}
      else
        new_queue = :queue.in(event, queue)
        {events, new_state} = dispatch_events(%{state | queue: new_queue})
        {:noreply, events, new_state}
      end
    end

    def handle_call(:queue_size, _from, %{queue: queue} = state) do
      {:reply, :queue.len(queue), [], state}
    end

    def handle_demand(demand, %{demand: current_demand} = state) do
      {events, new_state} = dispatch_events(%{state | demand: current_demand + demand})
      {:noreply, events, new_state}
    end

    defp dispatch_events(%{queue: queue, demand: demand} = state) when demand > 0 do
      {events, new_queue} = take_from_queue(queue, demand)
      {events, %{state | queue: new_queue, demand: demand - length(events)}}
    end

    defp dispatch_events(state), do: {[], state}

    defp take_from_queue(queue, demand) do
      take_from_queue(queue, demand, [])
    end

    defp take_from_queue(queue, 0, acc), do: {Enum.reverse(acc), queue}

    defp take_from_queue(queue, demand, acc) do
      case :queue.out(queue) do
        {{:value, item}, new_queue} ->
          take_from_queue(new_queue, demand - 1, [item | acc])

        {:empty, queue} ->
          {Enum.reverse(acc), queue}
      end
    end
  end

  # Consumer implementation
  defmodule Consumer do
    use GenStage

    @default_max_demand 100
    @default_min_demand 50

    def start_link(opts) do
      GenStage.start_link(__MODULE__, opts, name: Keyword.get(opts, :name))
    end

    def init(opts) do
      handler = Keyword.fetch!(opts, :handler)
      max_demand = Keyword.get(opts, :max_demand, @default_max_demand)
      min_demand = Keyword.get(opts, :min_demand, @default_min_demand)

      state = %{
        handler: handler,
        max_demand: max_demand,
        min_demand: min_demand,
        processed: 0
      }

      {:consumer, state}
    end

    @doc "Get processing stats"
    def stats(consumer) do
      GenStage.call(consumer, :stats)
    end

    def handle_events(events, _from, %{handler: handler, processed: processed} = state) do
      # Process events with the handler function
      Enum.each(events, fn event ->
        try do
          handler.(event)
        rescue
          error ->
            Logger.error("Consumer handler error: #{inspect(error)}")
        end
      end)

      {:noreply, [], %{state | processed: processed + length(events)}}
    end

    def handle_call(:stats, _from, state) do
      {:reply, %{processed: state.processed}, [], state}
    end
  end

  # ProducerConsumer for transformations
  defmodule Transformer do
    use GenStage

    @default_max_demand 100
    @default_min_demand 50

    def start_link(opts) do
      GenStage.start_link(__MODULE__, opts, name: Keyword.get(opts, :name))
    end

    def init(opts) do
      transform = Keyword.fetch!(opts, :transform)
      max_demand = Keyword.get(opts, :max_demand, @default_max_demand)
      min_demand = Keyword.get(opts, :min_demand, @default_min_demand)

      state = %{
        transform: transform,
        max_demand: max_demand,
        min_demand: min_demand
      }

      {:producer_consumer, state}
    end

    def handle_events(events, _from, %{transform: transform} = state) do
      transformed =
        Enum.map(events, fn event ->
          try do
            transform.(event)
          rescue
            error ->
              Logger.error("Transformer error: #{inspect(error)}")
              nil
          end
        end)
        |> Enum.filter(&(&1 != nil))

      {:noreply, transformed, state}
    end
  end

  # Pipeline builder
  @doc """
  Build a GenStage pipeline with backpressure.

  Example:
    {:ok, pipeline} = Backpressure.build_pipeline(
      producer: [max_buffer: 1000],
      transformers: [
        [transform: &process_message/1],
        [transform: &enrich_message/1]
      ],
      consumer: [handler: &deliver_message/1, max_demand: 50]
    )
  """
  def build_pipeline(opts) do
    with {:ok, producer} <- start_producer(opts[:producer] || []),
         {:ok, transformers} <- start_transformers(opts[:transformers] || []),
         {:ok, consumer} <- start_consumer(opts[:consumer]) do
      # Wire the pipeline
      stages = [producer | transformers] ++ [consumer]
      wire_stages(stages)

      {:ok,
       %{
         producer: producer,
         transformers: transformers,
         consumer: consumer,
         pipeline: stages
       }}
    end
  end

  defp start_producer(opts) do
    Producer.start_link(opts)
  end

  defp start_transformers(transformer_opts) do
    transformers =
      Enum.map(transformer_opts, fn opts ->
        {:ok, pid} = Transformer.start_link(opts)
        pid
      end)

    {:ok, transformers}
  end

  defp start_consumer(opts) do
    Consumer.start_link(opts)
  end

  defp wire_stages([_single]), do: :ok

  defp wire_stages([from, to | rest]) do
    GenStage.sync_subscribe(to, to: from)
    wire_stages([to | rest])
  end
end
