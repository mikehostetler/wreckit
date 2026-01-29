defmodule Cybernetic.Capabilities.Validation do
  @moduledoc """
  Shared validation utilities for Capabilities layer.

  Provides input validation, sanitization, and size limits
  to prevent injection attacks and resource exhaustion.
  """

  @max_name_length 128
  @max_description_length 4096
  # 1MB
  @max_context_size 1_048_576
  # 64KB
  @max_args_size 65_536
  @allowed_name_chars ~r/^[a-zA-Z0-9_\-\.]+$/

  @type validation_error ::
          {:error, :name_too_long}
          | {:error, :description_too_long}
          | {:error, :context_too_large}
          | {:error, :invalid_name_chars}
          | {:error, :args_too_large}
          | {:error, {:missing_field, atom()}}

  @doc """
  Validates required fields are present and non-nil.

  ## Examples

      iex> validate_required(%{name: "test", desc: "x"}, [:name, :desc])
      :ok

      iex> validate_required(%{name: "test"}, [:name, :desc])
      {:error, {:missing_field, :desc}}
  """
  @spec validate_required(map(), [atom()]) :: :ok | {:error, {:missing_field, atom()}}
  def validate_required(attrs, fields) do
    Enum.reduce_while(fields, :ok, fn field, _acc ->
      if Map.has_key?(attrs, field) and attrs[field] != nil do
        {:cont, :ok}
      else
        {:halt, {:error, {:missing_field, field}}}
      end
    end)
  end

  @doc """
  Validates a capability/tool name.
  Must be alphanumeric with underscores, hyphens, dots.
  Max length: #{@max_name_length} chars.

  ## Examples

      iex> validate_name("my_tool")
      :ok

      iex> validate_name("../etc/passwd")
      {:error, :invalid_name_chars}
  """
  @spec validate_name(term()) :: :ok | {:error, :invalid_name_chars | :name_too_long}
  def validate_name(name) when is_binary(name) do
    cond do
      byte_size(name) > @max_name_length ->
        {:error, :name_too_long}

      not Regex.match?(@allowed_name_chars, name) ->
        {:error, :invalid_name_chars}

      true ->
        :ok
    end
  end

  def validate_name(_), do: {:error, :invalid_name_chars}

  @doc """
  Validates a description field.
  Max length: #{@max_description_length} chars.
  """
  @spec validate_description(term()) :: :ok | {:error, :description_too_long}
  def validate_description(desc) when is_binary(desc) do
    if byte_size(desc) > @max_description_length do
      {:error, :description_too_long}
    else
      :ok
    end
  end

  def validate_description(_), do: :ok

  @doc """
  Validates context/payload size to prevent resource exhaustion.
  Max size: #{@max_context_size} bytes.
  """
  @spec validate_context_size(map()) :: :ok | {:error, :context_too_large}
  def validate_context_size(context) when is_map(context) do
    try do
      size = context |> :erlang.term_to_binary() |> byte_size()

      if size > @max_context_size do
        {:error, :context_too_large}
      else
        :ok
      end
    rescue
      _ -> {:error, :context_too_large}
    end
  end

  def validate_context_size(_), do: :ok

  @doc """
  Validates tool arguments size.
  Max size: #{@max_args_size} bytes.
  """
  @spec validate_args_size(map()) :: :ok | {:error, :args_too_large}
  def validate_args_size(args) when is_map(args) do
    try do
      size = args |> :erlang.term_to_binary() |> byte_size()

      if size > @max_args_size do
        {:error, :args_too_large}
      else
        :ok
      end
    rescue
      _ -> {:error, :args_too_large}
    end
  end

  def validate_args_size(_), do: :ok

  @doc """
  Sanitizes a tool name by removing dangerous characters.
  """
  @spec sanitize_name(String.t()) :: String.t()
  def sanitize_name(name) when is_binary(name) do
    name
    |> String.replace(~r/[^a-zA-Z0-9_\-\.]/, "")
    |> String.slice(0, @max_name_length)
  end

  def sanitize_name(_), do: ""

  @doc """
  Validates a URL is http/https and doesn't contain suspicious patterns.
  """
  @spec validate_url(term()) :: :ok | {:error, :invalid_url}
  def validate_url(url) when is_binary(url) do
    case URI.parse(url) do
      %URI{scheme: scheme, host: host}
      when scheme in ["http", "https"] and is_binary(host) and host != "" ->
        # Block localhost/internal IPs in production
        env = Application.get_env(:cybernetic, :environment, :prod)

        if internal_url?(host) and env == :prod do
          {:error, :invalid_url}
        else
          :ok
        end

      _ ->
        {:error, :invalid_url}
    end
  end

  def validate_url(_), do: {:error, :invalid_url}

  @doc """
  Validates tools list is non-empty and all names are valid.
  """
  @spec validate_tools(term()) :: :ok | {:error, :invalid_tools | :invalid_tool_name}
  def validate_tools(tools) when is_list(tools) and length(tools) > 0 do
    Enum.reduce_while(tools, :ok, fn tool, _acc ->
      case validate_name(tool) do
        :ok -> {:cont, :ok}
        {:error, _} -> {:halt, {:error, :invalid_tool_name}}
      end
    end)
  end

  def validate_tools(_), do: {:error, :invalid_tools}

  @doc """
  Validates provider is a valid module atom.
  """
  @spec validate_provider(term()) :: :ok | {:error, :invalid_provider}
  def validate_provider(provider) when is_atom(provider) and not is_nil(provider), do: :ok
  def validate_provider(_), do: {:error, :invalid_provider}

  # Private

  defp internal_url?(host) do
    host in ["localhost", "127.0.0.1", "0.0.0.0"] or
      String.starts_with?(host, "192.168.") or
      String.starts_with?(host, "10.") or
      String.starts_with?(host, "172.16.") or
      String.ends_with?(host, ".local")
  end
end
