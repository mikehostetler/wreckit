defmodule Cybernetic.Transport.Message do
  @moduledoc """
  Message normalization utilities for consistent message handling across transports.
  Ensures all messages have a canonical shape for security validation and processing.
  """

  @doc """
  Normalize a message to canonical shape expected by NonceBloom and other components.

  Flattens security headers from nested structures to top-level for NonceBloom validation.

  Expected canonical shape:
  %{
    "headers" => %{...},
    "payload" => %{...},
    "_nonce" => "...",
    "_timestamp" => 123456789,
    "_site" => "node@host", 
    "_signature" => "..."
  }
  """
  def normalize(message) when is_map(message) do
    message
    |> flatten_security_headers()
  end

  def normalize(binary) when is_binary(binary) do
    case Jason.decode(binary) do
      {:ok, decoded} -> decoded
      {:error, _} -> %{"payload" => binary}
    end
  end

  def normalize(other) do
    %{"payload" => other}
  end

  @doc """
  Extract payload from normalized message, stripping transport metadata.
  """
  def extract_payload(%{"payload" => payload}), do: payload
  def extract_payload(message), do: message

  @doc """
  Check if message has security envelope (NonceBloom headers).
  """
  def has_security_envelope?(message) do
    Map.has_key?(message, "_nonce") and
      Map.has_key?(message, "_timestamp") and
      Map.has_key?(message, "_signature")
  end

  @doc """
  Get message type from various possible locations.
  """
  def get_type(%{"type" => type}), do: type
  def get_type(%{"payload" => %{"type" => type}}), do: type
  def get_type(%{"headers" => %{"type" => type}}), do: type
  def get_type(_), do: nil

  # Private functions

  @doc """
  Flatten security headers from nested structures to top-level for NonceBloom compatibility.

  Handles these nesting patterns:
  - Already flat: %{"_nonce" => "...", "_timestamp" => ...}
  - Nested in headers: %{"headers" => %{"security" => %{"_nonce" => "...", ...}}}
  - Nested in security: %{"security" => %{"_nonce" => "...", ...}}
  - AMQP headers format: %{"headers" => %{"_nonce" => "...", ...}}
  """
  def flatten_security_headers(message) when is_map(message) do
    security_keys = ["_nonce", "_timestamp", "_site", "_signature", "_retries"]

    # Check if security headers are already at top level
    message_with_security =
      if Enum.any?(security_keys, &Map.has_key?(message, &1)) do
        message
      else
        # Try to find security headers in nested structures
        flattened_security = extract_security_from_nested(message, security_keys)
        Map.merge(message, flattened_security)
      end

    # Only normalize _retries if it already exists
    if Map.has_key?(message_with_security, "_retries") do
      Map.update(message_with_security, "_retries", 0, fn
        nil ->
          0

        n when is_integer(n) ->
          n

        s when is_binary(s) ->
          case Integer.parse(s) do
            {n, _} -> n
            _ -> 0
          end

        _ ->
          0
      end)
    else
      message_with_security
    end
  end

  defp extract_security_from_nested(message, security_keys) do
    # Pattern 1: headers.security.*
    security_from_headers_security =
      get_in(message, ["headers", "security"])
      |> extract_security_keys(security_keys)

    # Pattern 2: security.*  
    security_from_security =
      Map.get(message, "security", %{})
      |> extract_security_keys(security_keys)

    # Pattern 3: headers.*
    security_from_headers =
      Map.get(message, "headers", %{})
      |> extract_security_keys(security_keys)

    # Merge in priority order: headers.security > security > headers
    %{}
    |> Map.merge(security_from_headers)
    |> Map.merge(security_from_security)
    |> Map.merge(security_from_headers_security)
  end

  defp extract_security_keys(nil, _keys), do: %{}

  defp extract_security_keys(source, security_keys) when is_map(source) do
    Map.take(source, security_keys)
  end

  defp extract_security_keys(_, _), do: %{}
end
