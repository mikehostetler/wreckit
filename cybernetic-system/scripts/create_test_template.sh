#!/bin/bash

# Create a test script template that uses environment variables
# Usage: ./scripts/create_test_template.sh test_name.exs

if [ $# -eq 0 ]; then
    echo "Usage: $0 <test_name.exs>"
    exit 1
fi

TEST_FILE=$1

cat > "$TEST_FILE" << 'EOF'
#!/usr/bin/env elixir

# Test script that safely uses environment variables
# Run with: ./scripts/test_with_env.sh this_script.exs

Mix.install([
  {:httpoison, "~> 2.2"},
  {:jason, "~> 1.4"}
])

defmodule TestWithEnv do
  def run do
    # Get API key from environment, with helpful error message
    api_key = System.get_env("ANTHROPIC_API_KEY")
    
    if is_nil(api_key) or api_key == "your-anthropic-api-key-here" do
      IO.puts("❌ Error: ANTHROPIC_API_KEY not set properly")
      IO.puts("Please set it in your .env file")
      IO.puts("Run: cp .env.example .env")
      IO.puts("Then edit .env with your actual API key")
      System.halt(1)
    end
    
    # Mask the key for display (show first 10 chars only)
    masked_key = String.slice(api_key, 0, 10) <> "..." <> String.slice(api_key, -4, 4)
    IO.puts("✅ Using API key: #{masked_key}")
    
    # Your test code here
    run_test(api_key)
  end
  
  defp run_test(api_key) do
    IO.puts("🧪 Running test...")
    # Add your actual test logic here
    # Example: make API call, test functionality, etc.
    
    IO.puts("✅ Test completed successfully!")
  end
end

# Run the test
TestWithEnv.run()
EOF

chmod +x "$TEST_FILE"
echo "✅ Created test template: $TEST_FILE"
echo "Edit the file to add your test logic, then run with:"
echo "./scripts/test_with_env.sh $TEST_FILE"