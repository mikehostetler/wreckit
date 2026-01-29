defmodule Cybernetic.Intelligence.Utils do
  @moduledoc """
  Shared utilities for Intelligence layer components.
  """

  @doc "Generate a unique node ID for distributed systems"
  @spec generate_node_id() :: String.t()
  def generate_node_id do
    node_name = Node.self() |> to_string() |> String.replace("@", "_")
    random = :crypto.strong_rand_bytes(4) |> Base.encode16(case: :lower)
    "node_#{node_name}_#{random}"
  end

  @doc "Generate a short unique ID"
  @spec generate_id() :: String.t()
  def generate_id do
    :crypto.strong_rand_bytes(16) |> Base.encode16(case: :lower)
  end

  @doc """
  Convert MFA tuple or function to callable.
  For distributed systems, prefer MFA over anonymous functions.
  """
  @spec to_callable(mfa() | function()) :: {:mfa, mfa()} | {:fun, function()}
  def to_callable({m, f, a}) when is_atom(m) and is_atom(f) and is_list(a) do
    {:mfa, {m, f, a}}
  end

  def to_callable(fun) when is_function(fun) do
    {:fun, fun}
  end

  @doc "Execute a callable (MFA or function)"
  @spec execute_callable({:mfa, mfa()} | {:fun, function()}, [term()]) :: term()
  def execute_callable({:mfa, {m, f, a}}, extra_args) do
    apply(m, f, a ++ extra_args)
  end

  def execute_callable({:fun, fun}, args) do
    apply(fun, args)
  end

  @doc "Truncate a list to max size, keeping most recent (head)"
  @spec truncate_list(list(), non_neg_integer()) :: list()
  def truncate_list(list, max_size) do
    # Enum.take handles empty lists and returns at most max_size elements
    # This avoids O(n) length() call - Enum.take stops early when it has enough
    Enum.take(list, max_size)
  end

  @doc "Safe division avoiding divide by zero"
  @spec safe_div(number(), number(), number()) :: number()
  def safe_div(_numerator, denominator, default) when denominator == 0, do: default
  def safe_div(numerator, denominator, _default), do: numerator / denominator
end
