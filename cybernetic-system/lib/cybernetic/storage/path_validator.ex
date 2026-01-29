defmodule Cybernetic.Storage.PathValidator do
  @moduledoc """
  Path validation and sanitization for storage operations.

  Provides security functions to prevent directory traversal attacks
  and validate storage paths.

  ## Security

  All paths are validated against:
  - Directory traversal (`..`, absolute paths)
  - Null bytes and special characters
  - Path length limits
  - Reserved names

  ## Example

      iex> validate_path("valid/path/file.txt")
      {:ok, "valid/path/file.txt"}

      iex> validate_path("../escape/attempt")
      {:error, :path_traversal}
  """

  @max_path_length 1024
  @max_component_length 255

  # Reserved filenames on Windows (prevent cross-platform issues)
  @reserved_names ~w(CON PRN AUX NUL COM1 COM2 COM3 COM4 COM5 COM6 COM7 COM8 COM9 LPT1 LPT2 LPT3 LPT4 LPT5 LPT6 LPT7 LPT8 LPT9)

  @type path :: String.t()
  @type error :: :invalid_path | :path_traversal | :reserved_name | :path_too_long

  @doc """
  Validate and sanitize a storage path.

  ## Parameters

    * `path` - Path to validate

  ## Returns

    * `{:ok, sanitized_path}` - Valid, sanitized path
    * `{:error, reason}` - Error with reason
  """
  @spec validate_path(path()) :: {:ok, path()} | {:error, error()}
  def validate_path(nil), do: {:error, :invalid_path}
  def validate_path(""), do: {:error, :invalid_path}

  def validate_path(path) when is_binary(path) do
    with :ok <- check_null_bytes(path),
         :ok <- check_path_length(path),
         sanitized <- sanitize_path(path),
         :ok <- check_traversal(sanitized),
         :ok <- check_reserved_names(sanitized),
         :ok <- check_components(sanitized) do
      {:ok, sanitized}
    end
  end

  def validate_path(_), do: {:error, :invalid_path}

  @doc """
  Validate a tenant ID.

  Tenant IDs must be alphanumeric with hyphens/underscores.

  ## Parameters

    * `tenant_id` - Tenant ID to validate

  ## Returns

    * `{:ok, tenant_id}` - Valid tenant ID
    * `{:error, :invalid_tenant}` - Invalid tenant ID
  """
  @spec validate_tenant(String.t()) :: {:ok, String.t()} | {:error, :invalid_tenant}
  def validate_tenant(nil), do: {:error, :invalid_tenant}
  def validate_tenant(""), do: {:error, :invalid_tenant}

  def validate_tenant(tenant_id) when is_binary(tenant_id) do
    if String.match?(tenant_id, ~r/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$/) do
      {:ok, tenant_id}
    else
      {:error, :invalid_tenant}
    end
  end

  def validate_tenant(_), do: {:error, :invalid_tenant}

  @doc """
  Build a safe full path from tenant and relative path.

  ## Parameters

    * `base_path` - Base storage directory
    * `tenant_id` - Tenant identifier
    * `path` - Relative path within tenant

  ## Returns

    * `{:ok, full_path}` - Full validated path
    * `{:error, reason}` - Error with reason
  """
  @spec build_path(path(), String.t(), path()) :: {:ok, path()} | {:error, error()}
  def build_path(base_path, tenant_id, path) do
    with {:ok, valid_tenant} <- validate_tenant(tenant_id),
         {:ok, valid_path} <- validate_path(path) do
      full_path = Path.join([base_path, valid_tenant, valid_path])

      # Double-check the final path doesn't escape base
      if path_within_base?(full_path, base_path) do
        {:ok, full_path}
      else
        {:error, :path_traversal}
      end
    end
  end

  @doc """
  Check if a path is within a base directory.

  ## Parameters

    * `path` - Path to check
    * `base` - Base directory

  ## Returns

    * `true` if path is within base
    * `false` otherwise
  """
  @spec path_within_base?(path(), path()) :: boolean()
  def path_within_base?(path, base) do
    expanded_path = Path.expand(path)
    expanded_base = Path.expand(base)

    String.starts_with?(expanded_path, expanded_base <> "/") or
      expanded_path == expanded_base
  end

  # Private functions

  defp check_null_bytes(path) do
    if String.contains?(path, <<0>>) do
      {:error, :invalid_path}
    else
      :ok
    end
  end

  defp check_path_length(path) do
    if String.length(path) > @max_path_length do
      {:error, :path_too_long}
    else
      :ok
    end
  end

  defp sanitize_path(path) do
    path
    # Remove leading/trailing whitespace
    |> String.trim()
    # Normalize path separators
    |> String.replace(~r/[\\\/]+/, "/")
    # Remove leading slashes (make relative)
    |> String.trim_leading("/")
    # Remove trailing slashes
    |> String.trim_trailing("/")
  end

  defp check_traversal(path) do
    components = String.split(path, "/")

    cond do
      # Check for .. components
      Enum.any?(components, &(&1 == "..")) ->
        {:error, :path_traversal}

      # Check for empty components (double slashes)
      Enum.any?(components, &(&1 == "")) ->
        {:error, :invalid_path}

      # Check for absolute path indicators
      String.match?(path, ~r/^[a-zA-Z]:/) ->
        {:error, :path_traversal}

      true ->
        :ok
    end
  end

  defp check_reserved_names(path) do
    components = String.split(path, "/")

    reserved? =
      Enum.any?(components, fn component ->
        # Extract base name without extension
        base_name =
          component
          |> String.split(".")
          |> List.first()
          |> String.upcase()

        base_name in @reserved_names
      end)

    if reserved? do
      {:error, :reserved_name}
    else
      :ok
    end
  end

  defp check_components(path) do
    components = String.split(path, "/")

    valid? =
      Enum.all?(components, fn component ->
        # Check component length
        # Check for valid characters
        String.length(component) <= @max_component_length and
          String.match?(component, ~r/^[a-zA-Z0-9._-]+$/)
      end)

    if valid? do
      :ok
    else
      {:error, :invalid_path}
    end
  end
end
