defmodule Cybernetic.Validation do
  @moduledoc """
  Input validation utilities for the Cybernetic platform.

  Provides consistent validation across all modules for:
  - UUIDs and identifiers
  - Tenant IDs
  - IP addresses
  - Content and strings

  ## Usage

      iex> Validation.valid_uuid?("550e8400-e29b-41d4-a716-446655440000")
      true

      iex> Validation.validate_tenant_id("tenant-1")
      {:ok, "tenant-1"}

      iex> Validation.validate_tenant_id("../escape")
      {:error, :invalid_tenant_id}
  """

  alias Cybernetic.Config

  @type validation_error ::
          :invalid_uuid
          | :invalid_tenant_id
          | :invalid_ip
          | :content_too_long
          | :invalid_format

  # ============================================================================
  # UUID Validation
  # ============================================================================

  @doc """
  Check if a string is a valid UUID v4.

  ## Example

      iex> Validation.valid_uuid?("550e8400-e29b-41d4-a716-446655440000")
      true

      iex> Validation.valid_uuid?("not-a-uuid")
      false
  """
  @spec valid_uuid?(String.t()) :: boolean()
  def valid_uuid?(value) when is_binary(value) do
    Regex.match?(Config.uuid_pattern(), value)
  end

  def valid_uuid?(_), do: false

  @doc """
  Validate and return UUID or error.
  """
  @spec validate_uuid(String.t()) :: {:ok, String.t()} | {:error, :invalid_uuid}
  def validate_uuid(value) do
    if valid_uuid?(value) do
      {:ok, value}
    else
      {:error, :invalid_uuid}
    end
  end

  @doc """
  Validate UUID, raising on invalid input.
  """
  @spec validate_uuid!(String.t()) :: String.t()
  def validate_uuid!(value) do
    case validate_uuid(value) do
      {:ok, uuid} -> uuid
      {:error, _} -> raise ArgumentError, "Invalid UUID: #{inspect(value)}"
    end
  end

  # ============================================================================
  # Tenant ID Validation
  # ============================================================================

  @doc """
  Check if a string is a valid tenant ID.

  Tenant IDs must:
  - Start with alphanumeric character
  - Contain only alphanumeric, hyphens, underscores
  - Be 1-63 characters long

  ## Example

      iex> Validation.valid_tenant_id?("tenant-1")
      true

      iex> Validation.valid_tenant_id?("../escape")
      false
  """
  @spec valid_tenant_id?(String.t()) :: boolean()
  def valid_tenant_id?(value) when is_binary(value) do
    Regex.match?(Config.tenant_id_pattern(), value)
  end

  def valid_tenant_id?(_), do: false

  @doc """
  Validate and return tenant ID or error.
  """
  @spec validate_tenant_id(String.t()) :: {:ok, String.t()} | {:error, :invalid_tenant_id}
  def validate_tenant_id(value) do
    if valid_tenant_id?(value) do
      {:ok, value}
    else
      {:error, :invalid_tenant_id}
    end
  end

  # ============================================================================
  # IP Address Validation
  # ============================================================================

  @doc """
  Parse and validate an IP address from X-Forwarded-For header.

  Only trusts the rightmost IP in the chain (closest to our proxy).
  Validates the IP format before returning.

  ## Parameters

    * `header_value` - The X-Forwarded-For header value
    * `trusted_proxies` - List of trusted proxy CIDR ranges (optional)

  ## Example

      iex> Validation.parse_forwarded_ip("203.0.113.195, 70.41.3.18, 150.172.238.178")
      {:ok, "150.172.238.178"}

      iex> Validation.parse_forwarded_ip("not-an-ip")
      {:error, :invalid_ip}
  """
  @spec parse_forwarded_ip(String.t(), [String.t()]) :: {:ok, String.t()} | {:error, :invalid_ip}
  def parse_forwarded_ip(header_value, _trusted_proxies \\ []) when is_binary(header_value) do
    # Take the rightmost IP (closest to our infrastructure)
    ip =
      header_value
      |> String.split(",")
      |> Enum.map(&String.trim/1)
      |> List.last()

    if ip && valid_ip?(ip) do
      {:ok, ip}
    else
      {:error, :invalid_ip}
    end
  end

  @doc """
  Check if a string is a valid IPv4 or IPv6 address.
  """
  @spec valid_ip?(String.t()) :: boolean()
  def valid_ip?(ip) when is_binary(ip) do
    case :inet.parse_address(String.to_charlist(ip)) do
      {:ok, _} -> true
      {:error, _} -> false
    end
  end

  def valid_ip?(_), do: false

  @doc """
  Get client IP from connection, safely handling proxies.

  ## Parameters

    * `conn` - Plug.Conn struct
    * `trust_proxy` - Whether to trust X-Forwarded-For (default: false in prod)

  ## Returns

    IP address string
  """
  @spec get_client_ip(Plug.Conn.t(), boolean()) :: String.t()
  def get_client_ip(conn, trust_proxy \\ false) do
    if trust_proxy do
      case Plug.Conn.get_req_header(conn, "x-forwarded-for") do
        [header | _] ->
          case parse_forwarded_ip(header) do
            {:ok, ip} -> ip
            {:error, _} -> format_remote_ip(conn.remote_ip)
          end

        [] ->
          format_remote_ip(conn.remote_ip)
      end
    else
      format_remote_ip(conn.remote_ip)
    end
  end

  defp format_remote_ip(ip_tuple) do
    ip_tuple |> :inet.ntoa() |> to_string()
  end

  # ============================================================================
  # Content Validation
  # ============================================================================

  @doc """
  Truncate content to maximum length with indicator.

  ## Parameters

    * `content` - String content to truncate
    * `max_length` - Maximum length (default: from config)
    * `indicator` - Truncation indicator (default: "[TRUNCATED]")

  ## Returns

    Truncated string

  ## Example

      iex> Validation.truncate_content("very long text...", 10)
      "very long [TRUNCATED]"
  """
  @spec truncate_content(String.t(), pos_integer(), String.t()) :: String.t()
  def truncate_content(content, max_length \\ nil, indicator \\ "\n[TRUNCATED]")
      when is_binary(content) do
    max = max_length || Config.llm_max_content_length()

    if String.length(content) > max do
      String.slice(content, 0, max) <> indicator
    else
      content
    end
  end

  @doc """
  Validate content length.
  """
  @spec validate_content_length(String.t(), pos_integer()) ::
          {:ok, String.t()} | {:error, :content_too_long}
  def validate_content_length(content, max_length) when is_binary(content) do
    if String.length(content) <= max_length do
      {:ok, content}
    else
      {:error, :content_too_long}
    end
  end

  # ============================================================================
  # Atom Safety
  # ============================================================================

  @doc """
  Safely convert string to existing atom with validation.

  ## Parameters

    * `string` - String to convert
    * `allowed` - List of allowed atom values

  ## Returns

    `{:ok, atom}` or `{:error, :invalid_value}`

  ## Example

      iex> Validation.safe_to_atom("full", [:full, :summary])
      {:ok, :full}

      iex> Validation.safe_to_atom("invalid", [:full, :summary])
      {:error, :invalid_value}
  """
  @spec safe_to_atom(String.t(), [atom()]) :: {:ok, atom()} | {:error, :invalid_value}
  def safe_to_atom(string, allowed) when is_binary(string) and is_list(allowed) do
    # Convert allowed atoms to strings for comparison
    allowed_strings = Enum.map(allowed, &Atom.to_string/1)

    if string in allowed_strings do
      {:ok, String.to_existing_atom(string)}
    else
      {:error, :invalid_value}
    end
  rescue
    ArgumentError -> {:error, :invalid_value}
  end

  def safe_to_atom(_, _), do: {:error, :invalid_value}

  # ============================================================================
  # JSON Validation
  # ============================================================================

  @doc """
  Safely decode JSON with error handling.
  """
  @spec safe_json_decode(String.t()) :: {:ok, term()} | {:error, :invalid_json}
  def safe_json_decode(string) when is_binary(string) do
    case Jason.decode(string) do
      {:ok, decoded} -> {:ok, decoded}
      {:error, _} -> {:error, :invalid_json}
    end
  end

  def safe_json_decode(_), do: {:error, :invalid_json}

  @doc """
  Extract JSON from potentially mixed content (e.g., LLM response).

  ## Example

      iex> Validation.extract_json("Here is the result: {\"key\": \"value\"} and more text")
      {:ok, %{"key" => "value"}}
  """
  @spec extract_json(String.t(), term()) :: {:ok, term()} | {:error, :no_json_found}
  def extract_json(content, default \\ nil) when is_binary(content) do
    # Match JSON objects or arrays
    json_pattern = ~r/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}|\[[^\[\]]*(?:\[[^\[\]]*\][^\[\]]*)*\]/s

    case Regex.run(json_pattern, content) do
      [json_str | _] ->
        case Jason.decode(json_str) do
          {:ok, parsed} -> {:ok, parsed}
          {:error, _} -> if default, do: {:ok, default}, else: {:error, :no_json_found}
        end

      nil ->
        if default, do: {:ok, default}, else: {:error, :no_json_found}
    end
  end
end
