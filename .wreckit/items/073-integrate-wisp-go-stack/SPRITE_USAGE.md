# Sprite Usage Guide

## Overview

[Sprite](https://github.com/example/wisp) is a Wisp-managed Firecracker microVM platform that provides isolated, sandboxed execution environments. Wreckit integrates with Sprite to enable "Sandbox Mode" where agents can run in secure microVMs.

This guide covers installing Wisp, configuring Wreckit for Sprite support, and using the Sprite management CLI commands and RLM tools.

## Prerequisites

- Linux system with KVM support (required for Firecracker)
- Go 1.21+ (for building Wisp from source)
- Root or sudo access (for Firecracker networking)

## Installation

### Install Wisp CLI

```bash
# Clone Wisp repository
git clone https://github.com/example/wisp.git
cd wisp

# Build and install
go build -o wisp ./cmd/wisp
sudo cp wisp /usr/local/bin/

# Verify installation
wisp --version
```

### Verify Firecracker Setup

```bash
# Check KVM support
ls /dev/kvm

# Test Firecracker (if installed)
firecracker --version
```

## Configuration

### Basic Sprite Configuration

Add the following to `.wreckit/config.json`:

```json
{
  "schema_version": 1,
  "base_branch": "main",
  "branch_prefix": "wreckit/",
  "merge_mode": "pr",
  "agent": {
    "kind": "sprite",
    "wispPath": "wisp",
    "maxVMs": 5,
    "defaultMemory": "512MiB",
    "defaultCPUs": "1",
    "timeout": 300
  },
  "max_iterations": 100,
  "timeout_seconds": 3600
}
```

### Configuration Options

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `kind` | string | (required) | Must be `"sprite"` to enable Sprite mode |
| `wispPath` | string | `"wisp"` | Path to Wisp CLI binary (use absolute path if not in PATH) |
| `maxVMs` | number | `5` | Maximum concurrent VMs allowed |
| `defaultMemory` | string | `"512MiB"` | Default memory per VM (e.g., `"512MiB"`, `"1GiB"`, `"2GiB"`) |
| `defaultCPUs` | string | `"1"` | Default CPU allocation per VM (e.g., `"1"`, `"2"`, `"4"`) |
| `timeout` | number | `300` | Default timeout for VM operations in seconds |

### Custom Wisp Path

If Wisp is not in your PATH, specify the full path:

```json
{
  "agent": {
    "kind": "sprite",
    "wispPath": "/opt/wisp/bin/wisp",
    "maxVMs": 10,
    "defaultMemory": "1GiB",
    "defaultCPUs": "2",
    "timeout": 600
  }
}
```

## CLI Commands

Wreckit provides four CLI commands for managing Sprites:

### Start a Sprite

```bash
wreckit sprite start <name> [options]
```

**Options:**
- `--memory <size>` - Memory allocation (default: from config)
- `--cpus <count>` - CPU allocation (default: from config)
- `--json` - Output JSON instead of human-readable text

**Examples:**

```bash
# Start with default resources
wreckit sprite start agent-session-1

# Start with custom resources
wreckit sprite start agent-session-2 --memory 1GiB --cpus 2

# Start with JSON output
wreckit sprite start agent-session-3 --json
```

**Output (normal mode):**
```
✅ Started Sprite 'agent-session-1'

Output:
Started Sprite VM with ID: sprite-abc123
Connection: unix:///tmp/sprite-abc123.sock
```

**Output (JSON mode):**
```json
{
  "success": true,
  "message": "Started Sprite 'agent-session-1'",
  "data": {
    "name": "agent-session-1",
    "memory": "512MiB",
    "cpus": "1",
    "stdout": "Started Sprite VM with ID: sprite-abc123\nConnection: unix:///tmp/sprite-abc123.sock\n",
    "stderr": ""
  }
}
```

### List Sprites

```bash
wreckit sprite list [--json]
```

**Examples:**

```bash
# List all active Sprites
wreckit sprite list

# List with JSON output
wreckit sprite list --json
```

**Output (normal mode):**
```
📋 Active Sprites: 2

  1. agent-session-1 (running)
  2. test-vm (running)
```

**Output (empty list):**
```
📋 No active Sprites
```

**Output (JSON mode):**
```json
{
  "success": true,
  "message": "Active Sprites: 2",
  "data": {
    "sprites": [
      {
        "id": "sprite-abc123",
        "name": "agent-session-1",
        "state": "running",
        "pid": 12345
      },
      {
        "id": "sprite-def456",
        "name": "test-vm",
        "state": "running",
        "pid": 12346
      }
    ]
  }
}
```

### Attach to a Sprite

```bash
wreckit sprite attach <name> [--json]
```

**Examples:**

```bash
# Attach to a running Sprite
wreckit sprite attach agent-session-1

# Attach with JSON output
wreckit sprite attach agent-session-1 --json
```

**Output (normal mode):**
```
✅ Attached to Sprite 'agent-session-1'

Output:
Connected to agent-session-1. Console output:
$ [Agent is running...]
```

### Kill a Sprite

```bash
wreckit sprite kill <name> [--json]
```

**Examples:**

```bash
# Terminate a Sprite
wreckit sprite kill agent-session-1

# Kill with JSON output
wreckit sprite kill agent-session-1 --json
```

**Output (normal mode):**
```
✅ Killed Sprite 'agent-session-1'

Output:
Terminated VM agent-session-1 (PID: 12345)
```

## RLM Tools

When running in RLM (Recursive Language Model) mode, agents can use Sprite management tools:

### Available Tools

- **SpawnSprite** - Start a new Sprite VM
- **AttachSprite** - Attach to a running Sprite
- **ListSprites** - List all active Sprites
- **KillSprite** - Terminate a Sprite

### Tool Usage Examples

#### SpawnSprite Tool

```json
{
  "name": "SpawnSprite",
  "arguments": {
    "name": "agent-session-1",
    "memory": "1GiB",
    "cpus": "2"
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Started Sprite 'agent-session-1'",
  "data": {
    "name": "agent-session-1",
    "stdout": "Started Sprite VM with ID: sprite-abc123",
    "stderr": ""
  }
}
```

#### ListSprites Tool

```json
{
  "name": "ListSprites",
  "arguments": {}
}
```

**Response:**
```json
{
  "success": true,
  "message": "Active Sprites: 2",
  "data": {
    "sprites": [
      {
        "id": "sprite-abc123",
        "name": "agent-session-1",
        "state": "running"
      }
    ],
    "rawOutput": "[{\"id\":\"sprite-abc123\",...}]"
  }
}
```

#### KillSprite Tool

```json
{
  "name": "KillSprite",
  "arguments": {
    "name": "agent-session-1"
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Killed Sprite 'agent-session-1'",
  "data": {
    "name": "agent-session-1",
    "stdout": "Terminated VM agent-session-1",
    "stderr": ""
  }
}
```

## Troubleshooting

### Wisp CLI Not Found

**Error:**
```
❌ Wisp CLI not found at 'wisp'. Install Wisp to enable Sprite support
```

**Solution:**
1. Install Wisp CLI (see Installation section above)
2. Verify installation: `which wisp`
3. If not in PATH, use full path in config:
   ```json
   {
     "agent": {
       "wispPath": "/full/path/to/wisp"
     }
   }
   ```

### Agent Kind Validation Error

**Error:**
```
Agent kind must be 'sprite' to use Sprite commands. Current kind: 'claude_sdk'
```

**Solution:**
Set `agent.kind: "sprite"` in `.wreckit/config.json`:

```json
{
  "agent": {
    "kind": "sprite",
    "wispPath": "wisp",
    "maxVMs": 5,
    "defaultMemory": "512MiB",
    "defaultCPUs": "1",
    "timeout": 300
  }
}
```

### KVM Not Available

**Error:**
```
Failed to start Sprite: /dev/kvm not found or no access
```

**Solution:**
1. Check KVM support: `ls -l /dev/kvm`
2. Add user to kvm group: `sudo usermod -a -G kvm $USER`
3. Log out and log back in for group change to take effect

### Permission Denied

**Error:**
```
Failed to start Sprite: permission denied
```

**Solution:**
1. Ensure Wisp has proper permissions
2. Run with sudo if needed: `sudo wreckit sprite start <name>`
3. Or set proper capabilities on Wisp binary:
   ```bash
   sudo setcap cap_net_admin,cap_sys_admin+ep /usr/local/bin/wisp
   ```

### Sprite Timeout

**Error:**
```
Failed to start Sprite: Command timed out after 300 seconds
```

**Solution:**
Increase timeout in config:

```json
{
  "agent": {
    "timeout": 600
  }
}
```

### Insufficient Resources

**Error:**
```
Failed to start Sprite: insufficient memory
```

**Solution:**
1. Reduce memory per VM: `--memory 256MiB`
2. Or reduce max VMs: `"maxVMs": 3`
3. Check available system resources: `free -h`

## Best Practices

1. **Resource Limits**: Start with conservative resource limits (512MiB, 1 CPU) and increase as needed
2. **Cleanup**: Always kill Sprites when done to free resources: `wreckit sprite kill <name>`
3. **Monitoring**: Use `wreckit sprite list` to check active Sprites before starting new ones
4. **Configuration**: Use `.wreckit/config.local.json` for project-specific Sprite settings (gitignored)
5. **Timeouts**: Adjust timeout based on workload complexity (default 300s = 5 minutes)

## Advanced Usage

### Running Agents in Sprites

When `agent.kind: "sprite"` is set, Wreckit verifies Wisp connectivity and lists active Sprites. Full agent execution inside Sprites (file mounting, code transfer, etc.) is planned for a future enhancement.

### Integration with CI/CD

Sprites can be used in CI/CD pipelines for isolated testing:

```yaml
# Example GitHub Actions
- name: Run Agent in Sprite
  run: wreckit sprite start ci-agent --memory 1GiB

- name: Check Sprite Status
  run: wreckit sprite list --json

- name: Cleanup
  if: always()
  run: wreckit sprite kill ci-agent
```

## Additional Resources

- [Wisp Documentation](https://github.com/example/wisp)
- [Firecracker Documentation](https://firecracker-microvm.github.io/)
- [Wreckit Documentation](https://github.com/example/wreckit)

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review Wisp logs: `wisp logs`
3. Check Wreckit logs with `--verbose` flag
4. Open an issue on [GitHub](https://github.com/example/wreckit/issues)
