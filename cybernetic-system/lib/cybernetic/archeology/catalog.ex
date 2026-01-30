defmodule Cybernetic.Archeology.Catalog do
  @moduledoc """
  Builds a catalog of all functions in the codebase via AST analysis.

  The catalog contains:
  - All module definitions
  - All public function definitions (def)
  - All private function definitions (defp)
  - Function metadata (file, line, arity)
  - Call graph (which functions call which)
  """

  require Logger

  @type function_ref :: %{
          module: module(),
          function: atom(),
          arity: non_neg_integer(),
          file: String.t(),
          line: non_neg_integer(),
          type: :public | :private
        }

  @type catalog :: %{
          modules: %{module() => %{file: String.t(), line: non_neg_integer()}},
          functions: [function_ref()],
          call_graph: %{function_ref() => [function_ref()]}
        }

  @doc """
  Builds the function catalog by parsing all Elixir source files.
  """
  @spec build() :: catalog()
  def build do
    Logger.debug("Building function catalog...")

    files = find_elixir_files()

    Enum.reduce(files, initial_catalog(), fn file, acc ->
      parse_file(file, acc)
    end)
  end

  @doc """
  Finds all functions in a module.
  """
  @spec find_functions(module(), catalog()) :: [function_ref()]
  def find_functions(module, catalog) do
    Enum.filter(catalog.functions, fn fn_ref ->
      fn_ref.module == module
    end)
  end

  @doc """
  Finds a specific function reference.
  """
  @spec find_function(module(), atom(), non_neg_integer(), catalog()) ::
          function_ref() | nil
  def find_function(module, function, arity, catalog) do
    Enum.find(catalog.functions, fn fn_ref ->
      fn_ref.module == module and fn_ref.function == function and fn_ref.arity == arity
    end)
  end

  @doc """
  Gets all callers of a function.
  """
  @spec get_callers(function_ref(), catalog()) :: [function_ref()]
  def get_callers(function_ref, catalog) do
    Enum.filter(catalog.functions, fn caller_fn_ref ->
      case Map.get(catalog.call_graph, caller_fn_ref, []) do
        nil -> false
        callees ->
          Enum.any?(callees, fn callee ->
            callee.module == function_ref.module and
              callee.function == function_ref.function and
              callee.arity == function_ref.arity
          end)
      end
    end)
  end

  @doc """
  Gets all callees (functions called by) a function.
  """
  @spec get_callees(function_ref(), catalog()) :: [function_ref()]
  def get_callees(function_ref, catalog) do
    Map.get(catalog.call_graph, function_ref, [])
  end

  # Private functions

  defp initial_catalog do
    %{
      modules: %{},
      functions: [],
      call_graph: %{}
    }
  end

  defp find_elixir_files do
    lib_dir = Path.join([File.cwd!(), "lib"])

    if File.exists?(lib_dir) do
      lib_dir
      |> Path.join("**/*.ex")
      |> Path.wildcard()
    else
      []
    end
  end

  defp parse_file(file, catalog) do
    case File.read(file) do
      {:ok, content} ->
        ast = Code.string_to_quoted!(content, file: file)
        analyze_ast(ast, file, nil, catalog)

      {:error, reason} ->
        Logger.warning("Failed to read #{file}: #{reason}")
        catalog
    end
  end

  # Track module name from defmodule
  defp analyze_ast({:defmodule, _meta, [module_name, [do: body]]}, file, _current_module, catalog) do
    module = extract_module_name(module_name)
    line = get_line_from_module(module_name)

    # Register module
    modules = Map.put(catalog.modules, module, %{file: file, line: line})

    # Analyze module body with current module context
    new_catalog = %{catalog | modules: modules}
    analyze_module_body(body, file, module, new_catalog)
  end

  defp analyze_ast(ast, file, current_module, catalog) when is_list(ast) do
    Enum.reduce(ast, catalog, fn node, acc ->
      analyze_ast(node, file, current_module, acc)
    end)
  end

  defp analyze_ast(_ast, _file, _current_module, catalog) do
    catalog
  end

  defp analyze_module_body(body, file, current_module, catalog) when is_list(body) do
    Enum.reduce(body, catalog, fn node, acc ->
      analyze_module_node(node, file, current_module, acc)
    end)
  end

  defp analyze_module_body({:__block__, _meta, body}, file, current_module, catalog) do
    analyze_module_body(body, file, current_module, catalog)
  end

  defp analyze_module_body(_ast, _file, _current_module, catalog) do
    catalog
  end

  defp analyze_module_node({:def, meta, [{:when, _, [call | _guards]}, [do: body]]}, file, current_module, catalog) do
    analyze_function_def(:def, call, body, meta, file, current_module, catalog)
  end

  defp analyze_module_node({:def, meta, [call, [do: body]]}, file, current_module, catalog) do
    analyze_function_def(:def, call, body, meta, file, current_module, catalog)
  end

  defp analyze_module_node({:defp, meta, [{:when, _, [call | _guards]}, [do: body]]}, file, current_module, catalog) do
    analyze_function_def(:defp, call, body, meta, file, current_module, catalog)
  end

  defp analyze_module_node({:defp, meta, [call, [do: body]]}, file, current_module, catalog) do
    analyze_function_def(:defp, call, body, meta, file, current_module, catalog)
  end

  defp analyze_module_node(_ast, _file, _current_module, catalog) do
    catalog
  end

  defp analyze_function_def(type, call, body, meta, file, current_module, catalog) do
    case extract_function_name_and_arity(call) do
      {:ok, name, arity} ->
        line = Keyword.get(meta, :line, 0)
        fn_type = if type == :def, do: :public, else: :private

        fn_ref = %{
          module: current_module,
          function: name,
          arity: arity,
          file: file,
          line: line,
          type: fn_type
        }

        # Extract function calls from the body
        calls = extract_calls_from_body(body, current_module, file)
        call_graph = Map.put(catalog.call_graph, fn_ref, calls)

        %{catalog | functions: [fn_ref | catalog.functions], call_graph: call_graph}

      :error ->
        catalog
    end
  end

  defp extract_calls_from_body(body, current_module, file) do
    # Pre-traverse function
    pre = fn
      # Local function call: foo() or foo(arg1, arg2)
      {name, _meta, args} = ast, acc when is_atom(name) and is_list(args) ->
        # Filter out special forms, operators, and language constructs
        if is_special_form?(name) or is_operator?(name) do
          {ast, acc}
        else
          arity = length(args)
          call_ref = %{
            module: current_module,
            function: name,
            arity: arity,
            file: file,
            line: get_line_from_ast(ast),
            type: :unknown
          }
          {ast, [call_ref | acc]}
        end

      # Remote function call: Module.func() or Module.func(arg)
      {{:., _, [module_ast, func_ast]}, _meta, args} = ast, acc ->
        module = extract_module_from_ast(module_ast)
        func = extract_function_from_ast(func_ast)
        arity = length(args)

        if module && func && !is_special_form?(func) && !is_operator?(func) do
          call_ref = %{
            module: module,
            function: func,
            arity: arity,
            file: file,
            line: get_line_from_ast(ast),
            type: :unknown
          }
          {ast, [call_ref | acc]}
        else
          {ast, acc}
        end

      ast, acc ->
        {ast, acc}
    end

    # Post-traverse function (identity)
    post = fn
      ast, acc -> {ast, acc}
    end

    # Traverse the AST and extract all function calls
    {_, calls} = Macro.traverse(body, [], pre, post)

    calls
    |> Enum.reject(fn call -> is_operator?(call.function) end)
    |> Enum.reject(fn call -> is_special_form?(call.function) end)
    |> Enum.uniq()
  end

  defp is_special_form?(name) do
    name in [
      :def, :defp, :defmacro, :defmacrop,
      :use, :import, :require, :alias,
      :case, :cond, :if, :unless, :for,
      :try, :catch, :rescue, :else, :after,
      :receive, :send, :spawn, :spawn_link,
      :raise, :throw, :exit,
      :fn, :do, :end, :->,
      :&, :quote, :unquote, :unquote_splicing,
      :with
    ]
  end

  defp is_operator?(name) do
    # Elixir operators
    operators = [
      :==, :!=, :===, :!==,
      :<, :>, :<=, :>=,
      :&&, :||, :!, :++,
      :--, :*, :/, :+,
      :-, :|>, :<<>>,
      :when, :->,
      :|, :%, :%{}
    ]

    name in operators or
      String.starts_with?(to_string(name), "__") or
      name in [:self, :inspect, :is_atom, :is_list, :is_map, :is_integer, :is_tuple]
  end

  defp extract_module_from_ast({:__aliases__, _, parts}) do
    Module.concat(parts)
  end

  defp extract_module_from_ast(_) do
    nil
  end

  defp extract_function_from_ast({name, _, _}) when is_atom(name) do
    name
  end

  defp extract_function_from_ast(_) do
    nil
  end

  defp extract_module_name({:__aliases__, _, parts}) do
    Module.concat(parts)
  end

  defp extract_module_name(atom) when is_atom(atom) do
    atom
  end

  defp extract_module_name(_) do
    nil
  end

  defp extract_function_name_and_arity({name, _, args}) when is_atom(name) and is_list(args) do
    arity = length(args)
    {:ok, name, arity}
  end

  defp extract_function_name_and_arity({name, _, args}) when is_atom(name) and is_integer(args) do
    {:ok, name, args}
  end

  defp extract_function_name_and_arity(_) do
    :error
  end

  defp get_line_from_ast({_, meta, _}) when is_list(meta) do
    Keyword.get(meta, :line, 0)
  end

  defp get_line_from_ast(_) do
    0
  end

  defp get_line_from_module({_, meta, _}) when is_list(meta) do
    Keyword.get(meta, :line, 0)
  end

  defp get_line_from_module(_) do
    0
  end
end
