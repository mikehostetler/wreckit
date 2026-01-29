#!/usr/bin/env bash
set -euo pipefail

CHANNEL="${SPRITE_INSTALL_CHANNEL:-release}"
VERSION="${SPRITE_INSTALL_VERSION:-}"
BIN_DIR="${SPRITE_INSTALL_BIN_DIR:-}"

# Override URLs for testing
BASE_URL="${SPRITE_INSTALL_URL:-https://sprites-binaries.t3.storage.dev}"

# Spinner characters
SPINNER_CHARS='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
SPINNER_PID=""
SPINNER_MSG=""

# Colors
CYAN='\033[36m'
GREEN='\033[32m'
RED='\033[31m'
YELLOW='\033[33m'
RESET='\033[0m'

# Clean up spinner on exit
cleanup() {
  stop_spinner
}
trap cleanup EXIT

start_spinner() {
  SPINNER_MSG="$1"
  # Only show spinner if stdout is a terminal
  if [[ ! -t 1 ]]; then
    return
  fi
  (
    i=0
    while true; do
      printf "\r${CYAN}%s${RESET} %s " "${SPINNER_CHARS:i++%${#SPINNER_CHARS}:1}" "$SPINNER_MSG"
      sleep 0.1
    done
  ) &
  SPINNER_PID=$!
}

stop_spinner() {
  if [[ -n "${SPINNER_PID:-}" ]]; then
    kill "$SPINNER_PID" 2>/dev/null || true
    wait "$SPINNER_PID" 2>/dev/null || true
    SPINNER_PID=""
    # Clear the spinner line
    if [[ -t 1 ]]; then
      printf "\r\033[K"
    fi
  fi
}

step_done() {
  local msg="$1"
  stop_spinner
  printf "${GREEN}✓${RESET} %s\n" "$msg"
}

step_fail() {
  local msg="$1"
  stop_spinner
  printf "${RED}✗${RESET} %s\n" "$msg" >&2
}

usage() {
  echo "Install the Sprite CLI"
  echo
  echo "Usage: $0 [--channel <release|rc|dev>] [--version vX.Y.Z] [--bin-dir <dir>]"
  echo
  echo "Options:"
  echo "  --channel    Release channel (default: release). Ignored if --version is set."
  echo "  --version    Install a specific version tag (e.g., v1.2.3)."
  echo "  --bin-dir    Directory to install the sprite binary into (default: ~/.local/bin)."
  echo "  -h, --help   Show this help message."
  echo
  echo "Environment variables (for testing):"
  echo "  SPRITE_INSTALL_URL       Override base download URL"
  echo "  SPRITE_INSTALL_CHANNEL   Override default channel"
  echo "  SPRITE_INSTALL_VERSION   Override version"
  echo "  SPRITE_INSTALL_BIN_DIR   Override install directory"
}

err() { echo "Error: $*" >&2; exit 1; }

need_cmd() { command -v "$1" >/dev/null 2>&1 || err "Required command not found: $1"; }

# HTTP download abstraction - uses curl if available, falls back to wget
# Usage: http_download <url> <output_file>
# Returns: HTTP status code (or approximation for wget)
# Sets: HTTP_CODE variable
http_download() {
  local url="$1" output="$2"

  if command -v curl >/dev/null 2>&1; then
    HTTP_CODE=$(curl -sSL -w '%{http_code}' -o "$output" "$url" 2>/dev/null) || HTTP_CODE="000"
  elif command -v wget >/dev/null 2>&1; then
    # wget doesn't easily return HTTP codes, so we parse --server-response
    local stderr_file
    stderr_file=$(mktemp)
    if wget -q --server-response -O "$output" "$url" 2>"$stderr_file"; then
      HTTP_CODE="200"
    else
      # Try to extract HTTP code from server response
      HTTP_CODE=$(grep -o 'HTTP/[0-9.]* [0-9]*' "$stderr_file" | tail -1 | awk '{print $2}')
      # If we couldn't parse it, use exit-code-based approximation
      if [[ -z "$HTTP_CODE" ]]; then
        HTTP_CODE="000"
      fi
    fi
    rm -f "$stderr_file"
  else
    err "Neither curl nor wget found. Please install one of them."
  fi
}

need_http_cmd() {
  if ! command -v curl >/dev/null 2>&1 && ! command -v wget >/dev/null 2>&1; then
    err "Neither curl nor wget found. Please install one of them."
  fi
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --channel)
        [[ -n "${2:-}" ]] && CHANNEL="$2"; shift 2 ;;
      --version)
        [[ -n "${2:-}" ]] && VERSION="$2"; shift 2 ;;
      --bin-dir)
        [[ -n "${2:-}" ]] && BIN_DIR="$2"; shift 2 ;;
      -h|--help)
        usage; exit 0 ;;
      *)
        err "Unknown argument: $1" ;;
    esac
  done
}

detect_platform() {
  local os arch
  os=$(uname -s)
  arch=$(uname -m)

  case "$arch" in
    x86_64|amd64) arch="amd64" ;;
    aarch64|arm64) arch="arm64" ;;
    *) err "Unsupported architecture: $arch" ;;
  esac

  case "$os" in
    Linux) PLATFORM="linux" EXT="tar.gz" BIN_NAME="sprite" ;;
    Darwin) PLATFORM="darwin" EXT="tar.gz" BIN_NAME="sprite" ;;
    *) err "Unsupported OS: $os (use the PowerShell installer on Windows)" ;;
  esac

  ARCH="$arch"
}

resolve_prefix() {
  # Determine S3 prefix where artifacts are stored
  if [[ -n "$VERSION" ]]; then
    PREFIX="client/${VERSION}/"
    return
  fi

  if [[ "$CHANNEL" == "dev" ]]; then
    PREFIX="client/dev-latest/"
    return
  fi

  need_http_cmd

  start_spinner "Fetching latest version"

  local v="" ch_file_url
  ch_file_url="${BASE_URL}/client/${CHANNEL}.txt"

  # Try to fetch the channel file, capturing both output and HTTP code
  local tmpfile
  tmpfile=$(mktemp)
  http_download "$ch_file_url" "$tmpfile"

  if [[ "$HTTP_CODE" == "200" ]]; then
    v=$(tr -d '\r\n' < "$tmpfile")
  fi
  rm -f "$tmpfile"

  if [[ -z "$v" && "$CHANNEL" == "release" ]]; then
    # Fallback to RC channel when there are no real releases yet
    ch_file_url="${BASE_URL}/client/rc.txt"
    tmpfile=$(mktemp)
    http_download "$ch_file_url" "$tmpfile"
    if [[ "$HTTP_CODE" == "200" ]]; then
      v=$(tr -d '\r\n' < "$tmpfile")
    fi
    rm -f "$tmpfile"
  fi

  if [[ -z "$v" ]]; then
    step_fail "Fetching latest version"
    if [[ "$HTTP_CODE" == "000" ]]; then
      err "Network error: could not connect to $BASE_URL"
    elif [[ "$HTTP_CODE" == "404" ]]; then
      err "Version file not found at ${ch_file_url} (HTTP 404)"
    else
      err "Failed to fetch version info (HTTP $HTTP_CODE)"
    fi
  fi

  step_done "Fetching latest version ($v)"
  VERSION="$v"
  PREFIX="client/${VERSION}/"
}

dir_in_path() {
  local check_dir="$1"
  # Normalize the directory path
  if [[ -d "$check_dir" ]]; then
    check_dir=$(cd "$check_dir" 2>/dev/null && pwd) || return 1
  fi
  echo ":$PATH:" | grep -q ":$check_dir:"
}

choose_bindir() {
  local default_bin_dir="${SPRITE_INSTALL_DEFAULT_BIN_DIR:-$HOME/.local/bin}"

  if [[ -n "$BIN_DIR" ]]; then
    # User explicitly specified a directory - use it as-is
    DEST_DIR="$BIN_DIR"
  else
    # Check common home bin directories in preference order
    local -a preferred_dirs
    if [[ -n "${SPRITE_INSTALL_PREFERRED_DIRS:-}" ]]; then
      IFS=':' read -ra preferred_dirs <<< "$SPRITE_INSTALL_PREFERRED_DIRS"
    else
      preferred_dirs=(
        "$HOME/.local/bin"
        "$HOME/bin"
        "$HOME/.bin"
      )
    fi

    DEST_DIR=""
    for dir in "${preferred_dirs[@]}"; do
      if dir_in_path "$dir"; then
        DEST_DIR="$dir"
        break
      fi
    done

    # If none of the preferred dirs are in PATH, warn and use default
    if [[ -z "$DEST_DIR" ]]; then
      printf "${YELLOW}Warning:${RESET} None of the standard bin directories (~/.local/bin, ~/bin, ~/.bin) are in your PATH.\n"
      printf "         Using ${CYAN}%s${RESET} - you may need to add it to your PATH.\n" "$default_bin_dir"
      DEST_DIR="$default_bin_dir"
    fi
  fi

  local mkdir_err
  if ! mkdir_err=$(mkdir -p "$DEST_DIR" 2>&1); then
    err "Could not create bin directory $DEST_DIR: $mkdir_err"
  fi
  if [[ ! -d "$DEST_DIR" ]]; then
    err "Could not create bin directory: $DEST_DIR"
  fi
}

verify_checksum() {
  local archive_path="$1" sha_url="$2"

  start_spinner "Verifying checksum"

  local sha_tmp
  sha_tmp=$(mktemp)
  http_download "$sha_url" "$sha_tmp"

  if [[ "$HTTP_CODE" != "200" ]]; then
    rm -f "$sha_tmp" || true
    # Checksum file missing is a warning, not a fatal error
    stop_spinner
    printf "${YELLOW}⚠${RESET} Checksum file not available, skipping verification\n"
    return
  fi

  local expected raw first
  raw=$(cat "$sha_tmp")
  # If file includes filename, take first field; else treat as raw hash
  first=$(echo "$raw" | awk '{print $1}')
  expected="$first"

  local actual
  if command -v sha256sum >/dev/null 2>&1; then
    actual=$(sha256sum "$archive_path" | awk '{print $1}')
  else
    need_cmd shasum
    actual=$(shasum -a 256 "$archive_path" | awk '{print $1}')
  fi

  rm -f "$sha_tmp" || true

  if [[ "$actual" != "$expected" ]]; then
    step_fail "Verifying checksum"
    err "Checksum mismatch: expected $expected, got $actual. The download may be corrupted."
  fi

  step_done "Verifying checksum"
}

extract_and_install() {
  local archive_path="$1"

  start_spinner "Installing to $DEST_DIR"

  local extract_err
  if ! extract_err=$(tar -xzf "$archive_path" "$BIN_NAME" 2>&1); then
    step_fail "Installing to $DEST_DIR"
    err "Failed to extract archive: $extract_err"
  fi

  local install_err
  if ! install_err=$(install -m 0755 "$BIN_NAME" "$DEST_DIR/$BIN_NAME" 2>&1); then
    step_fail "Installing to $DEST_DIR"
    err "Failed to install binary to $DEST_DIR: $install_err"
  fi

  step_done "Installed to $DEST_DIR"
}

post_install_note() {
  if ! echo ":$PATH:" | grep -q ":$DEST_DIR:"; then
    echo "  Add to PATH: export PATH=\"$DEST_DIR:\$PATH\""
  fi
}

configure_auth() {
  if [ -n "${SETUP_SPRITE_TOKEN:-}" ]; then
    if "$DEST_DIR/sprite" auth setup --token "$SETUP_SPRITE_TOKEN"; then
      printf "\n👾 Run ${CYAN}sprite create <name>${RESET} to create your first Sprite.\n"
    else
      printf "${RED}✗${RESET} Authentication setup failed\n" >&2
      exit 1
    fi
  else
    printf "\n👾 Run ${CYAN}sprite login${RESET} to get started.\n"
  fi
}

main() {
  parse_args "$@"
  detect_platform
  resolve_prefix
  choose_bindir

  local asset="sprite-${PLATFORM}-${ARCH}.${EXT}"
  local url="${BASE_URL}/${PREFIX}${asset}"
  local sha_url="${url}.sha256"

  need_http_cmd
  need_cmd tar

  local tmpdir archive_path
  tmpdir=$(mktemp -d)
  archive_path="$tmpdir/$asset"

  start_spinner "Downloading Sprite CLI"

  http_download "$url" "$archive_path"

  if [[ "$HTTP_CODE" != "200" ]]; then
    step_fail "Downloading Sprite CLI"
    if [[ "$HTTP_CODE" == "000" ]]; then
      err "Network error: could not connect to download server"
    elif [[ "$HTTP_CODE" == "404" ]]; then
      err "Binary not found (HTTP 404). Version $VERSION may not exist for ${PLATFORM}/${ARCH}."
    else
      err "Download failed (HTTP $HTTP_CODE)"
    fi
  fi

  step_done "Downloading Sprite CLI"

  verify_checksum "$archive_path" "$sha_url"

  (cd "$tmpdir" && extract_and_install "$archive_path")

  rm -rf "$tmpdir" || true
  post_install_note
  configure_auth
}

main "$@"
