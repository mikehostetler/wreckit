#!/usr/bin/env bash

# Install git hooks for Spec Kit
#
# Installs pre-push hook that runs CI locally via act before allowing push.
#
# Usage:
#   ./.specify/scripts/bash/install-hooks.sh [OPTIONS]
#
# OPTIONS:
#   --force            Overwrite existing hooks
#   --uninstall        Remove Spec Kit hooks
#   --help, -h         Show help message

set -e

# Parse command line arguments
FORCE=false
UNINSTALL=false

for arg in "$@"; do
    case "$arg" in
        --force)
            FORCE=true
            ;;
        --uninstall)
            UNINSTALL=true
            ;;
        --help|-h)
            cat << 'EOF'
Usage: install-hooks.sh [OPTIONS]

Installs git hooks for Spec Kit CI enforcement.

OPTIONS:
  --force       Overwrite existing hooks
  --uninstall   Remove Spec Kit hooks
  --help, -h    Show this help message

HOOKS INSTALLED:
  pre-push      Runs act to verify CI passes before push

EXAMPLES:
  # Install hooks
  ./install-hooks.sh

  # Force overwrite existing hooks
  ./install-hooks.sh --force

  # Remove hooks
  ./install-hooks.sh --uninstall

EOF
            exit 0
            ;;
        *)
            echo "ERROR: Unknown option '$arg'. Use --help for usage information." >&2
            exit 1
            ;;
    esac
done

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

info() { echo -e "${BLUE}[hooks]${NC} $1"; }
success() { echo -e "${GREEN}[hooks]${NC} $1"; }
warn() { echo -e "${YELLOW}[hooks]${NC} $1"; }
error() { echo -e "${RED}[hooks]${NC} $1" >&2; }

# Get script and repo root
SCRIPT_DIR="$(CDPATH="" cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Verify git repository
if ! git -C "$REPO_ROOT" rev-parse --git-dir &> /dev/null; then
    error "Not a git repository: $REPO_ROOT"
    exit 1
fi

HOOKS_DIR="$REPO_ROOT/.git/hooks"
SPECKIT_MARKER="# SPECKIT-MANAGED-HOOK"

# Uninstall hooks
if $UNINSTALL; then
    info "Uninstalling Spec Kit hooks..."

    if [[ -f "$HOOKS_DIR/pre-push" ]] && grep -q "$SPECKIT_MARKER" "$HOOKS_DIR/pre-push"; then
        rm "$HOOKS_DIR/pre-push"
        success "Removed pre-push hook"
    else
        info "No Spec Kit pre-push hook found"
    fi

    exit 0
fi

# Check prerequisites
info "Checking prerequisites..."

if ! command -v act &> /dev/null; then
    warn "act is not installed - hook will fail until act is available"
    echo "  Install: brew install act (macOS) or see https://github.com/nektos/act"
fi

if ! docker info &> /dev/null 2>&1; then
    warn "Docker is not running - hook will fail until Docker is available"
fi

# Install pre-push hook
info "Installing pre-push hook..."

PRE_PUSH_HOOK="$HOOKS_DIR/pre-push"

# Check if hook already exists
if [[ -f "$PRE_PUSH_HOOK" ]]; then
    if grep -q "$SPECKIT_MARKER" "$PRE_PUSH_HOOK"; then
        if $FORCE; then
            info "Overwriting existing Spec Kit hook..."
        else
            success "Spec Kit pre-push hook already installed"
            exit 0
        fi
    else
        if $FORCE; then
            warn "Overwriting existing non-Spec Kit hook (backup: pre-push.backup)"
            cp "$PRE_PUSH_HOOK" "$PRE_PUSH_HOOK.backup"
        else
            error "Existing pre-push hook found (not managed by Spec Kit)"
            echo "  Use --force to overwrite (creates backup)"
            exit 1
        fi
    fi
fi

# Create hooks directory if needed
mkdir -p "$HOOKS_DIR"

# Write the hook
cat > "$PRE_PUSH_HOOK" << 'EOF'
#!/usr/bin/env bash
# SPECKIT-MANAGED-HOOK
# Pre-push hook: Run CI locally via act before pushing
#
# Bypass: SPECKIT_SKIP_CI=1 git push
# Uninstall: ./.specify/scripts/bash/install-hooks.sh --uninstall

set -e

# Find repo root
REPO_ROOT="$(git rev-parse --show-toplevel)"

# Run pre-push CI check
if [[ -f "$REPO_ROOT/.specify/scripts/bash/pre-push-ci.sh" ]]; then
    exec "$REPO_ROOT/.specify/scripts/bash/pre-push-ci.sh"
else
    echo "Warning: pre-push-ci.sh not found, skipping CI check"
    exit 0
fi
EOF

chmod +x "$PRE_PUSH_HOOK"

success "Pre-push hook installed"
echo ""
info "What happens now:"
echo "  - Every 'git push' will run act to verify CI passes"
echo "  - Push is blocked if CI fails"
echo "  - Bypass (emergency): SPECKIT_SKIP_CI=1 git push"
echo ""
info "To uninstall: ./.specify/scripts/bash/install-hooks.sh --uninstall"
