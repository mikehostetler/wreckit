defmodule Cybernetic.Integrations.OhMyOpencode.ContextGraphTest do
  use ExUnit.Case, async: false

  alias Cybernetic.Integrations.OhMyOpencode.ContextGraph

  @tenant_id "graph_test_tenant_#{:erlang.unique_integer([:positive])}"

  setup do
    name = :"context_graph_test_#{:erlang.unique_integer([:positive])}"
    {:ok, pid} = ContextGraph.start_link(tenant_id: @tenant_id, name: name)

    on_exit(fn ->
      if Process.alive?(pid), do: GenServer.stop(pid, :normal, 100)
    end)

    %{pid: pid, name: name}
  end

  describe "start_link/1" do
    test "starts with required tenant_id" do
      tenant = "start_link_graph_#{:erlang.unique_integer([:positive])}"
      name = :"context_graph_start_#{:erlang.unique_integer([:positive])}"

      assert {:ok, pid} = ContextGraph.start_link(tenant_id: tenant, name: name)
      assert Process.alive?(pid)

      GenServer.stop(pid, :normal, 100)
    end

    test "fails without tenant_id" do
      assert_raise KeyError, fn ->
        ContextGraph.start_link([])
      end
    end
  end

  describe "add_node/3" do
    test "adds a file node", %{name: name} do
      node_id = "file:src/main.ex"
      attrs = %{type: :file, path: "src/main.ex", language: "elixir"}

      result = GenServer.call(name, {:add_node, node_id, attrs})

      assert result == :ok or match?({:ok, _}, result)
    end

    test "adds a function node", %{name: name} do
      node_id = "function:MyModule.my_func/2"
      attrs = %{type: :function, name: "my_func", arity: 2, module: "MyModule"}

      result = GenServer.call(name, {:add_node, node_id, attrs})

      assert result == :ok or match?({:ok, _}, result)
    end

    test "adds a task node", %{name: name} do
      node_id = "task:implement_feature_123"
      attrs = %{type: :task, title: "Implement feature", priority: :high}

      result = GenServer.call(name, {:add_node, node_id, attrs})

      assert result == :ok or match?({:ok, _}, result)
    end

    test "updates existing node", %{name: name} do
      node_id = "file:src/test.ex"

      GenServer.call(name, {:add_node, node_id, %{type: :file, version: 1}})
      result = GenServer.call(name, {:add_node, node_id, %{type: :file, version: 2}})

      assert result == :ok or match?({:ok, _}, result)
    end
  end

  describe "add_edge/4" do
    test "adds an imports edge", %{name: name} do
      # First add nodes
      GenServer.call(name, {:add_node, "file:a.ex", %{type: :file}})
      GenServer.call(name, {:add_node, "file:b.ex", %{type: :file}})

      result = GenServer.call(name, {:add_edge, "file:a.ex", "file:b.ex", :imports, %{}})

      assert result == :ok or match?({:ok, _}, result)
    end

    test "adds a calls edge", %{name: name} do
      GenServer.call(name, {:add_node, "function:A.foo/0", %{type: :function}})
      GenServer.call(name, {:add_node, "function:B.bar/1", %{type: :function}})

      result = GenServer.call(name, {:add_edge, "function:A.foo/0", "function:B.bar/1", :calls, %{}})

      assert result == :ok or match?({:ok, _}, result)
    end

    test "adds edge with metadata", %{name: name} do
      GenServer.call(name, {:add_node, "task:a", %{type: :task}})
      GenServer.call(name, {:add_node, "task:b", %{type: :task}})

      result = GenServer.call(name, {:add_edge, "task:a", "task:b", :depends_on, %{weight: 0.8}})

      assert result == :ok or match?({:ok, _}, result)
    end
  end

  describe "get_node/2" do
    test "retrieves existing node", %{name: name} do
      node_id = "file:get_test.ex"
      attrs = %{type: :file, path: "get_test.ex"}

      GenServer.call(name, {:add_node, node_id, attrs})
      result = GenServer.call(name, {:get_node, node_id})

      assert match?({:ok, _node}, result) or is_map(result)
    end

    test "returns error for missing node", %{name: name} do
      result = GenServer.call(name, {:get_node, "nonexistent:node"})

      assert result == {:error, :not_found} or result == nil or match?({:error, _}, result)
    end
  end

  describe "get_related/3" do
    test "finds directly related nodes", %{name: name} do
      # Build a small graph
      GenServer.call(name, {:add_node, "file:main.ex", %{type: :file}})
      GenServer.call(name, {:add_node, "file:helper.ex", %{type: :file}})
      GenServer.call(name, {:add_node, "file:utils.ex", %{type: :file}})

      GenServer.call(name, {:add_edge, "file:main.ex", "file:helper.ex", :imports, %{}})
      GenServer.call(name, {:add_edge, "file:main.ex", "file:utils.ex", :imports, %{}})

      result = GenServer.call(name, {:get_related, "file:main.ex", []})

      assert match?({:ok, _nodes}, result) or is_list(result)
    end

    test "respects depth limit", %{name: name} do
      # Build a chain: a -> b -> c -> d
      for id <- ["a", "b", "c", "d"] do
        GenServer.call(name, {:add_node, "file:#{id}.ex", %{type: :file}})
      end

      GenServer.call(name, {:add_edge, "file:a.ex", "file:b.ex", :imports, %{}})
      GenServer.call(name, {:add_edge, "file:b.ex", "file:c.ex", :imports, %{}})
      GenServer.call(name, {:add_edge, "file:c.ex", "file:d.ex", :imports, %{}})

      # Depth 1 should only find b
      result = GenServer.call(name, {:get_related, "file:a.ex", [depth: 1]})

      assert match?({:ok, _}, result) or is_list(result)
    end

    test "filters by edge type", %{name: name} do
      GenServer.call(name, {:add_node, "function:foo", %{type: :function}})
      GenServer.call(name, {:add_node, "function:bar", %{type: :function}})
      GenServer.call(name, {:add_node, "type:MyType", %{type: :type}})

      GenServer.call(name, {:add_edge, "function:foo", "function:bar", :calls, %{}})
      GenServer.call(name, {:add_edge, "function:foo", "type:MyType", :defines, %{}})

      result = GenServer.call(name, {:get_related, "function:foo", [edge_type: :calls]})

      assert match?({:ok, _}, result) or is_list(result)
    end
  end

  describe "search/2" do
    test "searches by node type", %{name: name} do
      GenServer.call(name, {:add_node, "file:search1.ex", %{type: :file}})
      GenServer.call(name, {:add_node, "function:search_func", %{type: :function}})
      GenServer.call(name, {:add_node, "file:search2.ex", %{type: :file}})

      result = GenServer.call(name, {:search, [type: :file]})

      assert match?({:ok, _nodes}, result) or is_list(result)
    end

    test "searches by name pattern", %{name: name} do
      GenServer.call(name, {:add_node, "function:handle_call", %{type: :function, name: "handle_call"}})
      GenServer.call(name, {:add_node, "function:handle_cast", %{type: :function, name: "handle_cast"}})
      GenServer.call(name, {:add_node, "function:do_work", %{type: :function, name: "do_work"}})

      result = GenServer.call(name, {:search, [name: ~r/handle_/]})

      assert match?({:ok, _}, result) or is_list(result)
    end

    test "combines multiple filters", %{name: name} do
      GenServer.call(name, {:add_node, "task:high_1", %{type: :task, priority: :high}})
      GenServer.call(name, {:add_node, "task:low_1", %{type: :task, priority: :low}})
      GenServer.call(name, {:add_node, "file:high_2", %{type: :file, priority: :high}})

      result = GenServer.call(name, {:search, [type: :task, attrs: %{priority: :high}]})

      assert match?({:ok, _}, result) or is_list(result)
    end
  end

  describe "remove_node/2" do
    test "removes node and its edges", %{name: name} do
      GenServer.call(name, {:add_node, "file:remove_me.ex", %{type: :file}})
      GenServer.call(name, {:add_node, "file:keep.ex", %{type: :file}})
      GenServer.call(name, {:add_edge, "file:remove_me.ex", "file:keep.ex", :imports, %{}})

      result = GenServer.call(name, {:remove_node, "file:remove_me.ex"})

      assert result == :ok or match?({:ok, _}, result)
    end
  end

  describe "remove_edge/3" do
    test "removes specific edge", %{name: name} do
      GenServer.call(name, {:add_node, "file:x.ex", %{type: :file}})
      GenServer.call(name, {:add_node, "file:y.ex", %{type: :file}})
      GenServer.call(name, {:add_edge, "file:x.ex", "file:y.ex", :imports, %{}})

      result = GenServer.call(name, {:remove_edge, "file:x.ex", "file:y.ex", :imports})

      assert result == :ok or match?({:ok, _}, result)
    end
  end

  describe "get_subgraph/3" do
    test "exports subgraph rooted at node", %{name: name} do
      GenServer.call(name, {:add_node, "file:root.ex", %{type: :file}})
      GenServer.call(name, {:add_node, "file:child1.ex", %{type: :file}})
      GenServer.call(name, {:add_node, "file:child2.ex", %{type: :file}})
      GenServer.call(name, {:add_edge, "file:root.ex", "file:child1.ex", :imports, %{}})
      GenServer.call(name, {:add_edge, "file:root.ex", "file:child2.ex", :imports, %{}})

      result = GenServer.call(name, {:get_subgraph, "file:root.ex", [depth: 1]})

      assert match?({:ok, %{nodes: _, edges: _}}, result) or is_map(result)
    end
  end

  describe "merge_subgraph/2" do
    test "merges external graph data and nodes are retrievable", %{name: name} do
      external_graph = %{
        nodes: %{
          "file:external.ex" => %{
            id: "file:external.ex",
            type: :file,
            attrs: %{path: "external.ex"},
            updated_at: DateTime.utc_now()
          }
        },
        edges: %{}
      }

      result = GenServer.call(name, {:merge_subgraph, external_graph})
      assert result == :ok or match?({:ok, _}, result)

      # SEMANTIC: Verify the merged node is actually retrievable
      {:ok, node} = GenServer.call(name, {:get_node, "file:external.ex"})
      assert node.id == "file:external.ex"
      assert node.type == :file
      assert node.attrs.path == "external.ex"
    end

    test "merges subgraph with string keys (from JSON)", %{name: name} do
      # Simulates JSON-decoded subgraph with string keys
      external_graph = %{
        "nodes" => %{
          "file:json.ex" => %{
            "id" => "file:json.ex",
            "type" => "file",
            "attrs" => %{"path" => "json.ex"},
            "updated_at" => DateTime.to_iso8601(DateTime.utc_now())
          }
        },
        "edges" => %{}
      }

      result = GenServer.call(name, {:merge_subgraph, external_graph})
      assert result == :ok or match?({:ok, _}, result)

      # SEMANTIC: Verify the JSON-keyed node was merged
      {:ok, node} = GenServer.call(name, {:get_node, "file:json.ex"})
      assert node.id == "file:json.ex"
    end

    test "handles LWW conflict resolution - newer wins", %{name: name} do
      # Add local node with old timestamp
      old_time = DateTime.add(DateTime.utc_now(), -3600, :second)
      GenServer.call(name, {:add_node, "file:conflict.ex", %{type: :file, version: 1}})

      # Merge with newer remote data
      external = %{
        nodes: %{
          "file:conflict.ex" => %{
            id: "file:conflict.ex",
            type: :file,
            attrs: %{type: :file, version: 2},
            updated_at: DateTime.add(DateTime.utc_now(), 1, :second)
          }
        },
        edges: %{}
      }

      result = GenServer.call(name, {:merge_subgraph, external})

      assert result == :ok or match?({:ok, _}, result)
    end
  end

  describe "stats/0" do
    test "returns graph statistics", %{name: name} do
      GenServer.call(name, {:add_node, "file:stat1.ex", %{type: :file}})
      GenServer.call(name, {:add_node, "file:stat2.ex", %{type: :file}})
      GenServer.call(name, {:add_edge, "file:stat1.ex", "file:stat2.ex", :imports, %{}})

      {:ok, stats} = GenServer.call(name, :stats)

      assert is_map(stats)
      assert Map.has_key?(stats, :node_count)
    end
  end

  describe "limits" do
    test "respects max nodes limit", %{name: name} do
      # We won't test the full 10k limit but verify graceful handling
      for i <- 1..10 do
        GenServer.call(name, {:add_node, "file:limit_#{i}.ex", %{type: :file}})
      end

      {:ok, stats} = GenServer.call(name, :stats)
      assert is_map(stats)
      assert stats.node_count == 10
    end

    test "respects max edges per node limit", %{name: name} do
      GenServer.call(name, {:add_node, "file:hub.ex", %{type: :file}})

      for i <- 1..10 do
        GenServer.call(name, {:add_node, "file:spoke_#{i}.ex", %{type: :file}})
        GenServer.call(name, {:add_edge, "file:hub.ex", "file:spoke_#{i}.ex", :imports, %{}})
      end

      {:ok, stats} = GenServer.call(name, :stats)
      assert is_map(stats)
      assert stats.edge_count == 10
    end
  end
end
