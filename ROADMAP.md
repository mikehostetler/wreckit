# Roadmap

## Active Milestones

### [M1] Complete Missing Documentation
**Status:** in-progress
**Target:** Q1 2026
**Strategic Goal:** README references MIGRATION.md which does not exist. Users upgrading from process mode to SDK mode need clear migration guidance.

#### Objectives
- [ ] Create MIGRATION.md with step-by-step guide from process mode to SDK mode
- [ ] Document environment variable configuration for SDK mode (ANTHROPIC_API_KEY, ANTHROPIC_BASE_URL)
- [ ] Add troubleshooting section for common migration issues
- [x] SDK mode already documented in README.md

### [M2] Finish Experimental SDK Integrations
**Status:** planned
**Target:** Q1 2026
**Strategic Goal:** Three SDK integrations (Amp, Codex, OpenCode) are marked as experimental with TODO placeholders. Users need production-ready alternatives to Claude SDK for multi-model support.

#### Objectives
- [ ] Implement tool allowlist enforcement in `src/agent/amp-sdk-runner.ts`
- [ ] Implement tool allowlist enforcement in `src/agent/codex-sdk-runner.ts`
- [ ] Implement tool allowlist enforcement in `src/agent/opencode-sdk-runner.ts`
- [ ] Add integration tests for each experimental SDK
- [ ] Update documentation with supported SDK options

### [M3] Robust Error Handling and Recovery
**Status:** planned
**Target:** Q2 2026
**Strategic Goal:** Several known gaps exist around error handling: silent read errors mask real problems, no backup before doctor fixes, and ambiguous ID resolution can select wrong items.

#### Objectives
- [ ] Fix silent read errors in artifact detection (specs 002, 010 Gap: errors swallowed)
- [ ] Implement backup mechanism before doctor fixes (spec 010 Gap 3)
- [ ] Improve ambiguous ID resolution to warn/error on multiple matches (spec 009 Gap 3)
- [ ] Add distinct error types for different failure modes across all phases
- [ ] Implement progress persistence for batch operations (spec 009 Gap 2)

## Backlog

### [B1] Schema Version Migration System
**Status:** planned
**Target:** Q2 2026
**Strategic Goal:** No migration path exists when schema versions change. Old items may fail validation after wreckit upgrades, blocking users from upgrading.

#### Objectives
- [ ] Design schema migration framework for item.json, prd.json, config.json
- [ ] Implement migration from schema_version 1 to 2 (when needed)
- [ ] Add `wreckit migrate` command for explicit migration
- [ ] Add automatic migration detection in doctor command

### [B2] Enhanced Story Scope Enforcement
**Status:** planned
**Target:** Q3 2026
**Strategic Goal:** Agents can modify files beyond story scope during implementation (spec 004 Gap 2). This leads to scope creep, tangled commits, and review burden.

#### Objectives
- [ ] Implement diff-size heuristics to detect scope creep
- [ ] Add file path pattern matching for story-relevant files
- [ ] Create warning system for off-scope changes
- [ ] Consider optional hard enforcement mode with revert capability

### [B3] Observability and Metrics
**Status:** planned
**Target:** Q3 2026
**Strategic Goal:** Limited visibility into agent performance, token usage, and success rates. Users need metrics to optimize workflows and control costs.

#### Objectives
- [ ] Add token usage tracking per phase and item
- [ ] Implement success/failure rate metrics
- [ ] Create summary report command (`wreckit report`)
- [ ] Add timing metrics to benchmark infrastructure

### [B4] Multi-Repository Support
**Status:** planned
**Target:** Q4 2026
**Strategic Goal:** Wreckit currently operates on single repositories. Organizations often need to coordinate work across multiple repos.

#### Objectives
- [ ] Design multi-repo item linking model
- [ ] Implement cross-repo dependency tracking
- [ ] Add workspace-level configuration
- [ ] Create monorepo-aware item allocation

## Completed

### [DONE-1] Core Workflow Implementation
**Status:** done
**Target:** Q4 2024
**Strategic Goal:** Implement the complete Ralph Wiggum Loop: ideas -> research -> plan -> implement -> PR -> done

#### Objectives
- [x] Ideas ingestion from stdin, file, and interactive interview
- [x] Research phase with read-only codebase analysis
- [x] Plan phase with PRD and user story generation
- [x] Implement phase with iterative story execution
- [x] PR phase with GitHub integration
- [x] Complete phase with merge verification

### [DONE-2] SDK Mode Migration
**Status:** done
**Target:** Q1 2025
**Strategic Goal:** Migrate from process-based agent execution to Claude Agent SDK for better performance and reliability

#### Objectives
- [x] Implement Claude SDK runner with MCP support
- [x] Add tool allowlist enforcement per phase
- [x] Implement automatic fallback to process mode
- [x] Add environment variable resolution for SDK auth

### [DONE-3] Security Hardening
**Status:** done
**Target:** Q1 2025
**Strategic Goal:** Address critical security gaps in phase isolation and data integrity

#### Objectives
- [x] Implement git status comparison for write containment (research, plan phases)
- [x] Add secret scanning before push (PR phase)
- [x] Implement pre-push quality gates (tests, lint, typecheck)
- [x] Add conflict detection before merge
- [x] Implement atomic writes for JSON files
- [x] Add file locking for concurrent access

### [DONE-4] Quality Validation
**Status:** done
**Target:** Q1 2025
**Strategic Goal:** Validate artifact quality beyond existence checks to catch low-quality outputs

#### Objectives
- [x] Implement research quality validation (citation density, required sections)
- [x] Implement plan quality validation (phases, structure)
- [x] Implement story quality validation (acceptance criteria, ID format, priority range)
- [x] Add payload size limits for ideas ingestion
- [x] Add story completion verification with warnings

### [DONE-5] Rollback and Recovery
**Status:** done
**Target:** Q1 2025
**Strategic Goal:** Enable recovery from failed merges and unwanted changes in direct mode

#### Objectives
- [x] Capture rollback_sha before direct merge
- [x] Implement `wreckit rollback <id>` command
- [x] Add branch cleanup after completion
- [x] Record audit trail (completed_at, merged_at, merge_commit_sha, checks_passed)
