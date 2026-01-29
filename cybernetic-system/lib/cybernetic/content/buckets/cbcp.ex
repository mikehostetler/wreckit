defmodule Cybernetic.Content.Buckets.CBCP do
  @moduledoc """
  Content Bucket Control Protocol (CBCP) for managing content buckets.

  Provides:
  - Bucket lifecycle management (create, archive, delete)
  - Access policy enforcement
  - Cross-bucket operations (copy, move)
  - Quota management
  - Retention policies

  Buckets organize semantic containers into logical groups with
  shared access policies and lifecycle rules.
  """

  use GenServer
  require Logger

  alias Cybernetic.Config

  # Types
  @type bucket_id :: String.t()
  @type tenant_id :: String.t()

  @type access_policy :: %{
          read: [String.t()],
          write: [String.t()],
          admin: [String.t()],
          public_read: boolean()
        }

  @type retention_policy :: %{
          min_retention_days: non_neg_integer() | nil,
          max_retention_days: non_neg_integer() | nil,
          auto_archive_days: non_neg_integer() | nil,
          auto_delete_days: non_neg_integer() | nil
        }

  @type bucket :: %{
          id: bucket_id(),
          name: String.t(),
          tenant_id: tenant_id(),
          description: String.t() | nil,
          access_policy: access_policy(),
          retention_policy: retention_policy(),
          quota_bytes: non_neg_integer() | nil,
          used_bytes: non_neg_integer(),
          container_count: non_neg_integer(),
          status: :active | :archived | :deleted,
          metadata: map(),
          created_at: DateTime.t(),
          updated_at: DateTime.t(),
          archived_at: DateTime.t() | nil
        }

  # Configuration
  @max_buckets_per_tenant 100
  @max_name_length 128
  # No limit by default
  @default_quota nil
  @cleanup_interval :timer.hours(1)

  @telemetry [:cybernetic, :content, :buckets]

  # Client API

  @doc "Start the CBCP server"
  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts \\ []) do
    name = Keyword.get(opts, :name, __MODULE__)
    GenServer.start_link(__MODULE__, opts, name: name)
  end

  @doc "Create a new bucket"
  @spec create_bucket(GenServer.server(), String.t(), String.t(), keyword()) ::
          {:ok, bucket()} | {:error, term()}
  def create_bucket(server \\ __MODULE__, name, tenant_id, opts \\ []) do
    GenServer.call(server, {:create_bucket, name, tenant_id, opts})
  end

  @doc "Get a bucket by ID"
  @spec get_bucket(GenServer.server(), bucket_id()) :: {:ok, bucket()} | {:error, :not_found}
  def get_bucket(server \\ __MODULE__, bucket_id) do
    GenServer.call(server, {:get_bucket, bucket_id})
  end

  @doc "List buckets for a tenant"
  @spec list_buckets(GenServer.server(), tenant_id(), keyword()) :: {:ok, [bucket()]}
  def list_buckets(server \\ __MODULE__, tenant_id, opts \\ []) do
    GenServer.call(server, {:list_buckets, tenant_id, opts})
  end

  @doc "Update bucket settings"
  @spec update_bucket(GenServer.server(), bucket_id(), keyword()) ::
          {:ok, bucket()} | {:error, term()}
  def update_bucket(server \\ __MODULE__, bucket_id, updates) do
    GenServer.call(server, {:update_bucket, bucket_id, updates})
  end

  @doc "Set bucket access policy"
  @spec set_access_policy(GenServer.server(), bucket_id(), access_policy()) ::
          {:ok, bucket()} | {:error, term()}
  def set_access_policy(server \\ __MODULE__, bucket_id, policy) do
    GenServer.call(server, {:set_access_policy, bucket_id, policy})
  end

  @doc "Set bucket retention policy"
  @spec set_retention_policy(GenServer.server(), bucket_id(), retention_policy()) ::
          {:ok, bucket()} | {:error, term()}
  def set_retention_policy(server \\ __MODULE__, bucket_id, policy) do
    GenServer.call(server, {:set_retention_policy, bucket_id, policy})
  end

  @doc "Archive a bucket (soft delete)"
  @spec archive_bucket(GenServer.server(), bucket_id()) :: {:ok, bucket()} | {:error, term()}
  def archive_bucket(server \\ __MODULE__, bucket_id) do
    GenServer.call(server, {:archive_bucket, bucket_id})
  end

  @doc "Restore an archived bucket"
  @spec restore_bucket(GenServer.server(), bucket_id()) :: {:ok, bucket()} | {:error, term()}
  def restore_bucket(server \\ __MODULE__, bucket_id) do
    GenServer.call(server, {:restore_bucket, bucket_id})
  end

  @doc "Permanently delete a bucket"
  @spec delete_bucket(GenServer.server(), bucket_id(), keyword()) :: :ok | {:error, term()}
  def delete_bucket(server \\ __MODULE__, bucket_id, opts \\ []) do
    GenServer.call(server, {:delete_bucket, bucket_id, opts})
  end

  @doc "Add a container to a bucket"
  @spec add_container(GenServer.server(), bucket_id(), String.t(), non_neg_integer()) ::
          :ok | {:error, term()}
  def add_container(server \\ __MODULE__, bucket_id, container_id, size_bytes) do
    GenServer.call(server, {:add_container, bucket_id, container_id, size_bytes})
  end

  @doc "Remove a container from a bucket"
  @spec remove_container(GenServer.server(), bucket_id(), String.t(), non_neg_integer()) ::
          :ok | {:error, term()}
  def remove_container(server \\ __MODULE__, bucket_id, container_id, size_bytes) do
    GenServer.call(server, {:remove_container, bucket_id, container_id, size_bytes})
  end

  @doc "Copy containers between buckets"
  @spec copy_containers(GenServer.server(), bucket_id(), bucket_id(), [String.t()]) ::
          {:ok, non_neg_integer()} | {:error, term()}
  def copy_containers(server \\ __MODULE__, source_bucket, target_bucket, container_ids) do
    GenServer.call(server, {:copy_containers, source_bucket, target_bucket, container_ids})
  end

  @doc "Move containers between buckets"
  @spec move_containers(GenServer.server(), bucket_id(), bucket_id(), [String.t()]) ::
          {:ok, non_neg_integer()} | {:error, term()}
  def move_containers(server \\ __MODULE__, source_bucket, target_bucket, container_ids) do
    GenServer.call(server, {:move_containers, source_bucket, target_bucket, container_ids})
  end

  @doc "Check if user has access to bucket"
  @spec check_access(GenServer.server(), bucket_id(), String.t(), atom()) :: boolean()
  def check_access(server \\ __MODULE__, bucket_id, user_id, permission) do
    GenServer.call(server, {:check_access, bucket_id, user_id, permission})
  end

  @doc "Get bucket statistics"
  @spec stats(GenServer.server()) :: map()
  def stats(server \\ __MODULE__) do
    GenServer.call(server, :stats)
  end

  # Server Implementation

  @impl true
  def init(opts) do
    Logger.info("CBCP server starting")

    # ETS table for buckets
    buckets_table = :ets.new(:cbcp_buckets, [:set, :protected, {:read_concurrency, true}])

    # Index: tenant_id -> bucket_ids
    tenant_index = :ets.new(:cbcp_tenant_index, [:bag, :protected])

    # Index: bucket_id -> container_ids
    container_index = :ets.new(:cbcp_container_index, [:bag, :protected])

    state = %{
      buckets: buckets_table,
      tenant_index: tenant_index,
      container_index: container_index,
      container_server: Keyword.get(opts, :container_server),
      stats: %{
        buckets_created: 0,
        buckets_archived: 0,
        buckets_deleted: 0,
        containers_added: 0,
        containers_removed: 0
      }
    }

    schedule_cleanup()

    {:ok, state}
  end

  @impl true
  def handle_call({:create_bucket, name, tenant_id, opts}, _from, state) do
    with :ok <- validate_name(name),
         :ok <- validate_tenant_id(tenant_id),
         :ok <- check_bucket_limit(state, tenant_id) do
      bucket = build_bucket(name, tenant_id, opts)

      :ets.insert(state.buckets, {bucket.id, bucket})
      :ets.insert(state.tenant_index, {tenant_id, bucket.id})

      new_stats = Map.update!(state.stats, :buckets_created, &(&1 + 1))
      emit_telemetry(:create, %{tenant_id: tenant_id, bucket_id: bucket.id})

      {:reply, {:ok, bucket}, %{state | stats: new_stats}}
    else
      {:error, _} = error -> {:reply, error, state}
    end
  end

  @impl true
  def handle_call({:get_bucket, bucket_id}, _from, state) do
    case :ets.lookup(state.buckets, bucket_id) do
      [{^bucket_id, bucket}] -> {:reply, {:ok, bucket}, state}
      [] -> {:reply, {:error, :not_found}, state}
    end
  end

  @impl true
  def handle_call({:list_buckets, tenant_id, opts}, _from, state) do
    include_archived = Keyword.get(opts, :include_archived, false)

    bucket_ids =
      :ets.lookup(state.tenant_index, tenant_id)
      |> Enum.map(fn {_tenant, id} -> id end)

    buckets =
      bucket_ids
      |> Enum.flat_map(fn id ->
        case :ets.lookup(state.buckets, id) do
          [{^id, bucket}] -> [bucket]
          [] -> []
        end
      end)
      |> Enum.filter(fn bucket ->
        bucket.status == :active or (include_archived and bucket.status == :archived)
      end)

    {:reply, {:ok, buckets}, state}
  end

  @impl true
  def handle_call({:update_bucket, bucket_id, updates}, _from, state) do
    case :ets.lookup(state.buckets, bucket_id) do
      [{^bucket_id, bucket}] ->
        if bucket.status == :deleted do
          {:reply, {:error, :bucket_deleted}, state}
        else
          updated =
            bucket
            |> maybe_update(:name, updates)
            |> maybe_update(:description, updates)
            |> maybe_update(:quota_bytes, updates)
            |> maybe_update(:metadata, updates)
            |> Map.put(:updated_at, DateTime.utc_now())

          :ets.insert(state.buckets, {bucket_id, updated})
          {:reply, {:ok, updated}, state}
        end

      [] ->
        {:reply, {:error, :not_found}, state}
    end
  end

  @impl true
  def handle_call({:set_access_policy, bucket_id, policy}, _from, state) do
    with {:ok, bucket} <- get_bucket_if_active(state, bucket_id),
         :ok <- validate_access_policy(policy) do
      updated = %{bucket | access_policy: policy, updated_at: DateTime.utc_now()}
      :ets.insert(state.buckets, {bucket_id, updated})
      {:reply, {:ok, updated}, state}
    else
      error -> {:reply, error, state}
    end
  end

  @impl true
  def handle_call({:set_retention_policy, bucket_id, policy}, _from, state) do
    with {:ok, bucket} <- get_bucket_if_active(state, bucket_id),
         :ok <- validate_retention_policy(policy) do
      updated = %{bucket | retention_policy: policy, updated_at: DateTime.utc_now()}
      :ets.insert(state.buckets, {bucket_id, updated})
      {:reply, {:ok, updated}, state}
    else
      error -> {:reply, error, state}
    end
  end

  @impl true
  def handle_call({:archive_bucket, bucket_id}, _from, state) do
    case :ets.lookup(state.buckets, bucket_id) do
      [{^bucket_id, %{status: :active} = bucket}] ->
        now = DateTime.utc_now()
        updated = %{bucket | status: :archived, archived_at: now, updated_at: now}
        :ets.insert(state.buckets, {bucket_id, updated})

        new_stats = Map.update!(state.stats, :buckets_archived, &(&1 + 1))
        emit_telemetry(:archive, %{bucket_id: bucket_id})

        {:reply, {:ok, updated}, %{state | stats: new_stats}}

      [{^bucket_id, %{status: :archived}}] ->
        {:reply, {:error, :already_archived}, state}

      [{^bucket_id, %{status: :deleted}}] ->
        {:reply, {:error, :bucket_deleted}, state}

      [] ->
        {:reply, {:error, :not_found}, state}
    end
  end

  @impl true
  def handle_call({:restore_bucket, bucket_id}, _from, state) do
    case :ets.lookup(state.buckets, bucket_id) do
      [{^bucket_id, %{status: :archived} = bucket}] ->
        updated = %{bucket | status: :active, archived_at: nil, updated_at: DateTime.utc_now()}
        :ets.insert(state.buckets, {bucket_id, updated})
        {:reply, {:ok, updated}, state}

      [{^bucket_id, %{status: :active}}] ->
        {:reply, {:error, :not_archived}, state}

      [{^bucket_id, %{status: :deleted}}] ->
        {:reply, {:error, :bucket_deleted}, state}

      [] ->
        {:reply, {:error, :not_found}, state}
    end
  end

  @impl true
  def handle_call({:delete_bucket, bucket_id, opts}, _from, state) do
    force = Keyword.get(opts, :force, false)

    case :ets.lookup(state.buckets, bucket_id) do
      [{^bucket_id, bucket}] ->
        if bucket.container_count > 0 and not force do
          {:reply, {:error, :bucket_not_empty}, state}
        else
          # Mark as deleted (or actually delete if force)
          if force do
            :ets.delete(state.buckets, bucket_id)
            :ets.match_delete(state.tenant_index, {bucket.tenant_id, bucket_id})
            :ets.match_delete(state.container_index, {bucket_id, :_})
          else
            updated = %{bucket | status: :deleted, updated_at: DateTime.utc_now()}
            :ets.insert(state.buckets, {bucket_id, updated})
          end

          new_stats = Map.update!(state.stats, :buckets_deleted, &(&1 + 1))
          emit_telemetry(:delete, %{bucket_id: bucket_id, force: force})

          {:reply, :ok, %{state | stats: new_stats}}
        end

      [] ->
        {:reply, {:error, :not_found}, state}
    end
  end

  @impl true
  def handle_call({:add_container, bucket_id, container_id, size_bytes}, _from, state) do
    with {:ok, bucket} <- get_bucket_if_active(state, bucket_id),
         :ok <- check_quota(bucket, size_bytes) do
      # Add to container index
      :ets.insert(state.container_index, {bucket_id, container_id})

      # Update bucket stats
      updated = %{
        bucket
        | container_count: bucket.container_count + 1,
          used_bytes: bucket.used_bytes + size_bytes,
          updated_at: DateTime.utc_now()
      }

      :ets.insert(state.buckets, {bucket_id, updated})

      new_stats = Map.update!(state.stats, :containers_added, &(&1 + 1))
      {:reply, :ok, %{state | stats: new_stats}}
    else
      error -> {:reply, error, state}
    end
  end

  @impl true
  def handle_call({:remove_container, bucket_id, container_id, size_bytes}, _from, state) do
    case :ets.lookup(state.buckets, bucket_id) do
      [{^bucket_id, bucket}] ->
        :ets.match_delete(state.container_index, {bucket_id, container_id})

        updated = %{
          bucket
          | container_count: max(0, bucket.container_count - 1),
            used_bytes: max(0, bucket.used_bytes - size_bytes),
            updated_at: DateTime.utc_now()
        }

        :ets.insert(state.buckets, {bucket_id, updated})

        new_stats = Map.update!(state.stats, :containers_removed, &(&1 + 1))
        {:reply, :ok, %{state | stats: new_stats}}

      [] ->
        {:reply, {:error, :not_found}, state}
    end
  end

  @impl true
  def handle_call({:copy_containers, source_id, target_id, container_ids}, _from, state) do
    with {:ok, _source} <- get_bucket_if_active(state, source_id),
         {:ok, _target} <- get_bucket_if_active(state, target_id) do
      # Add container references to target bucket
      Enum.each(container_ids, fn cid ->
        :ets.insert(state.container_index, {target_id, cid})
      end)

      {:reply, {:ok, length(container_ids)}, state}
    else
      error -> {:reply, error, state}
    end
  end

  @impl true
  def handle_call({:move_containers, source_id, target_id, container_ids}, _from, state) do
    with {:ok, _source} <- get_bucket_if_active(state, source_id),
         {:ok, _target} <- get_bucket_if_active(state, target_id) do
      # Remove from source, add to target
      Enum.each(container_ids, fn cid ->
        :ets.match_delete(state.container_index, {source_id, cid})
        :ets.insert(state.container_index, {target_id, cid})
      end)

      {:reply, {:ok, length(container_ids)}, state}
    else
      error -> {:reply, error, state}
    end
  end

  @impl true
  def handle_call({:check_access, bucket_id, user_id, permission}, _from, state) do
    result =
      case :ets.lookup(state.buckets, bucket_id) do
        [{^bucket_id, bucket}] ->
          check_user_access(bucket.access_policy, user_id, permission)

        [] ->
          false
      end

    {:reply, result, state}
  end

  @impl true
  def handle_call(:stats, _from, state) do
    bucket_count = :ets.info(state.buckets, :size)
    container_refs = :ets.info(state.container_index, :size)

    stats =
      Map.merge(state.stats, %{
        active_buckets: bucket_count,
        container_references: container_refs
      })

    {:reply, stats, state}
  end

  @impl true
  def handle_info(:cleanup, state) do
    Logger.debug("Running CBCP cleanup")
    state = apply_retention_policies(state)
    schedule_cleanup()
    {:noreply, state}
  end

  @impl true
  def terminate(_reason, state) do
    :ets.delete(state.buckets)
    :ets.delete(state.tenant_index)
    :ets.delete(state.container_index)
    :ok
  end

  # Private Functions

  @spec validate_name(String.t()) :: :ok | {:error, term()}
  defp validate_name(name) when is_binary(name) do
    cond do
      byte_size(name) == 0 -> {:error, :empty_name}
      byte_size(name) > @max_name_length -> {:error, :name_too_long}
      not Regex.match?(~r/^[a-zA-Z0-9][a-zA-Z0-9_\-\.]*$/, name) -> {:error, :invalid_name_format}
      true -> :ok
    end
  end

  defp validate_name(_), do: {:error, :invalid_name}

  @spec validate_tenant_id(String.t()) :: :ok | {:error, term()}
  defp validate_tenant_id(tenant_id) when is_binary(tenant_id) do
    if Regex.match?(Config.tenant_id_pattern(), tenant_id) do
      :ok
    else
      {:error, :invalid_tenant_id}
    end
  end

  defp validate_tenant_id(_), do: {:error, :invalid_tenant_id}

  @spec check_bucket_limit(map(), tenant_id()) :: :ok | {:error, term()}
  defp check_bucket_limit(state, tenant_id) do
    count = length(:ets.lookup(state.tenant_index, tenant_id))

    if count >= @max_buckets_per_tenant do
      {:error, :bucket_limit_reached}
    else
      :ok
    end
  end

  @spec build_bucket(String.t(), tenant_id(), keyword()) :: bucket()
  defp build_bucket(name, tenant_id, opts) do
    now = DateTime.utc_now()

    %{
      id: generate_bucket_id(name, tenant_id),
      name: name,
      tenant_id: tenant_id,
      description: Keyword.get(opts, :description),
      access_policy: Keyword.get(opts, :access_policy, default_access_policy()),
      retention_policy: Keyword.get(opts, :retention_policy, default_retention_policy()),
      quota_bytes: Keyword.get(opts, :quota_bytes, @default_quota),
      used_bytes: 0,
      container_count: 0,
      status: :active,
      metadata: Keyword.get(opts, :metadata, %{}),
      created_at: now,
      updated_at: now,
      archived_at: nil
    }
  end

  @spec generate_bucket_id(String.t(), tenant_id()) :: bucket_id()
  defp generate_bucket_id(name, tenant_id) do
    random = :crypto.strong_rand_bytes(4) |> Base.encode16(case: :lower)
    "#{tenant_id}:#{name}:#{random}"
  end

  @spec default_access_policy() :: access_policy()
  defp default_access_policy do
    %{
      read: [],
      write: [],
      admin: [],
      public_read: false
    }
  end

  @spec default_retention_policy() :: retention_policy()
  defp default_retention_policy do
    %{
      min_retention_days: nil,
      max_retention_days: nil,
      auto_archive_days: nil,
      # Default to eventually hard-deleting archived/deleted buckets to avoid unbounded ETS growth.
      auto_delete_days: 30
    }
  end

  @spec validate_access_policy(access_policy()) :: :ok | {:error, term()}
  defp validate_access_policy(policy) when is_map(policy) do
    required_keys = [:read, :write, :admin, :public_read]

    if Enum.all?(required_keys, &Map.has_key?(policy, &1)) do
      :ok
    else
      {:error, :invalid_access_policy}
    end
  end

  defp validate_access_policy(_), do: {:error, :invalid_access_policy}

  @spec validate_retention_policy(retention_policy()) :: :ok | {:error, term()}
  defp validate_retention_policy(policy) when is_map(policy), do: :ok
  defp validate_retention_policy(_), do: {:error, :invalid_retention_policy}

  @spec get_bucket_if_active(map(), bucket_id()) :: {:ok, bucket()} | {:error, term()}
  defp get_bucket_if_active(state, bucket_id) do
    case :ets.lookup(state.buckets, bucket_id) do
      [{^bucket_id, %{status: :active} = bucket}] -> {:ok, bucket}
      [{^bucket_id, %{status: :archived}}] -> {:error, :bucket_archived}
      [{^bucket_id, %{status: :deleted}}] -> {:error, :bucket_deleted}
      [] -> {:error, :not_found}
    end
  end

  @spec check_quota(bucket(), non_neg_integer()) :: :ok | {:error, term()}
  defp check_quota(%{quota_bytes: nil}, _size), do: :ok

  defp check_quota(%{quota_bytes: quota, used_bytes: used}, size) do
    if used + size > quota do
      {:error, :quota_exceeded}
    else
      :ok
    end
  end

  @spec check_user_access(access_policy(), String.t(), atom()) :: boolean()
  defp check_user_access(policy, user_id, :read) do
    policy.public_read or user_id in policy.read or user_id in policy.write or
      user_id in policy.admin
  end

  defp check_user_access(policy, user_id, :write) do
    user_id in policy.write or user_id in policy.admin
  end

  defp check_user_access(policy, user_id, :admin) do
    user_id in policy.admin
  end

  @spec maybe_update(bucket(), atom(), keyword()) :: bucket()
  defp maybe_update(bucket, key, updates) do
    case Keyword.fetch(updates, key) do
      {:ok, value} -> Map.put(bucket, key, value)
      :error -> bucket
    end
  end

  defp schedule_cleanup do
    Process.send_after(self(), :cleanup, @cleanup_interval)
  end

  @spec apply_retention_policies(map()) :: map()
  defp apply_retention_policies(state) do
    now = DateTime.utc_now()

    {archived_count, deleted_count} =
      :ets.foldl(
        fn {bucket_id, bucket}, {archived_acc, deleted_acc} ->
          {archived_delta, deleted_delta} = apply_retention_policy(state, bucket_id, bucket, now)
          {archived_acc + archived_delta, deleted_acc + deleted_delta}
        end,
        {0, 0},
        state.buckets
      )

    if archived_count > 0 or deleted_count > 0 do
      Logger.info("CBCP retention cleanup", archived: archived_count, deleted: deleted_count)

      :telemetry.execute(
        @telemetry ++ [:cleanup],
        %{archived: archived_count, deleted: deleted_count},
        %{timestamp: now}
      )
    end

    state
  end

  @spec apply_retention_policy(map(), bucket_id(), bucket(), DateTime.t()) ::
          {non_neg_integer(), non_neg_integer()}
  defp apply_retention_policy(state, bucket_id, bucket, now) do
    policy = bucket.retention_policy || default_retention_policy()
    auto_archive_days = Map.get(policy, :auto_archive_days)
    auto_delete_days = Map.get(policy, :auto_delete_days)

    cond do
      bucket.status == :active and is_integer(auto_archive_days) and auto_archive_days >= 0 and
          older_than_days?(bucket.updated_at, now, auto_archive_days) ->
        archived_bucket = %{
          bucket
          | status: :archived,
            archived_at: now,
            updated_at: now
        }

        :ets.insert(state.buckets, {bucket_id, archived_bucket})
        emit_telemetry(:auto_archive, %{bucket_id: bucket_id})
        {1, 0}

      bucket.status == :archived and is_integer(auto_delete_days) and auto_delete_days >= 0 and
          older_than_days?(bucket.archived_at || bucket.updated_at, now, auto_delete_days) ->
        hard_delete_bucket(state, bucket_id, bucket)
        emit_telemetry(:auto_delete, %{bucket_id: bucket_id, prior_status: :archived})
        {0, 1}

      bucket.status == :deleted and is_integer(auto_delete_days) and auto_delete_days >= 0 and
          older_than_days?(bucket.updated_at, now, auto_delete_days) ->
        hard_delete_bucket(state, bucket_id, bucket)
        emit_telemetry(:auto_delete, %{bucket_id: bucket_id, prior_status: :deleted})
        {0, 1}

      true ->
        {0, 0}
    end
  end

  @spec hard_delete_bucket(map(), bucket_id(), bucket()) :: :ok
  defp hard_delete_bucket(state, bucket_id, bucket) do
    :ets.delete(state.buckets, bucket_id)
    :ets.match_delete(state.tenant_index, {bucket.tenant_id, bucket_id})
    :ets.match_delete(state.container_index, {bucket_id, :_})
    :ok
  end

  @spec older_than_days?(DateTime.t() | nil, DateTime.t(), non_neg_integer()) :: boolean()
  defp older_than_days?(nil, _now, _days), do: false

  defp older_than_days?(%DateTime{} = timestamp, %DateTime{} = now, days) when is_integer(days) do
    seconds = days * 86_400
    DateTime.diff(now, timestamp, :second) >= seconds
  end

  @spec emit_telemetry(atom(), map()) :: :ok
  defp emit_telemetry(event, metadata) do
    :telemetry.execute(@telemetry ++ [event], %{count: 1}, metadata)
  end
end
