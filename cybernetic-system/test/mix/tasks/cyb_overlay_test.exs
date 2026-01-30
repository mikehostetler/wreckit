defmodule Mix.Tasks.Cyb.OverlayTest do
  use ExUnit.Case
  import ExUnit.CaptureIO

  @static_data %{
    "traces" => [
      %{
        "functions" => [
          %{
            "module" => "Elixir.TestModule",
            "function" => "public_func",
            "arity" => 1,
            "file" => "lib/test.ex",
            "line" => 10,
            "type" => "public"
          },
          %{
            "module" => "Elixir.TestModule",
            "function" => "unused_func",
            "arity" => 0,
            "file" => "lib/test.ex",
            "line" => 15,
            "type" => "public"
          }
        ]
      }
    ],
    "orphan_functions" => []
  }

  @dynamic_data %{
    "traces" => [
      %{
        "trace_id" => "test123",
        "spans" => [
          %{
            "module" => "Elixir.TestModule",
            "function" => "public_func",
            "arity" => 1,
            "file" => "lib/test.ex",
            "line" => 10,
            "timestamp" => 1234567890,
            "duration_us" => 100
          },
          %{
            "module" => "Elixir.DynamicModule",
            "function" => "dynamic_func",
            "arity" => 2,
            "file" => "lib/dynamic.ex",
            "line" => 5,
            "timestamp" => 1234567891,
            "duration_us" => 50
          }
        ]
      }
    ]
  }

  describe "run/1" do
    setup do
      # Create temporary files with test data
      static_path = System.tmp_dir!() |> Path.join("test_static.json")
      dynamic_path = System.tmp_dir!() |> Path.join("test_dynamic.json")

      File.write!(static_path, Jason.encode!(@static_data))
      File.write!(dynamic_path, Jason.encode!(@dynamic_data))

      on_exit(fn ->
        File.rm(static_path)
        File.rm(dynamic_path)
      end)

      {:ok, static_path: static_path, dynamic_path: dynamic_path}
    end

    test "runs successfully with default options", context do
      # Run the task
      Mix.Tasks.Cyb.Overlay.run(
        ~w(--static=#{context.static_path} --dynamic=#{context.dynamic_path})
      )

      # If we get here without error, the task ran successfully
      assert true
    end

    test "parses command line arguments", context do
      output =
        capture_io(fn ->
          Mix.Tasks.Cyb.Overlay.run(
            ~w(--static=#{context.static_path} --dynamic=#{context.dynamic_path} --format=json)
          )
        end)

      # Should output valid JSON
      assert {:ok, _data} = Jason.decode(output)
    end

    test "handles custom input files", context do
      Mix.Tasks.Cyb.Overlay.run(
        ~w(--static=#{context.static_path} --dynamic=#{context.dynamic_path})
      )

      assert true
    end

    test "handles custom thresholds", context do
      Mix.Tasks.Cyb.Overlay.run(
        ~w(--static=#{context.static_path} --dynamic=#{context.dynamic_path} --hot-threshold=80 --cold-threshold=20)
      )

      assert true
    end

    test "generates valid JSON output", context do
      output =
        capture_io(fn ->
          Mix.Tasks.Cyb.Overlay.run(
            ~w(--static=#{context.static_path} --dynamic=#{context.dynamic_path} --format=json)
          )
        end)

      assert {:ok, data} = Jason.decode(output)
      assert Map.has_key?(data, "summary")
      assert Map.has_key?(data, "dead_code")
      assert Map.has_key?(data, "ghost_paths")
      assert Map.has_key?(data, "module_coverage")
    end

    test "writes to specified file", context do
      output_path = System.tmp_dir!() |> Path.join("overlay_output.json")

      capture_io(fn ->
        Mix.Tasks.Cyb.Overlay.run(
          ~w(--static=#{context.static_path} --dynamic=#{context.dynamic_path} --output=#{output_path})
        )
      end)

      assert File.exists?(output_path)

      {:ok, content} = File.read(output_path)
      assert {:ok, _data} = Jason.decode(content)

      File.rm!(output_path)
    end

    test "raises error for unknown format", context do
      assert_raise Mix.Error, ~r/Unknown format/, fn ->
        capture_io(fn ->
          Mix.Tasks.Cyb.Overlay.run(
            ~w(--static=#{context.static_path} --dynamic=#{context.dynamic_path} --format=xml)
          )
        end)
      end
    end
  end
end
