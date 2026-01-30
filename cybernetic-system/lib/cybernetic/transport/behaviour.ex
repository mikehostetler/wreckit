defmodule Cybernetic.Transport.Behaviour do
  @moduledoc """
  Transport behaviour for VSM message passing.
  Allows switching between AMQP (production) and in-memory (tests) transports.
  """

  @doc """
  Publish a message to the specified exchange and routing key.

  ## Parameters
  - exchange: The exchange name (e.g., "cyb.commands")
  - routing_key: The routing key (e.g., "s2.coordinate")
  - message: The message payload (map)
  - opts: Additional options (list of keyword pairs)

  ## Returns
  - :ok on success
  - {:error, reason} on failure
  """
  @callback publish(
              exchange :: String.t(),
              routing_key :: String.t(),
              message :: map(),
              opts :: keyword()
            ) ::
              :ok | {:error, term()}

  @doc """
  Get the current configured transport module.
  """
  def current_transport do
    Application.get_env(:cybernetic, :transport, Cybernetic.Transport.AMQP)
  end

  @doc """
  Publish a message using the current configured transport.
  """
  def publish(exchange, routing_key, message, opts \\ []) do
    current_transport().publish(exchange, routing_key, message, opts)
  end
end
