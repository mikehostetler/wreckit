defmodule Cybernetic.Telegram.Telemetry do
  @moduledoc false
  def emit(event, meta \\ %{}),
    do: :telemetry.execute([:cybernetic, :telegram, event], %{count: 1}, meta)
end
