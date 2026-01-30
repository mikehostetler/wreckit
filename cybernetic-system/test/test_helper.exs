# Test configuration is in config/test.exs
# This file only handles test framework setup

# Start application services needed by unit tests
# In minimal_test_mode (default), only essential services are started
{:ok, _} = Application.ensure_all_started(:cybernetic)

# Integration tests run via `mix test --include integration`
ExUnit.start()

# Start the Repo for database tests
{:ok, _} = Cybernetic.Repo.start_link()
Ecto.Adapters.SQL.Sandbox.mode(Cybernetic.Repo, :manual)
