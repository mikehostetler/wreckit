#!/bin/bash
# Spec Kit Pre-Commit Hook Template
# Blocks commits if tests fail - enforces 100% test pass gate
#
# INSTALLATION:
#   cp .specify/templates/pre-commit-hook.sh .git/hooks/pre-commit
#   chmod +x .git/hooks/pre-commit
#
# Or with a symlink (allows updates):
#   ln -sf ../../.specify/templates/pre-commit-hook.sh .git/hooks/pre-commit

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔒 PRE-COMMIT: Running test gate"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Get list of staged files
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM)

# Check if any source files are staged
has_source_files=false
for file in $STAGED_FILES; do
    case "$file" in
        *.py|*.js|*.ts|*.jsx|*.tsx|*.go|*.rs|*.rb|*.java|*.kt|*.swift|*.c|*.cpp)
            has_source_files=true
            break
            ;;
    esac
done

# Skip if no source files changed
if [ "$has_source_files" = false ]; then
    echo "ℹ️  No source files staged - skipping tests"
    exit 0
fi

# Detect and run tests
run_tests() {
    # Node.js
    if [ -f "package.json" ] && grep -q '"test"' package.json 2>/dev/null; then
        echo "🧪 Running: npm test"
        npm test --silent
        return $?
    fi

    # Python
    if [ -f "pyproject.toml" ] || [ -f "setup.py" ] || [ -f "pytest.ini" ]; then
        if command -v pytest &> /dev/null; then
            echo "🧪 Running: pytest"
            pytest --tb=short -q
            return $?
        fi
    fi

    # Go
    if [ -f "go.mod" ]; then
        echo "🧪 Running: go test ./..."
        go test ./...
        return $?
    fi

    # Rust
    if [ -f "Cargo.toml" ]; then
        echo "🧪 Running: cargo test"
        cargo test
        return $?
    fi

    # Ruby
    if [ -f "Gemfile" ]; then
        if command -v rspec &> /dev/null; then
            echo "🧪 Running: bundle exec rspec"
            bundle exec rspec
            return $?
        fi
    fi

    # Maven
    if [ -f "pom.xml" ]; then
        echo "🧪 Running: mvn test"
        mvn test -q
        return $?
    fi

    # Gradle
    if [ -f "build.gradle" ] || [ -f "build.gradle.kts" ]; then
        echo "🧪 Running: ./gradlew test"
        ./gradlew test --quiet
        return $?
    fi

    echo "⚠️  No test framework detected"
    return 0
}

# Run tests
if run_tests; then
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "✅ PRE-COMMIT PASSED: All tests pass"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    exit 0
else
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "❌ PRE-COMMIT BLOCKED: Tests failing"
    echo ""
    echo "Fix failing tests before committing."
    echo "To bypass (NOT RECOMMENDED): git commit --no-verify"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    exit 1
fi
