# Plan: Align Sprite Integration

## Overview
Refactor the Sprite/Wisp integration to target the official `sprite` CLI and use the provided authentication token.

## Changes

1.  **Environment Variables (`src/agent/env.ts`)**:
    *   Add `SPRITES_` to allowed prefixes.
    *   Implement `buildSpriteEnv()` to load `SPRITES_TOKEN` from config/env.

2.  **Sprite Runner (`src/agent/sprite-runner.ts`)**:
    *   Change default binary from `wisp` to `sprite`.
    *   Update `startSprite` to call `sprite create` (and handle output parsing).
    *   Update `attachSprite` to call `sprite console`.
    *   Update `killSprite` to call `sprite delete` (assuming delete is the kill command).
    *   Inject `SPRITES_TOKEN` env var into `runWispCommand` (rename to `runSpriteCommand`).

3.  **CLI Commands (`src/commands/sprite.ts`)**:
    *   Update help text/logs to reflect `sprite` CLI usage.

4.  **Schema (`src/schemas.ts`)**:
    *   Update default `wispPath` to `sprite`.

## Verification
*   `wreckit sprite list` should try to run `sprite list` with the token.
