defmodule Cybernetic.MCP.Tools.CodeAnalysisToolTest do
  use ExUnit.Case, async: true
  alias Cybernetic.MCP.Tools.CodeAnalysisTool

  @test_context %{actor: "test_user"}

  @sample_elixir_code """
  defmodule Sample do
    use GenServer
    
    def start_link(opts) do
      GenServer.start_link(__MODULE__, opts, name: __MODULE__)
    end
    
    def init(opts) do
      {:ok, %{data: opts}}
    end
    
    def handle_call(request, _from, state) do
      case request do
        :get_data -> {:reply, state.data, state}
        _ -> {:reply, :error, state}
      end
    end
  end
  """

  @sample_vulnerable_code """
  def execute_query(user_input) do
    sql = "SELECT * FROM users WHERE id = \#{user_input}"
    Repo.query(sql)
  end

  def store_secret do
    api_key = "sk-secret-key-12345"
    System.cmd("curl", ["-H", "Authorization: \#{api_key}"])
  end
  """

  describe "tool info" do
    test "returns correct tool information" do
      info = CodeAnalysisTool.info()

      assert info.name == "code_analysis"
      assert info.version == "1.0.0"
      assert "analyze" in info.capabilities
      assert "generate" in info.capabilities
      assert "refactor" in info.capabilities
      assert "security_scan" in info.capabilities
      assert info.requires_auth == false
    end
  end

  describe "parameter validation" do
    test "validates analyze parameters" do
      assert :ok = CodeAnalysisTool.validate_params("analyze", %{"code" => "def test, do: :ok"})
      assert :ok = CodeAnalysisTool.validate_params("analyze", %{"file_path" => "/test.ex"})
      assert {:error, _} = CodeAnalysisTool.validate_params("analyze", %{})
    end

    test "validates generate parameters" do
      assert :ok =
               CodeAnalysisTool.validate_params("generate", %{
                 "template" => "genserver",
                 "context" => %{"name" => "MyServer"}
               })

      assert {:error, _} = CodeAnalysisTool.validate_params("generate", %{"template" => "test"})
      assert {:error, _} = CodeAnalysisTool.validate_params("generate", %{"context" => %{}})
    end

    test "validates refactor parameters" do
      assert :ok =
               CodeAnalysisTool.validate_params("refactor", %{
                 "code" => "def test, do: :ok",
                 "pattern" => "extract_function"
               })

      assert {:error, _} = CodeAnalysisTool.validate_params("refactor", %{"code" => "test"})
      assert {:error, _} = CodeAnalysisTool.validate_params("refactor", %{"pattern" => "test"})
    end

    test "validates security_scan parameters" do
      assert :ok =
               CodeAnalysisTool.validate_params("security_scan", %{"code" => "def test, do: :ok"})

      assert :ok = CodeAnalysisTool.validate_params("security_scan", %{"directory" => "/src"})
      assert {:error, _} = CodeAnalysisTool.validate_params("security_scan", %{})
    end
  end

  describe "code analysis" do
    test "analyzes Elixir code" do
      params = %{"code" => @sample_elixir_code}

      assert {:ok, result} = CodeAnalysisTool.execute("analyze", params, @test_context)

      assert result.result.language == "elixir"
      assert is_map(result.result.metrics)
      assert is_map(result.result.complexity)
      assert "genserver" in result.result.patterns
      assert is_list(result.result.dependencies)
    end

    test "detects language automatically" do
      js_code = "function test() { return true; }"
      params = %{"code" => js_code}

      assert {:ok, result} = CodeAnalysisTool.execute("analyze", params, @test_context)
      assert result.result.language == "javascript"
    end

    test "calculates code metrics" do
      params = %{"code" => @sample_elixir_code}

      assert {:ok, result} = CodeAnalysisTool.execute("analyze", params, @test_context)
      metrics = result.result.metrics

      assert is_integer(metrics.lines_of_code)
      assert is_number(metrics.cyclomatic_complexity)
      assert is_number(metrics.maintainability_index)
      assert is_number(metrics.technical_debt_ratio)
    end

    test "detects patterns" do
      params = %{"code" => @sample_elixir_code}

      assert {:ok, result} = CodeAnalysisTool.execute("analyze", params, @test_context)

      assert "genserver" in result.result.patterns
      assert "pattern_matching" in result.result.patterns
    end

    test "detects anti-patterns" do
      long_function = """
      def very_long_function do
        #{Enum.map(1..60, fn i -> "  line_#{i}()\n" end) |> Enum.join()}
      end
      """

      params = %{"code" => long_function}

      assert {:ok, result} = CodeAnalysisTool.execute("analyze", params, @test_context)

      anti_patterns = result.result.anti_patterns
      assert Enum.any?(anti_patterns, fn {type, _} -> type == :long_function end)
    end
  end

  describe "code generation" do
    test "generates GenServer template" do
      params = %{
        "template" => "genserver",
        "context" => %{"name" => "TestServer"},
        "language" => "elixir"
      }

      assert {:ok, result} = CodeAnalysisTool.execute("generate", params, @test_context)

      assert String.contains?(result.result.code, "defmodule TestServer")
      assert String.contains?(result.result.code, "use GenServer")
      assert String.contains?(result.result.code, "def start_link")
      assert result.result.template == "genserver"
    end

    test "generates MCP tool template" do
      params = %{
        "template" => "mcp_tool",
        "context" => %{
          "name" => "CustomTool",
          "description" => "My custom MCP tool",
          "capabilities" => ["read", "write"]
        }
      }

      assert {:ok, result} = CodeAnalysisTool.execute("generate", params, @test_context)

      assert String.contains?(result.result.code, "defmodule Cybernetic.MCP.Tools.CustomTool")
      assert String.contains?(result.result.code, "@behaviour Cybernetic.MCP.Tool")
      assert String.contains?(result.result.code, "My custom MCP tool")
    end

    test "counts lines in generated code" do
      params = %{
        "template" => "genserver",
        "context" => %{"name" => "Test"}
      }

      assert {:ok, result} = CodeAnalysisTool.execute("generate", params, @test_context)
      assert is_integer(result.result.line_count)
      assert result.result.line_count > 0
    end
  end

  describe "refactoring" do
    test "performs refactoring operations" do
      code = "def test(x), do: x + 1"

      params = %{
        "code" => code,
        "pattern" => "extract_function",
        "selection" => "x + 1"
      }

      assert {:ok, result} = CodeAnalysisTool.execute("refactor", params, @test_context)

      assert result.result.original == code
      assert is_binary(result.result.refactored)
      assert result.result.pattern == "extract_function"
      assert is_list(result.result.changes)
    end

    test "handles unknown refactoring pattern" do
      params = %{
        "code" => "def test, do: :ok",
        "pattern" => "unknown_pattern"
      }

      assert {:ok, result} = CodeAnalysisTool.execute("refactor", params, @test_context)
      assert result.result.original == result.result.refactored
    end
  end

  describe "security scanning" do
    test "detects SQL injection vulnerability" do
      params = %{"code" => @sample_vulnerable_code}

      assert {:ok, result} = CodeAnalysisTool.execute("security_scan", params, @test_context)

      vulnerabilities = result.result.vulnerabilities
      assert Enum.any?(vulnerabilities, &(&1.type == "sql_injection"))
      assert Enum.any?(vulnerabilities, &(&1.severity == :critical))
    end

    test "detects hardcoded secrets" do
      params = %{"code" => @sample_vulnerable_code}

      assert {:ok, result} = CodeAnalysisTool.execute("security_scan", params, @test_context)

      vulnerabilities = result.result.vulnerabilities
      assert Enum.any?(vulnerabilities, &(&1.type == "hardcoded_secret"))
      assert Enum.any?(vulnerabilities, &(&1.severity == :high))
    end

    test "provides security recommendations" do
      params = %{"code" => @sample_vulnerable_code}

      assert {:ok, result} = CodeAnalysisTool.execute("security_scan", params, @test_context)

      recommendations = result.result.recommendations
      assert is_list(recommendations)
      assert length(recommendations) > 0
      assert Enum.any?(recommendations, &String.contains?(&1, "parameterized"))
    end

    test "summarizes vulnerabilities by severity" do
      params = %{"code" => @sample_vulnerable_code}

      assert {:ok, result} = CodeAnalysisTool.execute("security_scan", params, @test_context)

      summary = result.result.severity_summary
      assert is_integer(summary.critical)
      assert is_integer(summary.high)
      assert is_integer(summary.medium)
      assert is_integer(summary.low)
    end

    test "returns empty vulnerabilities for safe code" do
      safe_code = "def add(a, b), do: a + b"
      params = %{"code" => safe_code}

      assert {:ok, result} = CodeAnalysisTool.execute("security_scan", params, @test_context)
      assert result.result.vulnerabilities == []
    end
  end

  describe "complexity analysis" do
    test "calculates cyclomatic complexity" do
      complex_code = """
      def complex(x) do
        if x > 0 do
          case x do
            1 -> :one
            2 -> :two
            _ when x < 10 -> :small
            _ -> :large
          end
        else
          :negative
        end
      end
      """

      params = %{"code" => complex_code}

      assert {:ok, result} = CodeAnalysisTool.execute("analyze", params, @test_context)

      complexity = result.result.complexity
      assert complexity.cyclomatic > 1
      assert complexity.cognitive > 1
      assert is_map(complexity.halstead)
    end
  end
end
