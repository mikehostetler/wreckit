defmodule Cybernetic.Content.Buckets.CBCPRetentionTest do
  use ExUnit.Case, async: false

  alias Cybernetic.Content.Buckets.CBCP

  setup do
    server = __MODULE__
    pid = start_supervised!({CBCP, name: server})
    {:ok, server: server, pid: pid}
  end

  test "auto-deletes soft-deleted buckets when auto_delete_days is reached", %{
    server: server,
    pid: pid
  } do
    retention_policy = %{
      min_retention_days: nil,
      max_retention_days: nil,
      auto_archive_days: nil,
      auto_delete_days: 0
    }

    {:ok, bucket} =
      CBCP.create_bucket(server, "deleted-bucket", "tenant-1", retention_policy: retention_policy)

    assert :ok = CBCP.delete_bucket(server, bucket.id)

    send(pid, :cleanup)
    _ = CBCP.stats(server)

    assert {:error, :not_found} = CBCP.get_bucket(server, bucket.id)
  end

  test "auto-archives active buckets when auto_archive_days is reached", %{
    server: server,
    pid: pid
  } do
    retention_policy = %{
      min_retention_days: nil,
      max_retention_days: nil,
      auto_archive_days: 0,
      auto_delete_days: nil
    }

    {:ok, bucket} =
      CBCP.create_bucket(server, "archived-bucket", "tenant-1",
        retention_policy: retention_policy
      )

    send(pid, :cleanup)
    _ = CBCP.stats(server)

    assert {:ok, %{status: :archived}} = CBCP.get_bucket(server, bucket.id)
  end
end
