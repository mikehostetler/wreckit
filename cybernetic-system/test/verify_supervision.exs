defmodule VerifySupervision do
  require Logger

  def test_supervisor_strategy do
    IO.puts("\n=== VERIFYING SUPERVISOR BEHAVIOR ===")

    # Get supervisor info
    case Supervisor.which_children(Cybernetic.VSM.Supervisor) do
      children when is_list(children) ->
        IO.puts("VSM Supervisor children:")

        for {id, pid, type, modules} <- children do
          IO.puts("  #{inspect(id)}: #{inspect(pid)} (#{type}) #{inspect(modules)}")
        end

        # Get the actual strategy
        {:ok, state} = :sys.get_state(Cybernetic.VSM.Supervisor)
        IO.puts("\nSupervisor state: #{inspect(state, limit: :infinity, pretty: true)}")

      error ->
        IO.puts("Error getting children: #{inspect(error)}")
    end

    # Test what really happens
    IO.puts("\n=== TESTING S1 CRASH ===")
    s1_before = Process.whereis(Cybernetic.VSM.System1.Operational)
    s2_before = Process.whereis(Cybernetic.VSM.System2.Coordinator)
    s3_before = Process.whereis(Cybernetic.VSM.System3.Control)
    s4_before = Process.whereis(Cybernetic.VSM.System4.Intelligence)
    s5_before = Process.whereis(Cybernetic.VSM.System5.Policy)

    IO.puts("Before:")
    IO.puts("  S1: #{inspect(s1_before)}")
    IO.puts("  S2: #{inspect(s2_before)}")
    IO.puts("  S3: #{inspect(s3_before)}")
    IO.puts("  S4: #{inspect(s4_before)}")
    IO.puts("  S5: #{inspect(s5_before)}")

    # Kill S1 with a normal exit (not :kill which might bypass supervision)
    if s1_before do
      Process.exit(s1_before, :test_crash)
      # Give supervisor time to restart
      Process.sleep(500)

      s1_after = Process.whereis(Cybernetic.VSM.System1.Operational)
      s2_after = Process.whereis(Cybernetic.VSM.System2.Coordinator)
      s3_after = Process.whereis(Cybernetic.VSM.System3.Control)
      s4_after = Process.whereis(Cybernetic.VSM.System4.Intelligence)
      s5_after = Process.whereis(Cybernetic.VSM.System5.Policy)

      IO.puts("\nAfter S1 crash:")

      IO.puts(
        "  S1: #{inspect(s1_before)} → #{inspect(s1_after)} #{if s1_after && s1_after != s1_before, do: "✅ RESTARTED", else: "❌"}"
      )

      IO.puts(
        "  S2: #{inspect(s2_before)} → #{inspect(s2_after)} #{if s2_after == s2_before, do: "✅ UNCHANGED", else: "❌ CHANGED"}"
      )

      IO.puts(
        "  S3: #{inspect(s3_before)} → #{inspect(s3_after)} #{if s3_after == s3_before, do: "✅ UNCHANGED", else: "❌ CHANGED"}"
      )

      IO.puts(
        "  S4: #{inspect(s4_before)} → #{inspect(s4_after)} #{if s4_after == s4_before, do: "✅ UNCHANGED", else: "❌ CHANGED"}"
      )

      IO.puts(
        "  S5: #{inspect(s5_before)} → #{inspect(s5_after)} #{if s5_after == s5_before, do: "✅ UNCHANGED", else: "❌ CHANGED"}"
      )

      # Now test S5 crash
      IO.puts("\n=== TESTING S5 CRASH ===")
      s5_before2 = Process.whereis(Cybernetic.VSM.System5.Policy)

      if s5_before2 do
        Process.exit(s5_before2, :test_crash)
        Process.sleep(500)

        s1_after2 = Process.whereis(Cybernetic.VSM.System1.Operational)
        s2_after2 = Process.whereis(Cybernetic.VSM.System2.Coordinator)
        s3_after2 = Process.whereis(Cybernetic.VSM.System3.Control)
        s4_after2 = Process.whereis(Cybernetic.VSM.System4.Intelligence)
        s5_after2 = Process.whereis(Cybernetic.VSM.System5.Policy)

        IO.puts("After S5 crash:")

        IO.puts(
          "  S1: #{inspect(s1_after)} → #{inspect(s1_after2)} #{if s1_after2 != s1_after, do: "⚠️  RESTARTED", else: "✅ UNCHANGED"}"
        )

        IO.puts(
          "  S2: #{inspect(s2_after)} → #{inspect(s2_after2)} #{if s2_after2 != s2_after, do: "⚠️  RESTARTED", else: "✅ UNCHANGED"}"
        )

        IO.puts(
          "  S3: #{inspect(s3_after)} → #{inspect(s3_after2)} #{if s3_after2 != s3_after, do: "⚠️  RESTARTED", else: "✅ UNCHANGED"}"
        )

        IO.puts(
          "  S4: #{inspect(s4_after)} → #{inspect(s4_after2)} #{if s4_after2 != s4_after, do: "⚠️  RESTARTED", else: "✅ UNCHANGED"}"
        )

        IO.puts(
          "  S5: #{inspect(s5_before2)} → #{inspect(s5_after2)} #{if s5_after2 && s5_after2 != s5_before2, do: "✅ RESTARTED", else: "❌"}"
        )
      end
    end

    IO.puts("\n=== INTERPRETATION ===")

    IO.puts("""
    With :rest_for_one strategy:
    - S1 crash should restart ONLY S1 (it's last)
    - S5 crash should restart S5, S4, S3, S2, S1 (everything after it)

    This provides a hierarchy where:
    - Lower systems can fail without affecting higher ones
    - Higher system failure cascades down (as they depend on lower)
    """)
  end
end

VerifySupervision.test_supervisor_strategy()
