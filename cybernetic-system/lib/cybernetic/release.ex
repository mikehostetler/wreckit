defmodule Cybernetic.Release do
  @moduledoc """
  Release tasks for running migrations and seeds.

  Used by the entrypoint script to run migrations before starting the app:

      bin/cybernetic eval "Cybernetic.Release.migrate()"
      bin/cybernetic eval "Cybernetic.Release.seed()"
  """
  @app :cybernetic

  @doc """
  Run all pending migrations.
  """
  def migrate do
    load_app()

    for repo <- repos() do
      {:ok, _, _} = Ecto.Migrator.with_repo(repo, &Ecto.Migrator.run(&1, :up, all: true))
    end
  end

  @doc """
  Rollback the last migration.
  """
  def rollback(repo, version) do
    load_app()
    {:ok, _, _} = Ecto.Migrator.with_repo(repo, &Ecto.Migrator.run(&1, :down, to: version))
  end

  @doc """
  Run database seeds.
  """
  def seed do
    load_app()

    for repo <- repos() do
      {:ok, _, _} =
        Ecto.Migrator.with_repo(repo, fn _repo ->
          seeds_path = priv_path_for(repo, "seeds.exs")

          if File.exists?(seeds_path) do
            Code.eval_file(seeds_path)
          end
        end)
    end
  end

  @doc """
  Create the database if it doesn't exist.
  """
  def create do
    load_app()

    for repo <- repos() do
      case repo.__adapter__().storage_up(repo.config()) do
        :ok -> IO.puts("Database created for #{inspect(repo)}")
        {:error, :already_up} -> IO.puts("Database already exists for #{inspect(repo)}")
        {:error, term} -> raise "Failed to create database: #{inspect(term)}"
      end
    end
  end

  @doc """
  Drop the database.
  """
  def drop do
    load_app()

    for repo <- repos() do
      case repo.__adapter__().storage_down(repo.config()) do
        :ok -> IO.puts("Database dropped for #{inspect(repo)}")
        {:error, :already_down} -> IO.puts("Database already dropped for #{inspect(repo)}")
        {:error, term} -> raise "Failed to drop database: #{inspect(term)}"
      end
    end
  end

  defp repos do
    Application.fetch_env!(@app, :ecto_repos)
  end

  defp load_app do
    Application.load(@app)
  end

  defp priv_path_for(repo, filename) do
    app = Keyword.get(repo.config(), :otp_app)

    repo_underscore =
      repo
      |> Module.split()
      |> List.last()
      |> Macro.underscore()

    priv_dir = "#{:code.priv_dir(app)}"

    Path.join([priv_dir, repo_underscore, filename])
  end
end
