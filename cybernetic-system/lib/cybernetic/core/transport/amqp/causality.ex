defmodule Cybernetic.Transport.AMQP.Causality do
  @moduledoc """
  Causal ordering helpers (Lamport/vector clock in headers).
  """
  def put_headers(headers \\ [], clock, node_id) do
    headers ++
      [
        {"x-lamport", :erlang.system_time()},
        {"x-node", node_id},
        {"x-clock", :erlang.term_to_binary(clock)}
      ]
  end
end
