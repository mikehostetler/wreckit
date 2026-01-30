# Claude Code Guardrails

This file defines what Claude Code is allowed to modify when performing automated improvements.

## Allowed Modifications

Claude Code MAY modify:
- **Documentation files** (README.md, docs/*, *.md)
- **Source code** for:
  - Bug fixes and error handling
  - Code quality improvements (remove duplication, add type hints)
  - Performance optimizations
  - Refactoring for clarity/maintainability
  - Security fixes
- **Test files** (add new tests, fix broken tests, improve coverage)
- **CI/CD configurations** (.github/workflows/*, .gitlab-ci.yml, etc.)
- **Configuration files** (build configs, linting rules, etc.)
- **Metadata files** (package.json, pyproject.toml, setup.py)
- **GitHub-specific files** (.gitignore, CODEOWNERS, etc.)
- **Dependencies** (with clear justification for updates/additions)

## Restricted Modifications

Claude Code MUST NOT:
- **Break public APIs** or change function signatures without discussion
- **Make breaking changes** to existing behavior
- **Change core algorithms** without explaining rationale
- **Remove features** without justification
- **Add heavy dependencies** without clear need
- **Modify production configuration** (database URLs, API keys, etc.)

## Exception: Issues Labeled `ai-implement`

When an issue is labeled `ai-implement`, Claude Code may modify source code to implement the requested feature or fix, but must:
1. Reference the issue number in the PR
2. Follow existing code style and patterns
3. Include tests if the project has a test suite
4. Not change public APIs without discussion in the issue

## Pull Request Requirements

All PRs created by Claude Code MUST include:
1. A clear description of what was changed and why
2. A receipt line in the format: `Receipt: <hash>`
3. Reference to the workflow run that created it
4. Minimal, focused changes (prefer small PRs over large ones)

## General Principles

1. **Minimal Deltas**: Make the smallest change that solves the problem
2. **No Breaking Changes**: Never introduce breaking changes
3. **Follow Existing Patterns**: Match the style and structure of existing code
4. **Documentation First**: When in doubt, improve documentation rather than code
5. **Safety First**: If uncertain, create an issue for human review instead of making changes

---

*This file was created to ensure safe and predictable AI-assisted repository maintenance.*
