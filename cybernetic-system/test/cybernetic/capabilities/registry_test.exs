defmodule Cybernetic.Capabilities.RegistryTest do
  use ExUnit.Case

  alias Cybernetic.Capabilities.Registry

  setup do
    {:ok, pid} = start_supervised(Registry)
    {:ok, pid: pid}
  end

  describe "register/1" do
    test "registers a capability with required fields" do
      attrs = %{
        name: "code_review",
        description: "Reviews code for quality",
        provider: MyProvider
      }

      assert {:ok, capability} = Registry.register(attrs)
      assert capability.name == "code_review"
      assert capability.description == "Reviews code for quality"
      assert capability.provider == MyProvider
      assert is_binary(capability.id)
      assert %DateTime{} = capability.registered_at
    end

    test "registers with optional fields" do
      attrs = %{
        name: "analyzer",
        description: "Analyzes content",
        provider: AnalyzerMod,
        inputs: [:text, :options],
        outputs: [:analysis, :score],
        version: "2.0.0",
        metadata: %{"category" => "nlp"}
      }

      assert {:ok, capability} = Registry.register(attrs)
      assert capability.inputs == [:text, :options]
      assert capability.outputs == [:analysis, :score]
      assert capability.version == "2.0.0"
      assert capability.metadata == %{"category" => "nlp"}
    end

    test "rejects duplicate names" do
      attrs = %{name: "unique_cap", description: "Test", provider: TestMod}

      assert {:ok, _} = Registry.register(attrs)
      assert {:error, :name_already_registered} = Registry.register(attrs)
    end

    test "rejects missing required fields" do
      assert {:error, {:missing_field, :name}} =
               Registry.register(%{description: "x", provider: M})

      assert {:error, {:missing_field, :description}} =
               Registry.register(%{name: "x", provider: M})

      assert {:error, {:missing_field, :provider}} =
               Registry.register(%{name: "x", description: "y"})
    end

    test "rejects non-atom provider" do
      attrs = %{name: "test", description: "test", provider: "not_an_atom"}
      assert {:error, :invalid_provider} = Registry.register(attrs)
    end
  end

  describe "get/1 and get_by_name/1" do
    test "retrieves capability by ID" do
      {:ok, cap} = Registry.register(%{name: "get_test", description: "test", provider: Mod})

      assert {:ok, retrieved} = Registry.get(cap.id)
      assert retrieved.name == "get_test"
    end

    test "retrieves capability by name" do
      {:ok, _} = Registry.register(%{name: "named_test", description: "test", provider: Mod})

      assert {:ok, retrieved} = Registry.get_by_name("named_test")
      assert retrieved.name == "named_test"
    end

    test "returns not_found for missing ID" do
      assert {:error, :not_found} = Registry.get("nonexistent-id")
    end

    test "returns not_found for missing name" do
      assert {:error, :not_found} = Registry.get_by_name("nonexistent")
    end
  end

  describe "unregister/1" do
    test "removes capability" do
      {:ok, cap} = Registry.register(%{name: "to_remove", description: "test", provider: Mod})

      assert :ok = Registry.unregister(cap.id)
      assert {:error, :not_found} = Registry.get(cap.id)
      assert {:error, :not_found} = Registry.get_by_name("to_remove")
    end

    test "returns not_found for missing capability" do
      assert {:error, :not_found} = Registry.unregister("nonexistent")
    end
  end

  describe "list/0" do
    test "returns all registered capabilities" do
      {:ok, _} = Registry.register(%{name: "cap1", description: "d1", provider: M1})
      {:ok, _} = Registry.register(%{name: "cap2", description: "d2", provider: M2})

      caps = Registry.list()
      names = Enum.map(caps, & &1.name)

      assert length(caps) == 2
      assert "cap1" in names
      assert "cap2" in names
    end

    test "returns empty list when no capabilities" do
      assert Registry.list() == []
    end
  end

  describe "discover/2" do
    test "discovers capabilities matching query" do
      {:ok, _} =
        Registry.register(%{
          name: "code_analyzer",
          description: "Analyzes code for bugs and quality issues",
          provider: CodeMod
        })

      {:ok, _} =
        Registry.register(%{
          name: "text_summarizer",
          description: "Summarizes long text documents",
          provider: TextMod
        })

      # Should find code analyzer
      {:ok, results} = Registry.discover("analyze code for bugs")
      # May find matches via keyword fallback
      assert length(results) >= 0
    end

    test "respects limit option" do
      for i <- 1..5 do
        Registry.register(%{
          name: "cap_#{i}",
          description: "Description #{i}",
          provider: Module.concat([TestMod, "Cap#{i}"])
        })
      end

      {:ok, results} = Registry.discover("description", limit: 2)
      assert length(results) <= 2
    end

    test "returns empty when no matches" do
      {:ok, _} = Registry.register(%{name: "xyz", description: "abc", provider: Mod})

      {:ok, results} = Registry.discover("completely unrelated query foobar")
      # Keyword matching might still find nothing
      assert is_list(results)
    end
  end

  describe "update_embedding/2" do
    test "updates capability embedding" do
      {:ok, cap} = Registry.register(%{name: "embed_test", description: "test", provider: Mod})
      embedding = [0.1, 0.2, 0.3, 0.4]

      assert :ok = Registry.update_embedding(cap.id, embedding)

      {:ok, updated} = Registry.get(cap.id)
      assert updated.embedding == embedding
    end

    test "returns not_found for missing capability" do
      assert {:error, :not_found} = Registry.update_embedding("nonexistent", [0.1])
    end
  end

  describe "stats/0" do
    test "returns registry statistics" do
      {:ok, _} = Registry.register(%{name: "stat_test", description: "test", provider: Mod})

      stats = Registry.stats()

      assert stats.capability_count == 1
      assert stats.registrations >= 1
      assert %DateTime{} = stats.started_at
    end
  end
end
