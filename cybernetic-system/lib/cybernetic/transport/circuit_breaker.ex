defmodule Cybernetic.Transport.CircuitBreaker do
  @moduledoc """
  Circuit breaker pattern for handling provider failures.

  States:
  - :closed - Normal operation, requests pass through
  - :open - Circuit is open, requests fail immediately  
  - :half_open - Testing if service has recovered
  """

  defstruct [
    :name,
    :state,
    :failure_count,
    :success_count,
    :last_failure_time,
    :threshold,
    :timeout,
    :half_open_attempts
  ]

  @default_threshold 5
  # 1 minute
  @default_timeout 60_000
  @default_half_open_attempts 3

  @type state :: :closed | :open | :half_open

  @type t :: %__MODULE__{
          name: String.t(),
          state: state(),
          failure_count: integer(),
          success_count: integer(),
          last_failure_time: integer() | nil,
          threshold: integer(),
          timeout: integer(),
          half_open_attempts: integer()
        }

  @doc """
  Create a new circuit breaker.
  """
  def new(name, opts \\ []) do
    %__MODULE__{
      name: name,
      state: :closed,
      failure_count: 0,
      success_count: 0,
      last_failure_time: nil,
      threshold: Keyword.get(opts, :threshold, @default_threshold),
      timeout: Keyword.get(opts, :timeout, @default_timeout),
      half_open_attempts: Keyword.get(opts, :half_open_attempts, @default_half_open_attempts)
    }
  end

  @doc """
  Execute a function through the circuit breaker.
  """
  def call(%__MODULE__{state: :open} = breaker, fun) do
    if should_attempt_reset?(breaker) do
      # Try half-open state
      call(%{breaker | state: :half_open, half_open_attempts: breaker.half_open_attempts}, fun)
    else
      {:error, :circuit_open}
    end
  end

  def call(%__MODULE__{} = breaker, fun) do
    try do
      result = fun.()

      case result do
        {:ok, _} = success ->
          {:ok, elem(success, 1), record_success(breaker)}

        {:error, _} = error ->
          _new_breaker = record_failure(breaker)
          {:error, elem(error, 1)}

        other ->
          {:ok, other, record_success(breaker)}
      end
    rescue
      error ->
        _new_breaker = record_failure(breaker)
        {:error, error}
    end
  end

  @doc """
  Record a successful call.
  """
  def record_success(%__MODULE__{state: :half_open} = breaker) do
    if breaker.success_count + 1 >= breaker.half_open_attempts do
      # Enough successes, close the circuit
      %{breaker | state: :closed, failure_count: 0, success_count: 0, last_failure_time: nil}
    else
      %{breaker | success_count: breaker.success_count + 1}
    end
  end

  def record_success(%__MODULE__{} = breaker) do
    %{breaker | failure_count: 0, success_count: breaker.success_count + 1}
  end

  @doc """
  Record a failed call.
  """
  def record_failure(%__MODULE__{} = breaker) do
    new_failure_count = breaker.failure_count + 1

    if new_failure_count >= breaker.threshold do
      # Open the circuit
      %{
        breaker
        | state: :open,
          failure_count: new_failure_count,
          last_failure_time: System.system_time(:millisecond)
      }
    else
      %{
        breaker
        | failure_count: new_failure_count,
          last_failure_time: System.system_time(:millisecond)
      }
    end
  end

  @doc """
  Check if enough time has passed to attempt a reset.
  """
  def should_attempt_reset?(%__MODULE__{last_failure_time: nil}), do: false

  def should_attempt_reset?(%__MODULE__{} = breaker) do
    current_time = System.system_time(:millisecond)
    current_time - breaker.last_failure_time >= breaker.timeout
  end

  @doc """
  Get the current state of the circuit breaker.
  """
  def get_state(%__MODULE__{} = breaker), do: breaker.state

  @doc """
  Reset the circuit breaker to closed state.
  """
  def reset(%__MODULE__{} = breaker) do
    %{breaker | state: :closed, failure_count: 0, success_count: 0, last_failure_time: nil}
  end
end
