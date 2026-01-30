defmodule Cybernetic.Archeology.OverlayTest do
  use ExUnit.Case
  alias Cybernetic.Archeology.Overlay

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
          },
          %{
            "module" => "Elixir.TestModule",
            "function" => ".",
            "arity" => 2,
            "file" => "lib/test.ex",
            "line" => 20,
            "type" => "unknown"
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

  describe "load_static_data/1" do
    test "loads and parses archeology-results.json" do
      # Create a temporary file with test data
      path = System.tmp_dir!() |> Path.join("test_static.json")
      content = Jason.encode!(@static_data)
      File.write!(path, content)

      result = Overlay.load_static_data(path)

      assert is_map(result)
      assert Map.has_key?(result, "traces")
      assert Map.has_key?(result, "orphan_functions")
      assert length(result["traces"]) == 1

      File.rm!(path)
    end

    test "raises error for non-existent file" do
      assert_raise RuntimeError, ~r/Failed to read/, fn ->
        Overlay.load_static_data("/non/existent/path.json")
      end
    end
  end

  describe "load_dynamic_data/1" do
    test "loads and parses dynamic-traces.json" do
      path = System.tmp_dir!() |> Path.join("test_dynamic.json")
      content = Jason.encode!(@dynamic_data)
      File.write!(path, content)

      result = Overlay.load_dynamic_data(path)

      assert is_map(result)
      assert Map.has_key?(result, "traces")
      assert length(result["traces"]) == 1

      File.rm!(path)
    end

    test "raises error for non-existent file" do
      assert_raise RuntimeError, ~r/Failed to read/, fn ->
        Overlay.load_dynamic_data("/non/existent/path.json")
      end
    end
  end

  describe "normalize_static_functions/1" do
    test "converts static functions to normalized map set" do
      result = Overlay.normalize_static_functions(@static_data)

      assert MapSet.size(result) == 2
      assert MapSet.member?(result, {"Elixir.TestModule", "public_func", 1})
      assert MapSet.member?(result, {"Elixir.TestModule", "unused_func", 0})
      # Unknown type functions should be filtered out
      refute MapSet.member?(result, {"Elixir.TestModule", ".", 2})
    end

    test "handles empty traces" do
      empty_data = %{"traces" => [], "orphan_functions" => []}
      result = Overlay.normalize_static_functions(empty_data)

      assert MapSet.size(result) == 0
    end

    test "filters out unknown type functions" do
      result = Overlay.normalize_static_functions(@static_data)

      # Should only include public and private functions, not unknown
      assert MapSet.size(result) == 2
    end
  end

  describe "normalize_dynamic_spans/1" do
    test "converts dynamic spans to normalized map set" do
      result = Overlay.normalize_dynamic_spans(@dynamic_data)

      assert MapSet.size(result) == 2
      assert MapSet.member?(result, {"Elixir.TestModule", "public_func", 1})
      assert MapSet.member?(result, {"Elixir.DynamicModule", "dynamic_func", 2})
    end

    test "handles empty traces" do
      empty_data = %{"traces" => []}
      result = Overlay.normalize_dynamic_spans(empty_data)

      assert MapSet.size(result) == 0
    end
  end

  describe "group_static_functions_by_module/1" do
    test "groups functions by module name" do
      result = Overlay.group_static_functions_by_module(@static_data)

      assert is_map(result)
      assert Map.has_key?(result, "Elixir.TestModule")
      assert length(result["Elixir.TestModule"]) == 2
    end
  end

  describe "group_dynamic_spans_by_module/1" do
    test "groups spans by module and counts executions" do
      result = Overlay.group_dynamic_spans_by_module(@dynamic_data)

      assert is_map(result)
      assert Map.has_key?(result, "Elixir.TestModule")
      assert Map.has_key?(result, "Elixir.DynamicModule")

      assert result["Elixir.TestModule"][{"Elixir.TestModule", "public_func", 1}] == 1
      assert result["Elixir.DynamicModule"][{"Elixir.DynamicModule", "dynamic_func", 2}] == 1
    end
  end

  describe "detect_dead_code/2" do
    test "computes static minus dynamic set difference" do
      # unused_func/0 is in static but not in dynamic
      dead_code = Overlay.detect_dead_code(@static_data, @dynamic_data)

      assert length(dead_code) == 1
      assert dead_code |> Enum.any?(fn fn_ref ->
        fn_ref["module"] == "Elixir.TestModule" and fn_ref["function"] == "unused_func"
      end)
    end

    test "filters out test functions" do
      static_with_test = %{
        "traces" => [
          %{
            "functions" => [
              %{
                "module" => "Elixir.TestModule",
                "function" => "test_func",
                "arity" => 1,
                "file" => "lib/test.ex",
                "line" => 10,
                "type" => "public"
              },
              %{
                "module" => "Elixir.TestModuleTest",
                "function" => "regular_func",
                "arity" => 0,
                "file" => "test/test.ex",
                "line" => 5,
                "type" => "public"
              }
            ]
          }
        ],
        "orphan_functions" => []
      }

      dead_code = Overlay.detect_dead_code(static_with_test, @dynamic_data)

      # Both test functions should be filtered out
      refute Enum.any?(dead_code, fn fn_ref -> fn_ref["function"] == "test_func" end)
      refute Enum.any?(dead_code, fn fn_ref -> String.contains?(fn_ref["module"], "Test") end)
    end

    test "filters out callback functions" do
      static_with_callbacks = %{
        "traces" => [
          %{
            "functions" => [
              %{
                "module" => "Elixir.MyGenServer",
                "function" => "init",
                "arity" => 1,
                "file" => "lib/server.ex",
                "line" => 10,
                "type" => "public"
              },
              %{
                "module" => "Elixir.MyGenServer",
                "function" => "handle_info",
                "arity" => 2,
                "file" => "lib/server.ex",
                "line" => 15,
                "type" => "public"
              }
            ]
          }
        ],
        "orphan_functions" => []
      }

      dead_code = Overlay.detect_dead_code(static_with_callbacks, @dynamic_data)

      # Callback functions should be filtered out
      refute Enum.any?(dead_code, fn fn_ref -> fn_ref["function"] == "init" end)
      refute Enum.any?(dead_code, fn fn_ref -> fn_ref["function"] == "handle_info" end)
    end

    test "sorts results by module, function, arity" do
      dead_code = Overlay.detect_dead_code(@static_data, @dynamic_data)

      # Should be sorted
      assert length(dead_code) > 0

      # Check sorting
      modules = Enum.map(dead_code, & &1["module"])
      assert modules == Enum.sort(modules)
    end
  end

  describe "is_test_function?/1" do
    test "identifies test functions by module name" do
      test_fn = %{
        "module" => "Elixir.MyAppTest",
        "function" => "regular_func",
        "arity" => 0
      }

      assert Overlay.is_test_function?(test_fn)
    end

    test "identifies test functions by function name" do
      test_fn = %{
        "module" => "Elixir.MyApp",
        "function" => "test_something",
        "arity" => 1
      }

      assert Overlay.is_test_function?(test_fn)
    end

    test "returns false for non-test functions" do
      regular_fn = %{
        "module" => "Elixir.MyApp",
        "function" => "regular_func",
        "arity" => 0
      }

      refute Overlay.is_test_function?(regular_fn)
    end
  end

  describe "is_callback_function?/1" do
    test "identifies GenServer callbacks" do
      callbacks = [
        %{"function" => "init", "arity" => 1},
        %{"function" => "handle_call", "arity" => 3},
        %{"function" => "handle_cast", "arity" => 2},
        %{"function" => "handle_info", "arity" => 2},
        %{"function" => "terminate", "arity" => 2},
        %{"function" => "code_change", "arity" => 3}
      ]

      for callback <- callbacks do
        assert Overlay.is_callback_function?(callback)
      end
    end

    test "returns false for non-callback functions" do
      regular_fn = %{
        "function" => "regular_func",
        "arity" => 0
      }

      refute Overlay.is_callback_function?(regular_fn)
    end
  end

  describe "detect_ghost_paths/2" do
    test "computes dynamic minus static set difference" do
      # DynamicModule.dynamic_func/2 is in dynamic but not in static
      ghost_paths = Overlay.detect_ghost_paths(@static_data, @dynamic_data)

      assert length(ghost_paths) == 1
      assert ghost_paths |> Enum.any?(fn ghost ->
        ghost["module"] == "Elixir.DynamicModule" and ghost["function"] == "dynamic_func"
      end)
    end

    test "tracks execution count" do
      # Add another execution of the same ghost function
      dynamic_with_multiple = %{
        "traces" => [
          %{
            "trace_id" => "test123",
            "spans" => [
              %{
                "module" => "Elixir.DynamicModule",
                "function" => "dynamic_func",
                "arity" => 2,
                "file" => "lib/dynamic.ex",
                "line" => 5,
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

      ghost_paths = Overlay.detect_ghost_paths(@static_data, dynamic_with_multiple)

      assert length(ghost_paths) == 1
      ghost = List.first(ghost_paths)
      assert ghost["execution_count"] == 2
    end

    test "sorts by module, function, arity" do
      ghost_paths = Overlay.detect_ghost_paths(@static_data, @dynamic_data)

      # Should be sorted
      assert length(ghost_paths) > 0

      # Check sorting
      modules = Enum.map(ghost_paths, & &1["module"])
      assert modules == Enum.sort(modules)
    end

    test "returns empty list when all dynamic functions are in static" do
      # Dynamic data with no ghost paths
      dynamic_no_ghosts = %{
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
              }
            ]
          }
        ]
      }

      ghost_paths = Overlay.detect_ghost_paths(@static_data, dynamic_no_ghosts)

      assert length(ghost_paths) == 0
    end
  end

  describe "calculate_coverage/3" do
    test "calculates per-module coverage percentage" do
      coverage = Overlay.calculate_coverage(@static_data, @dynamic_data)

      assert length(coverage) == 1
      module_coverage = List.first(coverage)

      assert module_coverage["module"] == "Elixir.TestModule"
      assert module_coverage["static_function_count"] == 2
      assert module_coverage["dynamic_function_count"] == 1
      assert module_coverage["coverage_pct"] == 50.0
    end

    test "identifies hot modules" do
      # Create data with high coverage
      static_hot = %{
        "traces" => [
          %{
            "functions" => [
              %{
                "module" => "Elixir.HotModule",
                "function" => "func1",
                "arity" => 0,
                "file" => "lib/hot.ex",
                "line" => 1,
                "type" => "public"
              },
              %{
                "module" => "Elixir.HotModule",
                "function" => "func2",
                "arity" => 0,
                "file" => "lib/hot.ex",
                "line" => 2,
                "type" => "public"
              },
              %{
                "module" => "Elixir.HotModule",
                "function" => "func3",
                "arity" => 0,
                "file" => "lib/hot.ex",
                "line" => 3,
                "type" => "public"
              },
              %{
                "module" => "Elixir.HotModule",
                "function" => "func4",
                "arity" => 0,
                "file" => "lib/hot.ex",
                "line" => 4,
                "type" => "public"
              }
            ]
          }
        ]
      }

      dynamic_hot = %{
        "traces" => [
          %{
            "trace_id" => "test",
            "spans" => [
              %{"module" => "Elixir.HotModule", "function" => "func1", "arity" => 0, "file" => "lib/hot.ex", "line" => 1, "timestamp" => 1, "duration_us" => 1},
              %{"module" => "Elixir.HotModule", "function" => "func2", "arity" => 0, "file" => "lib/hot.ex", "line" => 2, "timestamp" => 2, "duration_us" => 1},
              %{"module" => "Elixir.HotModule", "function" => "func3", "arity" => 0, "file" => "lib/hot.ex", "line" => 3, "timestamp" => 3, "duration_us" => 1}
            ]
          }
        ]
      }

      coverage = Overlay.calculate_coverage(static_hot, dynamic_hot)

      module_coverage = List.first(coverage)
      assert module_coverage["coverage_pct"] == 75.0
      assert module_coverage["hot_path"] == true
      assert module_coverage["cold_path"] == false
    end

    test "identifies cold modules" do
      # Create data with low coverage
      static_cold = %{
        "traces" => [
          %{
            "functions" => [
              %{
                "module" => "Elixir.ColdModule",
                "function" => "func1",
                "arity" => 0,
                "file" => "lib/cold.ex",
                "line" => 1,
                "type" => "public"
              },
              %{
                "module" => "Elixir.ColdModule",
                "function" => "func2",
                "arity" => 0,
                "file" => "lib/cold.ex",
                "line" => 2,
                "type" => "public"
              },
              %{
                "module" => "Elixir.ColdModule",
                "function" => "func3",
                "arity" => 0,
                "file" => "lib/cold.ex",
                "line" => 3,
                "type" => "public"
              },
              %{
                "module" => "Elixir.ColdModule",
                "function" => "func4",
                "arity" => 0,
                "file" => "lib/cold.ex",
                "line" => 4,
                "type" => "public"
              }
            ]
          }
        ]
      }

      dynamic_cold = %{
        "traces" => [
          %{
            "trace_id" => "test",
            "spans" => [
              %{"module" => "Elixir.ColdModule", "function" => "func1", "arity" => 0, "file" => "lib/cold.ex", "line" => 1, "timestamp" => 1, "duration_us" => 1}
            ]
          }
        ]
      }

      coverage = Overlay.calculate_coverage(static_cold, dynamic_cold)

      module_coverage = List.first(coverage)
      assert module_coverage["coverage_pct"] == 25.0
      assert module_coverage["hot_path"] == false
      assert module_coverage["cold_path"] == true
    end

    test "handles custom threshold options" do
      coverage = Overlay.calculate_coverage(@static_data, @dynamic_data, hot_threshold: 60, cold_threshold: 40)

      module_coverage = List.first(coverage)
      # With 50% coverage, should be neither hot nor cold with these thresholds
      assert module_coverage["coverage_pct"] == 50.0
      assert module_coverage["hot_path"] == false
      assert module_coverage["cold_path"] == false
    end

    test "sorts by coverage descending, then module name" do
      # Create data with multiple modules
      static_multi = %{
        "traces" => [
          %{
            "functions" => [
              %{"module" => "Elixir.ModuleA", "function" => "func1", "arity" => 0, "file" => "lib/a.ex", "line" => 1, "type" => "public"},
              %{"module" => "Elixir.ModuleB", "function" => "func1", "arity" => 0, "file" => "lib/b.ex", "line" => 1, "type" => "public"},
              %{"module" => "Elixir.ModuleB", "function" => "func2", "arity" => 0, "file" => "lib/b.ex", "line" => 2, "type" => "public"}
            ]
          }
        ]
      }

      dynamic_multi = %{
        "traces" => [
          %{
            "trace_id" => "test",
            "spans" => [
              %{"module" => "Elixir.ModuleA", "function" => "func1", "arity" => 0, "file" => "lib/a.ex", "line" => 1, "timestamp" => 1, "duration_us" => 1},
              %{"module" => "Elixir.ModuleB", "function" => "func1", "arity" => 0, "file" => "lib/b.ex", "line" => 1, "timestamp" => 2, "duration_us" => 1}
            ]
          }
        ]
      }

      coverage = Overlay.calculate_coverage(static_multi, dynamic_multi)

      assert length(coverage) == 2
      # ModuleA has 100% coverage, ModuleB has 50%
      assert List.first(coverage)["module"] == "Elixir.ModuleA"
      assert List.last(coverage)["module"] == "Elixir.ModuleB"
    end

    test "filters out test and callback functions" do
      static_filtered = %{
        "traces" => [
          %{
            "functions" => [
              %{"module" => "Elixir.MyModule", "function" => "regular_func", "arity" => 0, "file" => "lib/my.ex", "line" => 1, "type" => "public"},
              %{"module" => "Elixir.MyModule", "function" => "init", "arity" => 1, "file" => "lib/my.ex", "line" => 2, "type" => "public"},
              %{"module" => "Elixir.MyModuleTest", "function" => "test_func", "arity" => 0, "file" => "lib/my.ex", "line" => 3, "type" => "public"}
            ]
          }
        ]
      }

      dynamic_filtered = %{
        "traces" => [
          %{
            "trace_id" => "test",
            "spans" => [
              %{"module" => "Elixir.MyModule", "function" => "regular_func", "arity" => 0, "file" => "lib/my.ex", "line" => 1, "timestamp" => 1, "duration_us" => 1}
            ]
          }
        ]
      }

      coverage = Overlay.calculate_coverage(static_filtered, dynamic_filtered)

      module_coverage = List.first(coverage)
      # Only regular_func should be counted (1 out of 1 = 100%)
      assert module_coverage["static_function_count"] == 1
      assert module_coverage["dynamic_function_count"] == 1
      assert module_coverage["coverage_pct"] == 100.0
    end
  end

  describe "analyze/1" do
    test "orchestrates full analysis pipeline" do
      # Create temporary files with test data
      static_path = System.tmp_dir!() |> Path.join("analyze_static.json")
      dynamic_path = System.tmp_dir!() |> Path.join("analyze_dynamic.json")

      File.write!(static_path, Jason.encode!(@static_data))
      File.write!(dynamic_path, Jason.encode!(@dynamic_data))

      result = Overlay.analyze(static_path: static_path, dynamic_path: dynamic_path)

      # Check all sections are present
      assert Map.has_key?(result, :dead_code)
      assert Map.has_key?(result, :ghost_paths)
      assert Map.has_key?(result, :module_coverage)
      assert Map.has_key?(result, :summary)

      # Check dead_code
      assert length(result.dead_code) == 1
      assert result.dead_code |> Enum.any?(fn fn_ref -> fn_ref["function"] == "unused_func" end)

      # Check ghost_paths
      assert length(result.ghost_paths) == 1
      assert result.ghost_paths |> Enum.any?(fn ghost -> ghost["function"] == "dynamic_func" end)

      # Check module_coverage
      assert length(result.module_coverage) == 1
      module_cov = List.first(result.module_coverage)
      assert module_cov["module"] == "Elixir.TestModule"
      assert module_cov["coverage_pct"] == 50.0

      # Check summary
      assert result.summary["dead_code_count"] == 1
      assert result.summary["ghost_path_count"] == 1
      assert result.summary["modules_analyzed"] == 1
      assert result.summary["avg_coverage_pct"] == 50.0

      File.rm!(static_path)
      File.rm!(dynamic_path)
    end

    test "accepts threshold options" do
      static_path = System.tmp_dir!() |> Path.join("analyze_static2.json")
      dynamic_path = System.tmp_dir!() |> Path.join("analyze_dynamic2.json")

      File.write!(static_path, Jason.encode!(@static_data))
      File.write!(dynamic_path, Jason.encode!(@dynamic_data))

      result = Overlay.analyze(
        static_path: static_path,
        dynamic_path: dynamic_path,
        hot_threshold: 60,
        cold_threshold: 40
      )

      # With 50% coverage and thresholds of 60/40, should be neither hot nor cold
      module_cov = List.first(result.module_coverage)
      assert module_cov["hot_path"] == false
      assert module_cov["cold_path"] == false

      File.rm!(static_path)
      File.rm!(dynamic_path)
    end

    test "calculates summary statistics correctly" do
      # Create data with multiple modules
      static_multi = %{
        "traces" => [
          %{
            "functions" => [
              %{"module" => "Elixir.ModuleA", "function" => "func1", "arity" => 0, "file" => "lib/a.ex", "line" => 1, "type" => "public"},
              %{"module" => "Elixir.ModuleB", "function" => "func1", "arity" => 0, "file" => "lib/b.ex", "line" => 1, "type" => "public"}
            ]
          }
        ]
      }

      dynamic_multi = %{
        "traces" => [
          %{
            "trace_id" => "test",
            "spans" => [
              %{"module" => "Elixir.ModuleA", "function" => "func1", "arity" => 0, "file" => "lib/a.ex", "line" => 1, "timestamp" => 1, "duration_us" => 1}
            ]
          }
        ]
      }

      static_path = System.tmp_dir!() |> Path.join("analyze_static3.json")
      dynamic_path = System.tmp_dir!() |> Path.join("analyze_dynamic3.json")

      File.write!(static_path, Jason.encode!(static_multi))
      File.write!(dynamic_path, Jason.encode!(dynamic_multi))

      result = Overlay.analyze(static_path: static_path, dynamic_path: dynamic_path)

      # ModuleA: 100% coverage, ModuleB: 0% coverage
      # Average should be 50%
      assert result.summary["modules_analyzed"] == 2
      assert result.summary["avg_coverage_pct"] == 50.0
      assert result.summary["hot_module_count"] == 1  # ModuleA
      assert result.summary["cold_module_count"] == 1  # ModuleB

      File.rm!(static_path)
      File.rm!(dynamic_path)
    end
  end
end
