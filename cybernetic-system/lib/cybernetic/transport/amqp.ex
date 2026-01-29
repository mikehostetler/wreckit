defmodule Cybernetic.Transport.AMQP do
  @moduledoc """
  AMQP transport implementation using RabbitMQ.
  Production transport that uses the existing AMQP publisher.
  """

  @behaviour Cybernetic.Transport.Behaviour
  alias Cybernetic.Core.Transport.AMQP.Publisher

  @impl true
  def publish(exchange, routing_key, message, opts) do
    Publisher.publish(exchange, routing_key, message, opts)
  end
end
