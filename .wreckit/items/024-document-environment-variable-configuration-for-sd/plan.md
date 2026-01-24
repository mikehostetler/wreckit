# Document Environment Variable Configuration for SDK Mode Implementation Plan

## Implementation Plan Title
Document Environment Variable Configuration for SDK Mode

## Overview
This item completes the documentation for environment variable configuration in wreckit's SDK mode. The environment variable system is fully implemented in `src/agent/env.ts`, and MIGRATION.md already contains comprehensive documentation. The remaining work is to:
1. Add missing variables to MIGRATION.md (model selection variables, allowed prefixes)
2. Add cross-references from README.md and AGENTS.md to the canonical documentation
3. Expand README.md's Requirements section with essential SDK mode details

## Current State
**Implementation** (complete):
- `src/agent/env.ts:79-98` - Full precedence-based environment merging
- `src/agent/env.ts:16` - Allowed prefixes: `ANTHROPIC_`, `CLAUDE_CODE_`, `API_TIMEOUT`
- `src/agent/env.ts:100-105` - Auto-blank API_KEY when custom endpoint configured
- `src/commands/sdk-info.ts:8-79` - Diagnostic command displaying resolved environment

**Documentation** (partial):
- `MIGRATION.md:189-259` - Comprehensive env var section (Key Variables, Precedence, Examples)
- `AGENTS.md:95-116` - Brief env var resolution reference
- `README.md:323-329` - Minimal mention of SDK mode requirements

### Key Discoveries
1. **MIGRATION.md is nearly complete** but missing:
   - Model selection variables: `ANTHROPIC_MODEL`, `ANTHROPIC_DEFAULT_*_MODEL`
   - Documentation of the `CLAUDE_CODE_*` and `API_TIMEOUT` allowed prefixes

2. **README.md is too brief** (line 328):
   - Only says "Set `ANTHROPIC_API_KEY` environment variable"
   - No mention of custom endpoints (`ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`)
   - No reference to `wreckit sdk-info` diagnostic command
   - No link to full documentation in MIGRATION.md

3. **AGENTS.md references are accurate** but could point to MIGRATION.md for completeness

## Desired End State
After implementation:

1. **MIGRATION.md** is the canonical, complete reference for environment variables including:
   - All supported variables (core + advanced)
   - Allowed prefix behavior from `~/.claude/settings.json`
   - Clear examples for all configuration scenarios

2. **README.md** provides essential SDK mode setup with:
   - Quick reference to core variables (`ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`)
   - Reference to `wreckit sdk-info` diagnostic
   - Link to MIGRATION.md for full details

3. **AGENTS.md** points to MIGRATION.md as the authoritative source

## What We're NOT Doing
- **NOT creating a separate ENVIRONMENT.md file** - MIGRATION.md is the established canonical location
- **NOT adding troubleshooting content** - That's item 025's scope; MIGRATION.md already has a Troubleshooting section
- **NOT changing the implementation** - This is documentation only
- **NOT documenting internal/undocumented SDK variables** - Only variables displayed by `sdk-info` or in `env.ts`

## Implementation Approach
We'll enhance existing documentation in place rather than creating new files, following the principle of keeping canonical documentation in one location (MIGRATION.md) with cross-references from other docs.

---

## Phases

### Phase 1: Enhance MIGRATION.md with Complete Variable Reference

#### Overview
Add missing model selection variables and document the allowed prefix behavior for Claude settings import. This makes MIGRATION.md the complete authoritative reference.

#### Changes Required:

##### 1. Add Advanced Configuration Section to MIGRATION.md
**File**: `MIGRATION.md`
**Location**: After line 259 (after the Project-Wide Defaults example), before the Verification section
**Changes**: Add new subsection for advanced environment variables with model selection table and allowed prefixes documentation.

#### Success Criteria:

##### Automated Verification:
- [ ] Build succeeds: `bun run build`
- [ ] Type checking passes: `bun run typecheck`
- [ ] Linting passes: `bun run lint`

##### Manual Verification:
- [ ] MIGRATION.md renders correctly in GitHub/preview
- [ ] All variables shown by `wreckit sdk-info` are documented
- [ ] Variable table is accurate and matches `env.ts:16` for allowed prefixes

---

### Phase 2: Expand README.md Requirements Section

#### Overview
Update the Requirements section to include essential SDK mode configuration details and link to MIGRATION.md for the complete reference.

#### Changes Required:

##### 1. Expand SDK Mode Requirements in README.md
**File**: `README.md`
**Location**: Lines 323-329 (Requirements section)
**Changes**: Replace brief SDK mode bullet point with detailed sub-bullets for Direct API, Custom endpoint, and verification command, plus link to MIGRATION.md.

#### Success Criteria:

##### Automated Verification:
- [ ] Build succeeds: `bun run build`
- [ ] Type checking passes: `bun run typecheck`
- [ ] Linting passes: `bun run lint`

##### Manual Verification:
- [ ] README.md renders correctly in GitHub/preview
- [ ] Link to MIGRATION.md#environment-variables works
- [ ] All three auth variables are mentioned (`ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`)
- [ ] `wreckit sdk-info` command is referenced

---

### Phase 3: Update AGENTS.md Cross-Reference

#### Overview
Add a cross-reference from AGENTS.md to MIGRATION.md for the complete environment variable documentation.

#### Changes Required:

##### 1. Add Cross-Reference to AGENTS.md
**File**: `AGENTS.md`
**Location**: Line 116 (after the auto-blank note)
**Changes**: Add sentence linking to MIGRATION.md#environment-variables for complete documentation.

#### Success Criteria:

##### Automated Verification:
- [ ] Build succeeds: `bun run build`
- [ ] Type checking passes: `bun run typecheck`
- [ ] Linting passes: `bun run lint`

##### Manual Verification:
- [ ] AGENTS.md renders correctly in GitHub/preview
- [ ] Link to MIGRATION.md#environment-variables works
- [ ] Cross-reference appears at logical location (after env var section)

---

## Testing Strategy
### Documentation Verification
1. **Completeness Check**: Run `wreckit sdk-info` and verify all displayed variables are documented in MIGRATION.md
2. **Link Verification**: Verify `./MIGRATION.md#environment-variables` anchor exists and links correctly
3. **Consistency Check**: Ensure precedence order is consistent across all three files

### Manual Testing Steps
1. **Build and verify no errors**: `bun run build`, `bun run typecheck`, `bun run lint`
2. **Preview documentation**: View MIGRATION.md in GitHub preview
3. **Cross-reference verification**: Click links from README.md and AGENTS.md to MIGRATION.md
4. **Code consistency check**: `wreckit sdk-info` output matches docs

## Migration Notes
This is documentation only; no code migration required.

## References
- MIGRATION.md:189-259
- src/agent/env.ts:1-108
- src/commands/sdk-info.ts:8-79