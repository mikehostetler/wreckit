defmodule Cybernetic.Storage.ContentType do
  @moduledoc """
  Content type detection for storage artifacts.

  Provides consistent MIME type detection across all storage adapters
  based on file extensions and magic bytes.

  ## Usage

      iex> ContentType.from_path("data.json")
      "application/json"

      iex> ContentType.from_content(<<0x89, 0x50, 0x4E, 0x47, rest::binary>>)
      "image/png"
  """

  @type mime_type :: String.t()

  # Extension to MIME type mapping
  @extension_map %{
    # Text
    ".txt" => "text/plain",
    ".html" => "text/html",
    ".htm" => "text/html",
    ".css" => "text/css",
    ".csv" => "text/csv",
    ".md" => "text/markdown",
    ".markdown" => "text/markdown",

    # Application
    ".json" => "application/json",
    ".xml" => "application/xml",
    ".js" => "application/javascript",
    ".mjs" => "application/javascript",
    ".pdf" => "application/pdf",
    ".zip" => "application/zip",
    ".gz" => "application/gzip",
    ".tar" => "application/x-tar",
    ".wasm" => "application/wasm",
    ".yaml" => "application/x-yaml",
    ".yml" => "application/x-yaml",
    ".toml" => "application/toml",

    # Images
    ".png" => "image/png",
    ".jpg" => "image/jpeg",
    ".jpeg" => "image/jpeg",
    ".gif" => "image/gif",
    ".svg" => "image/svg+xml",
    ".webp" => "image/webp",
    ".ico" => "image/x-icon",
    ".bmp" => "image/bmp",

    # Audio
    ".mp3" => "audio/mpeg",
    ".wav" => "audio/wav",
    ".ogg" => "audio/ogg",
    ".m4a" => "audio/mp4",
    ".flac" => "audio/flac",

    # Video
    ".mp4" => "video/mp4",
    ".webm" => "video/webm",
    ".avi" => "video/x-msvideo",
    ".mov" => "video/quicktime",

    # Fonts
    ".woff" => "font/woff",
    ".woff2" => "font/woff2",
    ".ttf" => "font/ttf",
    ".otf" => "font/otf",

    # Archives
    ".7z" => "application/x-7z-compressed",
    ".rar" => "application/vnd.rar",
    ".bz2" => "application/x-bzip2",
    ".xz" => "application/x-xz"
  }

  # Magic byte signatures for content detection
  # Format: {signature, type} or {signature, type, :validation_tag}
  @magic_signatures [
    # Images
    {<<0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A>>, "image/png"},
    {<<0xFF, 0xD8, 0xFF>>, "image/jpeg"},
    {<<0x47, 0x49, 0x46, 0x38>>, "image/gif"},
    {<<"RIFF">>, "image/webp", :check_webp},

    # Archives
    {<<0x50, 0x4B, 0x03, 0x04>>, "application/zip"},
    {<<0x1F, 0x8B>>, "application/gzip"},
    {<<0x42, 0x5A, 0x68>>, "application/x-bzip2"},
    {<<0xFD, 0x37, 0x7A, 0x58, 0x5A, 0x00>>, "application/x-xz"},

    # Documents
    {<<0x25, 0x50, 0x44, 0x46>>, "application/pdf"},

    # WebAssembly
    {<<0x00, 0x61, 0x73, 0x6D>>, "application/wasm"},

    # Audio/Video
    {<<"ID3">>, "audio/mpeg"},
    {<<0xFF, 0xFB>>, "audio/mpeg"},
    {<<0xFF, 0xFA>>, "audio/mpeg"},
    {<<"OggS">>, "audio/ogg"},
    {<<"fLaC">>, "audio/flac"},
    {<<"RIFF">>, "audio/wav", :check_wave}
  ]

  @default_type "application/octet-stream"

  @doc """
  Detect content type from file path extension.

  ## Parameters

    * `path` - File path or name

  ## Returns

    MIME type string, defaults to "application/octet-stream"

  ## Example

      iex> ContentType.from_path("data/file.json")
      "application/json"

      iex> ContentType.from_path("unknown.xyz")
      "application/octet-stream"
  """
  @spec from_path(String.t()) :: mime_type()
  def from_path(path) when is_binary(path) do
    ext =
      path
      |> Path.extname()
      |> String.downcase()

    Map.get(@extension_map, ext, @default_type)
  end

  def from_path(_), do: @default_type

  @doc """
  Detect content type from file content using magic bytes.

  Examines the first bytes of content to determine file type.
  Falls back to default type if no signature matches.

  ## Parameters

    * `content` - Binary content (at least first 16 bytes recommended)

  ## Returns

    MIME type string

  ## Example

      iex> ContentType.from_content(<<0x89, 0x50, 0x4E, 0x47, ...>>)
      "image/png"
  """
  @spec from_content(binary()) :: mime_type()
  def from_content(content) when is_binary(content) and byte_size(content) >= 4 do
    # Check first 32 bytes for magic signatures
    header = binary_part(content, 0, min(byte_size(content), 32))

    Enum.find_value(@magic_signatures, @default_type, fn
      {signature, type} when is_binary(signature) ->
        if String.starts_with?(header, signature), do: type

      {signature, type, validation_tag} when is_atom(validation_tag) ->
        if String.starts_with?(header, signature) and validate_signature(validation_tag, header) do
          type
        end

      _ ->
        nil
    end)
  end

  def from_content(_), do: @default_type

  # Validation functions for signatures that need additional checks
  defp validate_signature(:check_webp, data), do: String.contains?(data, "WEBP")
  defp validate_signature(:check_wave, data), do: String.contains?(data, "WAVE")
  defp validate_signature(_, _), do: true

  @doc """
  Detect content type using both path and content.

  Prefers content-based detection for accuracy, falls back to extension.

  ## Parameters

    * `path` - File path
    * `content` - Binary content

  ## Returns

    MIME type string
  """
  @spec detect(String.t(), binary()) :: mime_type()
  def detect(path, content) when is_binary(content) and byte_size(content) >= 4 do
    case from_content(content) do
      @default_type -> from_path(path)
      detected -> detected
    end
  end

  def detect(path, _content), do: from_path(path)

  @doc """
  Check if content type is text-based.

  ## Example

      iex> ContentType.text?("application/json")
      true

      iex> ContentType.text?("image/png")
      false
  """
  @spec text?(mime_type()) :: boolean()
  def text?(type) do
    String.starts_with?(type, "text/") or
      type in [
        "application/json",
        "application/xml",
        "application/javascript",
        "application/x-yaml",
        "application/toml"
      ]
  end

  @doc """
  Check if content type is binary (non-text).
  """
  @spec binary?(mime_type()) :: boolean()
  def binary?(type), do: not text?(type)

  @doc """
  Get file extension for a content type.

  ## Example

      iex> ContentType.extension("application/json")
      ".json"
  """
  @spec extension(mime_type()) :: String.t() | nil
  def extension(type) do
    @extension_map
    |> Enum.find(fn {_, v} -> v == type end)
    |> case do
      {ext, _} -> ext
      nil -> nil
    end
  end

  @doc """
  List all supported extensions.
  """
  @spec supported_extensions() :: [String.t()]
  def supported_extensions, do: Map.keys(@extension_map)

  @doc """
  List all supported MIME types.
  """
  @spec supported_types() :: [mime_type()]
  def supported_types, do: Map.values(@extension_map) |> Enum.uniq()
end
