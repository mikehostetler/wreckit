defmodule Cybernetic.Edge.Gateway.LifecyclePage do
  use Phoenix.LiveDashboard.PageBuilder

  @impl true
  def menu_link(_, _) do
    {:ok, "Lifecycle"}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <div class="row">
      <div class="column">
        <div class="card">
          <div class="card-body">
            <h3>Autonomous System Heartbeat</h3>
            <p>Real-time visualization of the Dream/Act/Heal cycle.</p>
            <div class="lifecycle-status">
              <span class="badge badge-success">System Online</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="row">
      <div class="column">
        <div class="card">
          <div class="card-body">
            <h3>Heartbeat Log (life.log)</h3>
            <pre style="background: #1a1a1a; color: #00ff00; padding: 1rem; border-radius: 4px; max-height: 500px; overflow-y: auto;"><%= @logs %></pre>
          </div>
        </div>
      </div>
    </div>
    """
  end

  @impl true
  def mount(_params, _session, socket) do
    if connected?(socket) do
      :timer.send_interval(2000, self(), :tick)
    end

    {:ok, assign(socket, logs: read_life_log())}
  end

  @impl true
  def handle_info(:tick, socket) do
    {:noreply, assign(socket, logs: read_life_log())}
  end

  defp read_life_log do
    path = System.get_env("LIFE_LOG_PATH")
    
    if path && File.exists?(path) do
      case File.read(path) do
        {:ok, content} ->
          content
          |> String.split("\n")
          |> Enum.take(-50)
          |> Enum.join("\n")
        _ -> "Error reading log file."
      end
    else
      "Waiting for heartbeat... (Log file not found at #{path})"
    end
  end
end
