defmodule Cybernetic.Storage.ContentTypeTest do
  use ExUnit.Case, async: true

  alias Cybernetic.Storage.ContentType

  describe "from_path/1" do
    test "detects common text formats" do
      assert ContentType.from_path("file.json") == "application/json"
      assert ContentType.from_path("file.txt") == "text/plain"
      assert ContentType.from_path("file.html") == "text/html"
      assert ContentType.from_path("file.css") == "text/css"
      assert ContentType.from_path("file.md") == "text/markdown"
      assert ContentType.from_path("file.xml") == "application/xml"
    end

    test "detects image formats" do
      assert ContentType.from_path("image.png") == "image/png"
      assert ContentType.from_path("image.jpg") == "image/jpeg"
      assert ContentType.from_path("image.jpeg") == "image/jpeg"
      assert ContentType.from_path("image.gif") == "image/gif"
      assert ContentType.from_path("image.svg") == "image/svg+xml"
      assert ContentType.from_path("image.webp") == "image/webp"
    end

    test "detects archive formats" do
      assert ContentType.from_path("archive.zip") == "application/zip"
      assert ContentType.from_path("archive.gz") == "application/gzip"
      assert ContentType.from_path("archive.tar") == "application/x-tar"
    end

    test "handles uppercase extensions" do
      assert ContentType.from_path("FILE.JSON") == "application/json"
      assert ContentType.from_path("IMAGE.PNG") == "image/png"
    end

    test "handles paths with directories" do
      assert ContentType.from_path("path/to/file.json") == "application/json"
      assert ContentType.from_path("/absolute/path/image.png") == "image/png"
    end

    test "returns default for unknown extensions" do
      assert ContentType.from_path("file.unknown") == "application/octet-stream"
      assert ContentType.from_path("no_extension") == "application/octet-stream"
    end

    test "handles nil and empty strings" do
      assert ContentType.from_path(nil) == "application/octet-stream"
      assert ContentType.from_path("") == "application/octet-stream"
    end
  end

  describe "from_content/1" do
    test "detects PNG from magic bytes" do
      # PNG signature: 89 50 4E 47 0D 0A 1A 0A
      png_header = <<0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00>>
      assert ContentType.from_content(png_header) == "image/png"
    end

    test "detects JPEG from magic bytes" do
      # JPEG signature: FF D8 FF
      jpeg_header = <<0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10>>
      assert ContentType.from_content(jpeg_header) == "image/jpeg"
    end

    test "detects GIF from magic bytes" do
      # GIF signature: 47 49 46 38 (GIF8)
      gif_header = <<0x47, 0x49, 0x46, 0x38, 0x39, 0x61>>
      assert ContentType.from_content(gif_header) == "image/gif"
    end

    test "detects ZIP from magic bytes" do
      # ZIP signature: 50 4B 03 04
      zip_header = <<0x50, 0x4B, 0x03, 0x04, 0x00, 0x00>>
      assert ContentType.from_content(zip_header) == "application/zip"
    end

    test "detects PDF from magic bytes" do
      # PDF signature: 25 50 44 46 (%PDF)
      pdf_header = <<0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34>>
      assert ContentType.from_content(pdf_header) == "application/pdf"
    end

    test "detects GZIP from magic bytes" do
      # GZIP signature: 1F 8B
      gzip_header = <<0x1F, 0x8B, 0x08, 0x00, 0x00, 0x00>>
      assert ContentType.from_content(gzip_header) == "application/gzip"
    end

    test "detects WebAssembly from magic bytes" do
      # WASM signature: 00 61 73 6D
      wasm_header = <<0x00, 0x61, 0x73, 0x6D, 0x01, 0x00, 0x00, 0x00>>
      assert ContentType.from_content(wasm_header) == "application/wasm"
    end

    test "returns default for unknown content" do
      assert ContentType.from_content("plain text content") == "application/octet-stream"
      assert ContentType.from_content(<<1, 2, 3, 4, 5, 6>>) == "application/octet-stream"
    end

    test "handles short content" do
      assert ContentType.from_content(<<1, 2>>) == "application/octet-stream"
      assert ContentType.from_content(<<>>) == "application/octet-stream"
    end
  end

  describe "detect/2" do
    test "prefers content-based detection when signature matches" do
      # PNG content but .txt extension - should detect as PNG
      png_header = <<0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00>>
      assert ContentType.detect("file.txt", png_header) == "image/png"
    end

    test "falls back to extension when content is unknown" do
      # Unknown binary content with .json extension
      assert ContentType.detect("data.json", <<1, 2, 3, 4, 5, 6>>) == "application/json"
    end

    test "returns default when both are unknown" do
      assert ContentType.detect("file.xyz", <<1, 2, 3, 4, 5, 6>>) == "application/octet-stream"
    end
  end

  describe "text?/1" do
    test "identifies text types" do
      assert ContentType.text?("text/plain")
      assert ContentType.text?("text/html")
      assert ContentType.text?("text/css")
      assert ContentType.text?("application/json")
      assert ContentType.text?("application/xml")
      assert ContentType.text?("application/javascript")
      assert ContentType.text?("application/x-yaml")
    end

    test "rejects binary types" do
      refute ContentType.text?("image/png")
      refute ContentType.text?("application/zip")
      refute ContentType.text?("application/octet-stream")
      refute ContentType.text?("video/mp4")
    end
  end

  describe "binary?/1" do
    test "identifies binary types" do
      assert ContentType.binary?("image/png")
      assert ContentType.binary?("application/zip")
      assert ContentType.binary?("application/octet-stream")
    end

    test "rejects text types" do
      refute ContentType.binary?("text/plain")
      refute ContentType.binary?("application/json")
    end
  end

  describe "extension/1" do
    test "returns extension for known types" do
      assert ContentType.extension("application/json") == ".json"
      assert ContentType.extension("image/png") == ".png"
      assert ContentType.extension("text/plain") == ".txt"
    end

    test "returns nil for unknown types" do
      assert ContentType.extension("application/x-custom") == nil
    end
  end
end
