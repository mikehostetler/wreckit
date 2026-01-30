System archeology for wreckit. No opinions, only traces.

PHASE 1 - Entry points:
CLI | src/index.ts:76 | orchestrateAll (default)
CLI | src/index.ts:168 | ideasCommand
CLI | src/index.ts:182 | statusCommand
CLI | src/index.ts:187 | listCommand
CLI | src/index.ts:194 | showCommand
CLI | src/index.ts:200 | runPhaseCommand
CLI | src/index.ts:208 | runCommand
CLI | src/index.ts:215 | orchestrateNext
CLI | src/index.ts:221 | doctorCommand
CLI | src/index.ts:227 | initCommand
CLI | src/index.ts:232 | rollbackCommand
CLI | src/index.ts:237 | strategyCommand
CLI | src/index.ts:243 | learnCommand
CLI | src/index.ts:248 | dreamCommand
CLI | src/index.ts:253 | summarizeCommand
CLI | src/index.ts:258 | geneticistCommand
CLI | src/index.ts:271 | watchdogCommand
CLI | src/index.ts:285 | sprite*Command

PHASE 2 - Traces (one per entry point):
src/index.ts:76 -> src/commands/orchestrator.ts:126 -> src/commands/orchestrator.ts:321 -> src/commands/run.ts:38 -> src/commands/phase.ts:47 -> src/workflow/index.ts:49 -> src/agent/index.ts:127
src/index.ts:168 -> src/commands/ideas.ts:90 -> src/domain/ideas-agent.ts:15 -> src/agent/index.ts:249 -> src/domain/ideas.ts:166
src/index.ts:221 -> src/commands/doctor.ts:40 -> src/doctor.ts:34 -> src/agent/healingRunner.ts:68
src/index.ts:248 -> src/commands/dream.ts:26 -> src/agent/dreamer.ts:31 -> src/agent/index.ts:127

PHASE 3 - Shared modules:
src/agent/index.ts (Tracing: orchestrateAll, ideasCommand, dreamCommand)
src/fs/paths.ts (Tracing: All commands)
src/config.ts (Tracing: All commands)
src/logging.ts (Tracing: All commands)
src/domain/items.ts (Tracing: orchestrateAll, listCommand, statusCommand)

PHASE 4 - Orphans:
src/commands/sdk-info.ts (Commented out in src/index.ts)
src/commands/execute-roadmap.ts (Imported but possibly unused in active paths)
