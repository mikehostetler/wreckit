defmodule TestEvolution do
  @moduledoc """
  Refactored module for idiomatic Elixir patterns and efficiency.
  """

  @doc """
  Prints a greeting to the console.
  """
  @spec hello() :: :ok
  def hello do
    IO.puts("hello world")
  end

  @doc """
  Evaluates the integer `x`.
  Returns `true` if `x` is 1, otherwise `false`.
  """
  @spec ugly_code(integer()) :: boolean()
  def ugly_code(1), do: true
  def ugly_code(_x), do: false
end