defmodule Cybernetic.Core.Transport.AMQP.Connection do
  @moduledoc """
  Alias to the main AMQP Connection for backward compatibility.
  """

  @spec reconnect() :: :ok | {:error, term()}
  def reconnect do
    Cybernetic.Transport.AMQP.Connection.reconnect()
  end

  @spec get_channel() :: {:ok, AMQP.Channel.t()} | {:error, term()}
  def get_channel do
    Cybernetic.Transport.AMQP.Connection.get_channel()
  end
end
