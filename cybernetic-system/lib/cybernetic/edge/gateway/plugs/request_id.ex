defmodule Cybernetic.Edge.Gateway.Plugs.RequestId do
  @moduledoc """
  Plug to generate and assign a unique request ID for each request.
  """
  import Plug.Conn

  def init(opts), do: opts

  def call(conn, _opts) do
    request_id =
      get_req_header(conn, "x-request-id")
      |> List.first() ||
        Ecto.UUID.generate()

    conn
    |> put_resp_header("x-request-id", request_id)
    |> assign(:request_id, request_id)
  end
end
