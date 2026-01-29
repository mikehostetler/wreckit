# Plan: Replace direct console calls with structured logging (048)

## User Stories
1. **US-001**: Replace console calls in `src/commands/show.ts` and `src/commands/list.ts`
2. **US-002**: Replace console calls in `src/commands/phase.ts` and `src/commands/status.ts`
3. **US-003**: Replace console calls in `src/doctor.ts` and `src/commands/doctor.ts`
4. **US-004**: Audit and replace other miscellaneous console calls in `src/workflow/` and `src/agent/`
5. **US-005**: Verify that output is still visible and correctly formatted

## Technical Implementation
- Import `logger` from `../logging` (or appropriate path).
- Replace `console.log` with `logger.info`.
- Replace `console.warn` with `logger.warn`.
- Replace `console.error` with `logger.error`.
- Ensure that the default logger level in `src/logging.ts` is appropriate for CLI usage.

## Verification Plan
- Run `wreckit show <id>` and verify output.
- Run `wreckit list` and verify output.
- Run `wreckit doctor` and verify output.
- Run with `--quiet` and `--verbose` to verify log level control.
