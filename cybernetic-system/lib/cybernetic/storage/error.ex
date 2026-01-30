defmodule Cybernetic.Storage.Error do
  @moduledoc """
  Structured error types for storage operations.

  Provides consistent error handling across all storage adapters
  with detailed context for debugging and monitoring.

  ## Error Types

  - `:not_found` - Resource does not exist
  - `:invalid_path` - Path validation failed
  - `:path_traversal` - Security violation detected
  - `:permission_denied` - Access denied
  - `:storage_error` - Backend storage failure
  - `:quota_exceeded` - Storage quota exceeded
  - `:invalid_tenant` - Invalid tenant identifier

  ## Example

      case Cybernetic.Storage.get(tenant, path) do
        {:ok, content} -> process(content)
        {:error, %Cybernetic.Storage.Error{reason: :not_found}} -> handle_missing()
        {:error, %Cybernetic.Storage.Error{} = err} -> Logger.error(Exception.message(err))
      end
  """

  @type reason ::
          :not_found
          | :invalid_path
          | :path_traversal
          | :permission_denied
          | :storage_error
          | :quota_exceeded
          | :invalid_tenant
          | :invalid_content
          | :timeout

  @type t :: %__MODULE__{
          reason: reason(),
          message: String.t(),
          path: String.t() | nil,
          tenant_id: String.t() | nil,
          operation: atom() | nil,
          details: map()
        }

  defexception [
    :reason,
    :message,
    :path,
    :tenant_id,
    :operation,
    details: %{}
  ]

  @impl true
  @spec message(t()) :: String.t()
  def message(%__MODULE__{message: msg}) when is_binary(msg) and msg != "", do: msg

  def message(%__MODULE__{reason: reason, path: path, tenant_id: tenant_id, operation: op}) do
    base = reason_to_message(reason)

    parts =
      [
        if(op, do: "operation=#{op}"),
        if(tenant_id, do: "tenant=#{tenant_id}"),
        if(path, do: "path=#{path}")
      ]
      |> Enum.filter(& &1)

    if parts == [] do
      base
    else
      "#{base} (#{Enum.join(parts, ", ")})"
    end
  end

  @doc """
  Create a new storage error.

  ## Parameters

    * `reason` - Error reason atom
    * `opts` - Additional context

  ## Options

    * `:message` - Custom error message
    * `:path` - File path involved
    * `:tenant_id` - Tenant identifier
    * `:operation` - Operation that failed (`:get`, `:put`, etc.)
    * `:details` - Additional details map

  ## Example

      Storage.Error.new(:not_found, path: "data/file.json", tenant_id: "tenant-1")
  """
  @spec new(reason(), keyword()) :: t()
  def new(reason, opts \\ []) do
    %__MODULE__{
      reason: reason,
      message: Keyword.get(opts, :message, ""),
      path: Keyword.get(opts, :path),
      tenant_id: Keyword.get(opts, :tenant_id),
      operation: Keyword.get(opts, :operation),
      details: Keyword.get(opts, :details, %{})
    }
  end

  @doc """
  Wrap a raw error into a Storage.Error.

  Converts file system errors, network errors, etc. into structured errors.

  ## Example

      case File.read(path) do
        {:ok, content} -> {:ok, content}
        {:error, :enoent} -> {:error, Storage.Error.wrap(:enoent, path: path)}
      end
  """
  @spec wrap(atom() | term(), keyword()) :: t()
  def wrap(:enoent, opts), do: new(:not_found, opts)
  def wrap(:eacces, opts), do: new(:permission_denied, opts)
  def wrap(:enospc, opts), do: new(:quota_exceeded, opts)

  def wrap(:eisdir, opts),
    do: new(:invalid_path, Keyword.put(opts, :message, "Path is a directory"))

  def wrap(:enotdir, opts), do: new(:invalid_path, Keyword.put(opts, :message, "Not a directory"))
  def wrap(:timeout, opts), do: new(:timeout, opts)

  def wrap(reason, opts) when is_atom(reason) do
    new(:storage_error, Keyword.put(opts, :details, %{raw_reason: reason}))
  end

  def wrap(reason, opts) do
    new(:storage_error, Keyword.put(opts, :details, %{raw_reason: inspect(reason)}))
  end

  @doc """
  Convert error to a loggable map for structured logging.
  """
  @spec to_log_metadata(t()) :: keyword()
  def to_log_metadata(%__MODULE__{} = error) do
    [
      error_reason: error.reason,
      error_path: error.path,
      error_tenant: error.tenant_id,
      error_operation: error.operation
    ]
    |> Enum.filter(fn {_, v} -> v != nil end)
  end

  # Private helpers

  defp reason_to_message(:not_found), do: "Resource not found"
  defp reason_to_message(:invalid_path), do: "Invalid path"
  defp reason_to_message(:path_traversal), do: "Path traversal attempt detected"
  defp reason_to_message(:permission_denied), do: "Permission denied"
  defp reason_to_message(:storage_error), do: "Storage operation failed"
  defp reason_to_message(:quota_exceeded), do: "Storage quota exceeded"
  defp reason_to_message(:invalid_tenant), do: "Invalid tenant identifier"
  defp reason_to_message(:invalid_content), do: "Invalid content"
  defp reason_to_message(:timeout), do: "Operation timed out"
  defp reason_to_message(reason), do: "Storage error: #{reason}"
end
