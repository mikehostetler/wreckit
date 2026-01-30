defmodule Cybernetic.Archeology.EntryPoints do
  @moduledoc """
  Discovers all external entry points in the codebase.

  Entry points include:
  - HTTP endpoints (Phoenix routes)
  - AMQP consumers
  - CLI tasks (Mix tasks)
  - Cron jobs (Oban workers)
  """

  require Logger

  @type entry_point :: %{
          id: String.t(),
          type: :http | :amqp | :cli | :cron | :telegram | :mcp,
          module: module(),
          function: atom(),
          arity: non_neg_integer(),
          file: String.t(),
          line: non_neg_integer(),
          metadata: map()
        }

  @doc """
  Discovers all external entry points in the codebase.
  """
  @spec discover(Cybernetic.Archeology.Catalog.catalog()) :: [entry_point()]
  def discover(catalog) do
    Logger.debug("Discovering entry points...")

    []
    |> discover_http_routes(catalog)
    |> discover_amqp_consumers(catalog)
    |> discover_mix_tasks(catalog)
    |> discover_cron_jobs(catalog)
    |> discover_telegram_agents(catalog)
    |> discover_mcp_endpoints(catalog)
    |> Enum.uniq_by(&{&1.type, &1.module, &1.function, &1.arity})
    |> assign_entry_point_ids()
  end

  # HTTP Routes Discovery
  defp discover_http_routes(entry_points, catalog) do
    # Find router files
    router_files =
      catalog.modules
      |> Enum.filter(fn {mod, _} ->
        Module.split(mod) |> List.last() == "Router"
      end)
      |> Enum.map(fn {_mod, info} -> info.file end)

    # Parse router files for route definitions
    Enum.reduce(router_files, entry_points, fn file, acc ->
      case parse_router_file(file) do
        {:ok, routes} -> acc ++ routes
        _ -> acc
      end
    end)
  end

  defp parse_router_file(file) do
    case File.read(file) do
      {:ok, content} ->
        ast = Code.string_to_quoted(content, file: file)
        {:ok, extract_routes_from_ast(ast, file)}

      {:error, _reason} ->
        {:error, :file_not_found}
    end
  end

  defp extract_routes_from_ast({:__block__, _, body}, file) do
    Enum.flat_map(body, &extract_routes_from_ast(&1, file))
  end

  defp extract_routes_from_ast({:def, _, [{:when, _, _}, [do: body]]}, file) do
    extract_routes_from_ast(body, file)
  end

  defp extract_routes_from_ast({:def, _, [_, [do: body]]}, file) do
    extract_routes_from_ast(body, file)
  end

  defp extract_routes_from_ast(ast, file) do
    case ast do
      # get "/", PageController, :index
      {:get, meta, [path, controller, action]} ->
        [build_http_entry_point(:get, path, controller, action, meta, file)]

      # post "/", PageController, :index
      {:post, meta, [path, controller, action]} ->
        [build_http_entry_point(:post, path, controller, action, meta, file)]

      # put "/", PageController, :index
      {:put, meta, [path, controller, action]} ->
        [build_http_entry_point(:put, path, controller, action, meta, file)]

      # patch "/", PageController, :index
      {:patch, meta, [path, controller, action]} ->
        [build_http_entry_point(:patch, path, controller, action, meta, file)]

      # delete "/", PageController, :index
      {:delete, meta, [path, controller, action]} ->
        [build_http_entry_point(:delete, path, controller, action, meta, file)]

      # pipe macro
      {:pipe, _, [_pipe_name, [do: body]]} ->
        extract_routes_from_ast(body, file)

      # scope macro
      {:scope, _, [_path, [do: body]]} ->
        extract_routes_from_ast(body, file)

      # Pipeline of routes
      {:/, _, [_, body]} ->
        extract_routes_from_ast(body, file)

      # Lists
      routes when is_list(routes) ->
        Enum.flat_map(routes, &extract_routes_from_ast(&1, file))

      _ ->
        []
    end
  end

  defp build_http_entry_point(method, path, controller_ast, action_ast, meta, file) do
    controller = extract_module_from_ast(controller_ast)
    action = extract_atom_from_ast(action_ast)
    line = Keyword.get(meta, :line, 0)

    %{
      type: :http,
      module: controller,
      function: action,
      arity: 2,
      file: file,
      line: line,
      metadata: %{
        method: method,
        path: path
      }
    }
  end

  # AMQP Consumers Discovery
  defp discover_amqp_consumers(entry_points, catalog) do
    # Find modules that use GenServer or AMQP.Consumer
    consumers =
      catalog.modules
      |> Enum.filter(fn {mod, _mod_info} ->
        mod_name = Module.split(mod) |> List.last() |> String.downcase()
        String.contains?(mod_name, "consumer")
      end)
      |> Enum.map(fn {mod, _info} ->
        # Find handle_info functions that process :basic_deliver
        catalog.functions
        |> Enum.filter(fn fn_ref ->
          fn_ref.module == mod and
            fn_ref.function == :handle_info and
            fn_ref.arity == 2
        end)
        |> Enum.map(fn fn_ref ->
          %{
            type: :amqp,
            module: mod,
            function: :handle_info,
            arity: 2,
            file: fn_ref.file,
            line: fn_ref.line,
            metadata: %{
              message_type: :basic_deliver
            }
          }
        end)
      end)
      |> List.flatten()

    entry_points ++ consumers
  end

  # Mix Tasks Discovery
  defp discover_mix_tasks(entry_points, catalog) do
    # Find all modules in Mix.Tasks namespace
    tasks =
      catalog.modules
      |> Enum.filter(fn {mod, _} ->
        match?(["Mix", "Tasks", _rest | _], Module.split(mod))
      end)
      |> Enum.map(fn {mod, _info} ->
        # Find the run/1 function
        case Enum.find(catalog.functions, fn fn_ref ->
          fn_ref.module == mod and fn_ref.function == :run and fn_ref.arity == 1
        end) do
          nil ->
            nil

          fn_ref ->
            %{
              type: :cli,
              module: mod,
              function: :run,
              arity: 1,
              file: fn_ref.file,
              line: fn_ref.line,
              metadata: %{
                task_name: task_name_from_module(mod)
              }
            }
        end
      end)
      |> Enum.reject(&is_nil/1)

    entry_points ++ tasks
  end

  defp task_name_from_module(mod) do
    mod
    |> Module.split()
    |> Enum.drop(2)
    |> Enum.map(&String.downcase/1)
    |> Enum.join(".")
  end

  # Cron Jobs Discovery (Oban Workers)
  defp discover_cron_jobs(entry_points, catalog) do
    # Find Oban worker modules
    workers =
      catalog.modules
      |> Enum.filter(fn {mod, _mod_info} ->
        mod_name = mod |> Module.split() |> List.last("") |> String.downcase()
        String.contains?(mod_name, "worker") or String.contains?(mod_name, "job")
      end)
      |> Enum.map(fn {mod, _info} ->
        # Find the perform/1 function
        case Enum.find(catalog.functions, fn fn_ref ->
          fn_ref.module == mod and fn_ref.function == :perform and fn_ref.arity == 1
        end) do
          nil ->
            nil

          fn_ref ->
            %{
              type: :cron,
              module: mod,
              function: :perform,
              arity: 1,
              file: fn_ref.file,
              line: fn_ref.line,
              metadata: %{}
            }
        end
      end)
      |> Enum.reject(&is_nil/1)

    entry_points ++ workers
  end

  # Telegram Agents Discovery
  defp discover_telegram_agents(entry_points, catalog) do
    # Find Telegram agent modules
    agents =
      catalog.modules
      |> Enum.filter(fn {mod, _info} ->
        mod_name = mod |> Module.split() |> Enum.join(".") |> String.downcase()
        String.contains?(mod_name, "telegram")
      end)
      |> Enum.filter(fn {mod, _info} ->
        # Check if it has GenServer callbacks or polling functions
        Enum.any?(catalog.functions, fn fn_ref ->
          fn_ref.module == mod and
            (fn_ref.function == :handle_info or
              fn_ref.function == :init or
              String.contains?(to_string(fn_ref.function), "poll"))
        end)
      end)
      |> Enum.map(fn {mod, info} ->
        # Find init/1 or handle_info/2
        fn_ref =
          Enum.find(catalog.functions, fn fn_ref ->
            fn_ref.module == mod and (fn_ref.function == :init or fn_ref.function == :handle_info)
          end)

        %{
          type: :telegram,
          module: mod,
          function: if(fn_ref, do: fn_ref.function, else: :init),
          arity: if(fn_ref, do: fn_ref.arity, else: 1),
          file: if(fn_ref, do: fn_ref.file, else: info.file),
          line: if(fn_ref, do: fn_ref.line, else: info.line),
          metadata: %{}
        }
      end)

    entry_points ++ agents
  end

  # MCP Endpoints Discovery
  defp discover_mcp_endpoints(entry_points, catalog) do
    # Find MCP-related modules
    mcp_modules =
      catalog.modules
      |> Enum.filter(fn {mod, _info} ->
        mod_name = mod |> Module.split() |> Enum.join(".") |> String.downcase()
        String.contains?(mod_name, "mcp")
      end)
      |> Enum.filter(fn {mod, _info} ->
        # Check for init/2 or handle_* functions
        Enum.any?(catalog.functions, fn fn_ref ->
          fn_ref.module == mod and
            (fn_ref.function == :init or
              String.starts_with?(to_string(fn_ref.function), "handle_"))
        end)
      end)
      |> Enum.map(fn {mod, info} ->
        # Find the main callback function
        fn_ref =
          Enum.find(catalog.functions, fn fn_ref ->
            fn_ref.module == mod and
              (fn_ref.function == :init or
                String.starts_with?(to_string(fn_ref.function), "handle_"))
          end)

        %{
          type: :mcp,
          module: mod,
          function: if(fn_ref, do: fn_ref.function, else: :init),
          arity: if(fn_ref, do: fn_ref.arity, else: 2),
          file: if(fn_ref, do: fn_ref.file, else: info.file),
          line: if(fn_ref, do: fn_ref.line, else: info.line),
          metadata: %{}
        }
      end)

    entry_points ++ mcp_modules
  end

  defp extract_module_from_ast({:__aliases__, _, parts}) do
    Module.concat(parts)
  end

  defp extract_module_from_ast(_) do
    nil
  end

  defp extract_atom_from_ast({:&, _, [{name, _, _}]}) when is_atom(name), do: name
  defp extract_atom_from_ast(name) when is_atom(name), do: name
  defp extract_atom_from_ast(_), do: nil

  defp assign_entry_point_ids(entry_points) do
    entry_points
    |> Enum.with_index()
    |> Enum.map(fn {ep, index} ->
      id = "#{ep.type}_#{index}"
      Map.put(ep, :id, id)
    end)
  end
end
