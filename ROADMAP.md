# Roadmap

## Active Milestones

### [M1] Resolve Remaining Critical Gaps

**Status:** in-progress
**Target:** Q1 2026
**Strategic Goal:** Several critical gaps remain that affect production readiness: schema version migration, story scope enforcement, and batch progress persistence. These are the final blockers for reliable, at-scale operation.

#### Objectives

- [ ] Design and implement schema version migration framework (spec 007 Gap 3)
- [ ] Implement diff-size heuristics for story scope enforcement (spec 004 Gap 2)
- [ ] Verify batch progress persistence handles edge cases (spec 009 Gap 2 - appears implemented in orchestrator.ts)
- [ ] Improve ambiguous ID resolution to error on multiple matches (spec 009 Gap 3)
- [ ] Implement abort-on-failure mechanism for tool allowlist violations (spec 001 Gap 3)

### [M2] Stabilize Advanced Features

**Status:** in-progress
**Target:** Q1 2026
**Strategic Goal:** The codebase contains advanced features (dream, strategy, learn) that lack spec coverage and comprehensive testing. These features represent significant value but need to be integrated into the formal specification system.

#### Objectives

- [ ] Create specifications for `wreckit dream` command (idea generation/synthesis)
- [ ] Create specifications for `wreckit strategy` command (strategic analysis phase)
- [ ] Create specifications for `wreckit learn` command (pattern extraction)
- [ ] Add comprehensive integration tests for advanced features
- [ ] Document advanced features in README.md
- [ ] Evaluate advanced features for production-readiness

## Backlog

### [B1] Enhanced Observability and Metrics

**Status:** planned
**Target:** Q2 2026
**Strategic Goal:** Limited visibility into agent performance, token usage, and success rates makes it difficult to optimize workflows and control costs. Teams need metrics to understand their AI development patterns and ROI.

#### Objectives

- [ ] Add token usage tracking per phase and item
- [ ] Implement success/failure rate metrics across all phases
- [ ] Create summary report command (`wreckit report`)
- [ ] Add timing metrics to existing benchmark infrastructure
- [ ] Implement structured logging output for observability platforms (DataDog, NewRelic)
- [ ] Create cost estimation dashboard for agent operations

### [B2] Multi-Repository and Workspace Support

**Status:** planned
**Target:** Q3 2026
**Strategic Goal:** Wreckit currently operates on single repositories. Organizations with microservices or monorepos need coordinated work across multiple repos with dependency tracking and workspace-level configuration.

#### Objectives

- [ ] Design multi-repo item linking model
- [ ] Implement cross-repo dependency tracking
- [ ] Add workspace-level configuration hierarchy
- [ ] Create monorepo-aware item allocation
- [ ] Support for multi-repo PR orchestration
- [ ] Implement workspace-scoped `.wreckit/` structure

### [B3] Advanced Error Recovery and Self-Healing

**Status:** planned
**Target:** Q3 2026
**Strategic Goal:** While error handling is robust, proactive error detection and automatic recovery could reduce manual intervention. Agent "healing" capabilities could retry failed operations with adjusted parameters.

#### Objectives

- [ ] Implement error pattern detection for common failures
- [ ] Add automatic retry with exponential backoff for transient errors
- [ ] Create context-window-error recovery (auto-split tasks)
- [ ] Implement agent healing runner for failed phases
- [ ] Add rollback verification and conflict resolution
- [ ] Create error classification system (transient vs permanent)

### [B4] Developer Experience Enhancements

**Status:** planned
**Target:** Q4 2026
**Strategic Goal:** Core workflow is solid, but developer experience could be improved with better visualization, interactive debugging, and workflow customization to reduce onboarding friction.

#### Objectives

- [ ] Create web-based dashboard for item tracking
- [ ] Implement interactive debugging mode for agent execution
- [ ] Add workflow hooks for custom pre/post processing
- [ ] Create template library for common project patterns
- [ ] Implement collaborative review workflows (multi-user)
- [ ] Add VS Code extension for item management

### [B5] Performance Optimization

**Status:** planned
**Target:** Q4 2026
**Strategic Goal:** As codebases scale, performance bottlenecks in item scanning, indexing, and batch operations become limiting factors. Optimization is needed for large monorepos.

#### Objectives

- [ ] Optimize item scanning for large repositories (1000+ items)
- [ ] Implement incremental indexing (avoid full scans)
- [ ] Add caching layer for frequently accessed artifacts
- [ ] Optimize batch progress write operations
- [ ] Implement streaming for large artifact files
- [ ] Add lazy loading for item metadata

### [B6] Security and Compliance Hardening

**Status:** planned
**Target:** Q1 2027
**Strategic Goal:** Enterprise adoption requires stronger security controls, audit trails, and compliance features. Current security model is good but not enterprise-grade.

#### Objectives

- [ ] Implement comprehensive audit logging (all operations)
- [ ] Add role-based access control for workspace operations
- [ ] Create secrets management integration (Vault, AWS Secrets Manager)
- [ ] Implement policy-as-code for agent operations (OPA)
- [ ] Add compliance reporting (SOC2, HIPAA templates)
- [ ] Implement artifact signing and verification

## Completed

### [DONE-1] Core Workflow Implementation

**Status:** done
**Target:** Q4 2024
**Strategic Goal:** Implement the complete Ralph Wiggum Loop: ideas → research → plan → implement → PR → done

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
**Strategic Goal:** Migrate from process-based agent execution to Claude Agent SDK for better performance, reliability, and error handling

#### Objectives

- [x] Implement Claude SDK runner with MCP support
- [x] Add tool allowlist enforcement per phase
- [x] Implement automatic fallback to process mode
- [x] Add environment variable resolution for SDK auth
- [x] Document experimental SDK modes (Amp, Codex, OpenCode)
- [x] Create comprehensive MIGRATION.md guide
- [x] Add RLM mode for infinite-context scenarios

### [DONE-3] Security Hardening

**Status:** done
**Target:** Q1 2025
**Strategic Goal:** Address critical security gaps in phase isolation and data integrity to prevent unintended code changes and data corruption

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
**Strategic Goal:** Validate artifact quality beyond existence checks to catch low-quality agent outputs before they enter the workflow

#### Objectives

- [x] Implement research quality validation (citation density, required sections)
- [x] Implement plan quality validation (phases, structure)
- [x] Implement story quality validation (acceptance criteria, ID format, priority range)
- [x] Add payload size limits for ideas ingestion
- [x] Add story completion verification with warnings
- [x] Fix silent read errors to distinguish permission issues from missing files

### [DONE-5] Rollback and Recovery

**Status:** done
**Target:** Q1 2025
**Strategic Goal:** Enable recovery from failed merges and unwanted changes in direct merge mode

#### Objectives

- [x] Capture rollback_sha before direct merge
- [x] Implement `wreckit rollback <id>` command
- [x] Add branch cleanup after completion
- [x] Record audit trail (completed_at, merged_at, merge_commit_sha, checks_passed)
- [x] Verify merge landed on remote in direct mode

### [DONE-6] Parallel Execution Support

**Status:** done
**Target:** Q1 2025
**Strategic Goal:** Enable concurrent processing of independent items for improved throughput in multi-sandbox environments

#### Objectives

- [x] Implement `--parallel <n>` flag for batch operations
- [x] Add orchestration logic for concurrent item processing
- [x] Ensure file locking prevents concurrent access issues
- [x] Test multi-sandbox parallelism scenarios

### [DONE-7] Comprehensive Error Type System

**Status:** done
**Target:** Q1 2025
**Strategic Goal:** Provide distinct, actionable error types for all failure modes to enable programmatic error handling and user-friendly recovery

#### Objectives

- [x] Create phase-specific error classes (PhaseFailedError, PhaseValidationError)
- [x] Create quality validation error classes (ResearchQualityError, PlanQualityError, StoryQualityError)
- [x] Create git operation error classes (BranchError, PushError, PrCreationError, MergeConflictError)
- [x] Add ArtifactReadError to distinguish permission issues from missing files
- [x] Implement proper error codes for all failure scenarios

### [DONE-8] Dependency Management

**Status:** done
**Target:** Q1 2025
**Strategic Goal:** Enable item dependencies to ensure correct execution order and prevent blocking issues

#### Objectives

- [x] Add `depends_on` field to item schema
- [x] Implement dependency validation in doctor
- [x] Add circular dependency detection
- [x] Implement dependency-aware scheduling in orchestrator
- [x] Filter blocked items in status output

### [DONE-9] Batch Progress Persistence

**Status:** done
**Target:** Q1 2025
**Strategic Goal:** Enable resumable batch operations that survive interruptions and process restarts

#### Objectives

- [x] Implement BatchProgressSchema with session tracking
- [x] Add batch progress checkpointing in orchestrator
- [x] Implement stale progress detection (24h threshold)
- [x] Add `--no-resume` flag for fresh starts
- [x] Add `--retry-failed` flag for re-processing failed items
- [x] Auto-cleanup progress on successful completion

### [DONE-10] Comprehensive Test Coverage

**Status:** done
**Target:** Q1 2025
**Strategic Goal:** Achieve high test coverage across core functionality to ensure reliability and enable confident refactoring

#### Objectives

- [x] Add unit tests for all major modules (30+ test files)
- [x] Add property-based tests for critical invariants (fast-check)
- [x] Add integration tests for SDK modes
- [x] Add isospec tests for phase transitions
- [x] Add edge case tests for error scenarios
- [x] Benchmark infrastructure for performance tracking
