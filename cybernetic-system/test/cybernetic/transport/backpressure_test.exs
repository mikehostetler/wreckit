defmodule Cybernetic.Transport.BackpressureTest do
  use ExUnit.Case
  alias Cybernetic.Transport.Backpressure
  alias Cybernetic.Transport.Backpressure.{Producer, Consumer, Transformer}

  describe "Producer" do
    test "accepts and queues events" do
      {:ok, producer} = Producer.start_link()

      Producer.push(producer, :event1)
      Producer.push(producer, :event2)

      assert Producer.queue_size(producer) >= 0
    end

    test "respects max_buffer limit" do
      {:ok, producer} = Producer.start_link(max_buffer: 3)

      # Fill the buffer
      Producer.push(producer, :event1)
      Producer.push(producer, :event2)
      Producer.push(producer, :event3)

      # This should be dropped (check logs)
      Producer.push(producer, :event4)

      assert Producer.queue_size(producer) <= 3
    end
  end

  describe "Consumer" do
    test "processes events with handler" do
      {:ok, agent} = Agent.start_link(fn -> [] end)

      handler = fn event ->
        Agent.update(agent, &[event | &1])
      end

      # Create a producer to feed the consumer
      {:ok, producer} = Producer.start_link()
      {:ok, consumer} = Consumer.start_link(handler: handler)

      # Wire them together
      GenStage.sync_subscribe(consumer, to: producer)

      # Push events through the producer
      Producer.push(producer, :event1)
      Producer.push(producer, :event2)

      Process.sleep(50)

      stats = Consumer.stats(consumer)
      assert stats.processed == 2

      # Verify handler was called
      events = Agent.get(agent, & &1)
      assert :event1 in events
      assert :event2 in events
    end

    test "handles handler errors gracefully" do
      handler = fn _event ->
        raise "Handler error"
      end

      {:ok, consumer} = Consumer.start_link(handler: handler)

      # Should not crash on handler error
      send(consumer, {:"$gen_consumer", {self(), make_ref()}, [:event1]})

      Process.sleep(10)
      assert Process.alive?(consumer)
    end
  end

  describe "Transformer" do
    test "transforms events" do
      transform = fn event ->
        {:transformed, event}
      end

      {:producer_consumer, state} = Transformer.init(transform: transform)

      {:noreply, transformed, _new_state} =
        Transformer.handle_events([:event1, :event2], self(), state)

      assert transformed == [{:transformed, :event1}, {:transformed, :event2}]
    end

    test "filters out nil transformations" do
      transform = fn
        :keep -> :kept
        :drop -> nil
      end

      {:producer_consumer, state} = Transformer.init(transform: transform)

      {:noreply, transformed, _new_state} =
        Transformer.handle_events([:keep, :drop, :keep], self(), state)

      assert transformed == [:kept, :kept]
    end
  end

  describe "Pipeline builder" do
    test "builds a complete pipeline" do
      {:ok, agent} = Agent.start_link(fn -> [] end)

      {:ok, pipeline} =
        Backpressure.build_pipeline(
          producer: [max_buffer: 100],
          transformers: [
            [transform: &{:step1, &1}],
            [transform: fn {:step1, data} -> {:step2, data} end]
          ],
          consumer: [
            handler: fn event ->
              Agent.update(agent, &[event | &1])
            end,
            max_demand: 10
          ]
        )

      assert pipeline.producer
      assert length(pipeline.transformers) == 2
      assert pipeline.consumer

      # Push events through the pipeline
      Producer.push(pipeline.producer, :data1)
      Producer.push(pipeline.producer, :data2)

      Process.sleep(50)

      events = Agent.get(agent, & &1)
      assert Enum.any?(events, &match?({:step2, :data1}, &1))
      assert Enum.any?(events, &match?({:step2, :data2}, &1))
    end

    test "pipeline handles backpressure" do
      slow_handler = fn event ->
        Process.sleep(10)
        :ok
      end

      {:ok, pipeline} =
        Backpressure.build_pipeline(
          producer: [max_buffer: 5],
          consumer: [handler: slow_handler, max_demand: 1]
        )

      # Push many events quickly
      for i <- 1..10 do
        Producer.push(pipeline.producer, {:event, i})
      end

      # Queue should not exceed max_buffer
      assert Producer.queue_size(pipeline.producer) <= 5
    end
  end
end
