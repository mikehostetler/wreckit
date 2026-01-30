defmodule Cybernetic.Edge.Gateway.LayoutView do
  use Phoenix.Component

  def root(assigns) do
    ~H"""
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="csrf-token" content={Plug.CSRFProtection.get_csrf_token()} />
        <title>Cybernetic Dashboard</title>
        <script src="https://cdn.jsdelivr.net/npm/phoenix@1.7.10/priv/static/phoenix.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/phoenix_live_view@0.20.3/priv/static/phoenix_live_view.min.js"></script>
        <script>
          // Initialize LiveSocket
          document.addEventListener("DOMContentLoaded", function() {
            var csrfToken = document.querySelector("meta[name='csrf-token']").getAttribute("content");
            var liveSocket = new window.LiveView.LiveSocket("/live", window.Phoenix.Socket, {params: {_csrf_token: csrfToken}});
            liveSocket.connect();
            window.liveSocket = liveSocket;
            console.log("Cybernetic LiveSocket connected");
          });
        </script>
      </head>
      <body>
        <%= @inner_content %>
      </body>
    </html>
    """
  end
end