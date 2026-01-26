# Roadmap

## Active Milestones

### [M1] Complete Git Integration Test Fix
**Status:** in-progress
**Target:** Q1 2026
**Strategic Goal:** CI reliability is critical for developer confidence. Git integration tests fail in CI due to temp directory nesting in the workspace git repo, causing false negatives that block legitimate PRs.

#### Objectives
- [ ] Implement `GIT_CEILING_DIRECTORIES` in `isGitRepo()` function (specs/fix-git-tests-ci.md)
- [ ] Add verification test for ceiling directory behavior
- [ ] Ensure all 23 failing tests in git integration suite pass in CI
- [ ] Document git behavior in nested repository environments
- [ ] Verify no regressions in production git operations

### [M2] Payload Size Limits Enforcement
**Status:** planned
**Target:** Q1 2026
**Strategic Goal:** Ideas ingestion lacks denial-of-service protection. Malicious or malformed inputs can consume excessive tokens and processing resources, creating cost and performance risks.

#### Objectives
- [ ] Implement payload size limits in ideas ingestion (spec 001 gap)
- [ ] Add validation: max 50 ideas, 120 char titles, 2000 char descriptions, 20 success criteria, 100 KB total
- [ ] Add informative error messages when limits exceeded
- [ ] Document limits in README.md and CLI help text
- [ ] Add unit tests for boundary conditions

### [M3] Social Engineering Prevention Hardening
**Status:** planned
**Target:** Q1 2026
**Strategic Goal:** Ideas phase relies on prompt instructions only to prevent agent from suggesting unsafe actions. This is insufficient defense against adversarial prompts or model hallucinations.

#### Objectives
- [ ] Add output validation layer to detect command injection patterns
- [ ] Implement warning system for suspicious agent suggestions
- [ ] Add user education prompts about never following agent commands during ingestion
- [ ] Create threat model documentation for social engineering vectors
- [ ] Consider adding audit logging for flagged interactions

## Backlog

### [B1] Schema Version Migration System
**Status:** planned
**Target:** Q2 2026
**Strategic Goal:** No automated migration path exists when schemas change. Users upgrading wreckit may find their items invalidated, blocking upgrades and causing data loss risk.

#### Objectives
- [ ] Design schema migration framework for item.json, prd.json, config.json
- [ ] Implement version detection and automatic migration prompts
- [ ] Add `wreckit migrate` command for explicit migration control
- [ ] Implement migration from schema_version 1 to 2 (when needed)
- [ ] Add backup creation before migration operations
- [ ] Create migration rollback capability

### [B2] Enhanced Story Scope Enforcement
**Status:** planned
**Target:** Q3 2026
**Strategic Goal:** Implementation phase allows unscoped code changes. Agents can refactor unrelated code, creating tangled commits that violate story boundaries and increase review burden.

#### Objectives
- [ ] Implement diff-size heuristics to detect scope creep during implementation
- [ ] Add file path pattern matching for story-relevant file sets
- [ ] Create warning system for off-scope changes before commit
- [ ] Add optional hard enforcement mode with auto-revert capability
- [ ] Implement scope metadata in PRD story schema
- [ ] Add scope visualization in `wreckit show <id>` output

### [B3] Observability and Metrics Infrastructure
**Status:** planned
**Target:** Q3 2026
**Strategic Goal:** No visibility into agent performance, token usage, success rates, or cost metrics. Users cannot optimize workflows or control costs without data.

#### Objectives
- [ ] Add token usage tracking per phase, per item, per run
- [ ] Implement success/failure rate metrics with trend analysis
- [ ] Create `wreckit report` command for summary statistics
- [ ] Add timing metrics to existing benchmark infrastructure
- [ ] Implement cost estimation by model and token usage
- [ ] Create metrics export format (JSON/CSV) for external analysis

### [B4] Advanced Multi-Repository Support
**Status:** planned
**Target:** Q4 2026
**Strategic Goal:** Wreckit operates on single repositories only. Organizations coordinating work across multiple repos cannot use wreckit for cross-cutting concerns.

#### Objectives
- [ ] Design multi-repo item linking and dependency model
- [ ] Implement cross-repo dependency tracking and resolution
- [ ] Add workspace-level configuration file
- [ ] Create monorepo-aware item allocation strategy
- [ ] Implement cross-repo PR coordination
- [ ] Add repository affinity settings for item placement

## Completed

### [DONE-1] Core Ralph Wiggum Loop Implementation
**Status:** done
**Target:** Q4 2024
**Strategic Goal:** Implement the autonomous agent workflow: ideas -> research -> plan -> implement -> PR -> done, enabling unsupervised backlog execution.

#### Objectives
- [x] Ideas ingestion from stdin, file, and interactive interview modes
- [x] Research phase with read-only codebase analysis and artifact validation
- [x] Plan phase with PRD and user story generation with quality checks
- [x] Implement phase with iterative story execution and progress tracking
- [x] PR phase with GitHub integration and automated PR creation
- [x] Complete phase with merge verification and state transitions
- [x] Full state machine with resumability and error recovery

### [DONE-2] SDK Agent Mode Migration
**Status:** done
**Target:** Q1 2025
**Strategic Goal:** Migrate from process-based agent spawning to Claude Agent SDK for improved performance, error handling, and tool support.

#### Objectives
- [x] Implement Claude SDK runner with direct in-process execution
- [x] Add MCP server integration for tool extensibility
- [x] Implement tool allowlist enforcement per phase (extraction-only for ideas, read-only for research/plan, scoped for implement)
- [x] Add automatic fallback to process mode on SDK authentication failure
- [x] Implement environment variable resolution (ANTHROPIC_API_KEY, ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN)
- [x] Add experimental SDK modes (Amp, Codex, OpenCode) with tool allowlists
- [x] Create MIGRATION.md with detailed configuration guide

### [DONE-3] Security Hardening and Write Containment
**Status:** done
**Target:** Q1 2025
**Strategic Goal:** Address critical security gaps where agents could modify code during read-only phases, leaking unintended changes into implementation PRs.

#### Objectives
- [x] Implement git status comparison before/after research and plan phases
- [x] Add write containment violations detection and blocking
- [x] Implement secret scanning before git push in PR phase
- [x] Add pre-push quality gates (tests, lint, typecheck)
- [x] Implement conflict detection before merge operations
- [x] Add atomic writes for all JSON files using temp file + rename pattern
- [x] Implement file locking with PID/timestamp for concurrent access protection

### [DONE-4] Artifact Quality Validation System
**Status:** done
**Target:** Q1 2025
**Strategic Goal:** Validate artifact quality beyond existence checks. Low-quality research, plans, and stories waste tokens and produce poor implementations.

#### Objectives
- [x] Implement research quality validation (citation density, required sections, file:line references)
- [x] Implement plan quality validation (phases, structure, current vs. desired state)
- [x] Implement story quality validation (acceptance criteria density, ID format, priority range)
- [x] Add story completion verification with warnings for weak completion evidence
- [x] Create validation utilities in `src/domain/validation.ts`
- [x] Integrate validation into phase transition logic

### [DONE-5] Rollback and Recovery Capabilities
**Status:** done
**Target:** Q1 2025
**Strategic Goal:** Enable recovery from failed direct merges and unwanted changes. Users need safety nets when autonomous agents make mistakes.

#### Objectives
- [x] Capture rollback_sha before direct merge operations
- [x] Implement `wreckit rollback <id>` command with force option
- [x] Add branch cleanup after successful completion
- [x] Record audit trail (completed_at, merged_at, merge_commit_sha, checks_passed)
- [x] Implement backup and restore system for doctor fixes
- [x] Add error-aware file reading to distinguish ENOENT from permission/I/O errors

### [DONE-6] Agent Doctor Self-Healing Runtime (Item 038)
**Status:** done
**Target:** Q1 2025
**Strategic Goal:** Reduce failed agent runs through automatic error detection, diagnosis, and healing. Common failures (permissions, missing files, API errors) should self-correct.

#### Objectives
- [x] Implement error detection and classification system
- [x] Create healer with automatic retry strategies for common failures
- [x] Add healing configuration to config schema (max_attempts, cooldown_seconds)
- [x] Implement healing metrics tracking (attempts, successes, failures)
- [x] Add `--no-healing` flag to disable automatic healing
- [x] Integrate healing into workflow execution
- [x] Create comprehensive healing runner with timeout and backoff

### [DONE-7] Doctor Diagnostic and Repair System
**Status:** done
**Target:** Q1 2025
**Strategic Goal:** Provide comprehensive validation and repair capabilities for repository state. Users need detection and resolution of state inconsistencies.

#### Objectives
- [x] Implement diagnostic codes for all failure modes (MISSING_CONFIG, INVALID_ITEM_JSON, STATE_FILE_MISMATCH, etc.)
- [x] Add state/artifact consistency validation per workflow state
- [x] Implement index regeneration and staleness detection
- [x] Add backup creation before applying fixes
- [x] Implement circular dependency detection in item dependencies
- [x] Add missing dependency detection and reporting
- [x] Create `wreckit doctor --fix` command with conservative repair principles

### [DONE-8] Strategic Analysis Phase Integration
**Status:** done
**Target:** Q1 2025
**Strategic Goal:** Add hierarchical control layer (Strategy -> Plan -> Implement) to prevent "Feature Factory" trap and ensure development aligns with strategic milestones.

#### Objectives
- [x] Implement `wreckit strategy` command with ROADMAP.md generation
- [x] Add strategy prompt template with codebase analysis instructions
- [x] Implement ROADMAP.md validation with machine-parseable format
- [x] Add `wreckit execute-roadmap` command to convert milestones to Items
- [x] Enforce write containment for strategy phase (ROADMAP.md only)
- [x] Integrate roadmap domain model with milestone tracking

### [DONE-9] Learn and Dream Capabilities
**Status:** done
**Target:** Q1 2025
**Strategic Goal:** Enable pattern extraction from completed work (learn) and autonomous ideation from codebase gaps (dream), creating virtuous cycle of improvement.

#### Objectives
- [x] Implement `wreckit learn` command for pattern extraction from items
- [x] Add skills.json schema and skill loading system
- [x] Implement JIT context building from skill requirements
- [x] Create `wreckit dream` command for autonomous TODO/gap scanning
- [x] Add dream MCP server with scan_tools and save_ideas tools
- [x] Implement source filtering (todo, gap, debt, all)
- [x] Add max-items limiting for dream output

### [DONE-10] Performance Benchmarking Infrastructure
**Status:** done
**Target:** Q1 2025
**Strategic Goal:** Establish performance baseline and detect regressions. Multi-actor parallelism requires efficient operations.

#### Objectives
- [x] Create benchmark suite with resumability, concurrency, and fileops tests
- [x] Implement atomic write performance testing (small, medium, large payloads)
- [x] Add lock acquisition and contention measurements
- [x] Measure parallel throughput scaling (1, 2, 4, 8 workers)
- [x] Add CSV, JSON, and Markdown reporters
- [x] Document baseline performance: 775ms total, 3699 items/sec (single), 6959 items/sec (4x parallel)

### [DONE-11] Comprehensive Test Coverage
**Status:** done
**Target:** Q1 2025
**Strategic Goal:** Achieve high test coverage across all components. Autonomous agents require rigorous testing to prevent production failures.

#### Objectives
- [x] Add 59+ test files covering commands, workflow, domain, git, and edge cases
- [x] Implement property-based testing with fast-check for critical invariants
- [x] Add integration tests for SDK modes (Claude, Amp, Codex, OpenCode)
- [x] Create isospec tests for command behaviors and CLI interfaces
- [x] Add quality validation tests (research, plan, story)
- [x] Implement git status comparison testing
- [x] Add concurrent access and corruption recovery tests
