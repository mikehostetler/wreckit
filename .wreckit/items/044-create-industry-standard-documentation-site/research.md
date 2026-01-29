# Research: Create Industry Standard Documentation Site

**Date**: 2025-01-26
**Item**: 044-create-industry-standard-documentation-site

## Research Question

Implement a polished, industry-standard documentation site for Wreckit using a modern static site generator (e.g., VitePress or Docusaurus) compatible with GitHub Pages.

## Summary

**Key Finding:** Wreckit already has a functional VitePress documentation site with GitHub Pages deployment configured. However, there are several gaps preventing it from being production-ready and fully polished.

The documentation infrastructure exists at `/Users/speed/wreckit/docs/` with:
- ✅ VitePress configuration (`docs/.vitepress/config.ts`)
- ✅ GitHub Actions workflow for deployment (`.github/workflows/deploy-docs.yml`)
- ✅ Documentation build scripts in package.json
- ✅ Structured content organized by sections (Guide, CLI, Agent Development, Migration)
- ❌ Missing assets (logo.png referenced but not present)
- ❌ Inconsistent repository URLs (jmanhype vs mikehostetler)
- ❌ Some content gaps and outdated information
- ❌ No custom branding/theme customization
- ❌ Missing public directory for assets

The item status shows "prd.json became invalid during implementation" suggesting a previous attempt was made but encountered issues. The current state is functional but needs polish and fixes to be truly "industry-standard."

## Current State Analysis

### Existing Implementation

**VitePress Setup:**
- Location: `/Users/speed/wreckit/docs/`
- Config: `/Users/speed/wreckit/docs/.vitepress/config.ts:1-131`
- Base path: `/wreckit/` (configured for GitHub Pages subdirectory deployment)
- Build output: `docs/.vitepress/dist`
- Build status: ✅ Successfully builds (verified by dist/ directory presence)

**Content Structure:**
```
docs/
├── .vitepress/
│   ├── config.ts          # VitePress configuration
│   └── dist/              # Built site (present, builds successfully)
├── guide/                 # User-facing documentation
│   ├── introduction.md
│   ├── installation.md
│   ├── quick-start.md
│   ├── configuration.md
│   ├── loop.md
│   ├── folder-structure.md
│   └── design-principles.md
├── cli/                   # CLI command reference
│   ├── index.md
│   ├── essentials.md
│   ├── phases.md
│   ├── flags.md
│   └── exit-codes.md
├── agent-development/     # Developer documentation
│   ├── index.md
│   ├── sdk-patterns.md
│   ├── mcp-tools.md
│   └── customization.md
├── migration/             # Migration guide
│   ├── index.md
│   ├── quick-migration.md
│   ├── environment.md
│   └── troubleshooting.md
├── architecture/          # Architecture docs
│   └── overview.md
├── api/                   # API documentation (auto-generated)
│   └── README.md
├── index.md               # Landing page
└── changelog.md
```

**Deployment Configuration:**
- GitHub Actions workflow: `/Users/speed/wreckit/.github/workflows/deploy-docs.yml:1-52`
- Trigger: Push to main branch when docs/, workflow, or package.json changes
- Permissions: Configured for GitHub Pages deployment
- Build tool: Bun runtime with frozen lockfile
- Deployment: Uses `actions/deploy-pages@v4`
- Artifact path: `docs/.vitepress/dist`

**Package.json Scripts:**
```json
{
  "docs:dev": "vitepress dev docs",
  "docs:build": "vitepress build docs",
  "docs:preview": "vitepress preview docs"
}
```
Location: `/Users/speed/wreckit/package.json:33-35`

### Key Files

#### VitePress Configuration
- **File:** `docs/.vitepress/config.ts`
- **Purpose:** Main VitePress configuration
- **Key Settings:**
  - Base path: `/wreckit/` (line 5)
  - Title: "Wreckit" (line 8)
  - Theme: Default VitePress theme with navigation and sidebar
  - Search: Local client-side search (line 102)
  - Edit link: Points to `https://github.com/jmanhype/wreckit` (line 87)
  - Social links: Points to `https://github.com/jmanhype/wreckit` (line 82)

**Issue:** Repository URLs use `jmanhype` instead of the canonical `mikehostetler` from package.json

#### GitHub Actions Workflow
- **File:** `.github/workflows/deploy-docs.yml`
- **Purpose:** Automated deployment to GitHub Pages
- **Trigger:** Push to main branch affecting docs, workflow, or package.json
- **Steps:**
  1. Checkout code
  2. Setup Bun 1.2.2
  3. Install dependencies (frozen lockfile)
  4. Build docs (`bun run docs:build`)
  5. Setup Pages
  6. Upload artifact from `docs/.vitepress/dist`
  7. Deploy to GitHub Pages

**Status:** ✅ Properly configured for GitHub Pages

#### Documentation Landing Page
- **File:** `docs/index.md`
- **Content:** Hero section with "The Sovereign Software Engineer" tagline
- **Hero Image:** References `/logo.png` (line 9) - **MISSING**
- **Features:** Lists 6 features (Dreamer, Geneticist, Doctor, Watchdog, Factory, Cloud Native)
- **Call to Action:** "Get Started" and "View on GitHub" buttons

**Issue:** Missing `/logo.png` asset that's referenced in hero section

#### CLI Reference
- **File:** `docs/cli/essentials.md`
- **Content:** Comprehensive command reference with usage examples
- **Coverage:** Essential commands including `wreckit`, `init`, `ideas`, `status`, `run`, `next`, `doctor`, `learn`
- **Advanced Commands:** `joke`, `dream`, `geneticist` (autonomous features)
- **Quality:** ✅ Well-structured with code examples and descriptions

#### Agent Development Guide
- **File:** `docs/agent-development/index.md`
- **Content:** Guidelines for developing Wreckit agents
- **Sections:** SDK Patterns, MCP Tools, Customization
- **Quality:** ✅ Comprehensive developer documentation

#### Architecture Documentation
- **File:** `docs/architecture/overview.md`
- **Content:** System architecture with Mermaid diagrams
- **Topics:** Sovereign Stack, Supervisor, Immune System, Brain, Hands
- **Quality:** ✅ Good technical depth with visual diagrams

## Technical Considerations

### Dependencies

**Existing Dependencies (from package.json:46-56):**
```json
{
  "devDependencies": {
    "vitepress": "^1.6.4",
    "typedoc": "^0.28.16",
    "typedoc-plugin-markdown": "^4.9.0"
  }
}
```
Location: `/Users/speed/wreckit/package.json:46-56`

**Build System:**
- Runtime: Bun (specified in GitHub Actions workflow)
- Package manager: Bun (uses `bun install --frozen-lockfile`)
- VitePress version: 1.6.4

**Note:** Typedoc is installed but there's no evidence of automatic API documentation generation being integrated into the build process.

### Patterns to Follow

**Content Organization:**
1. **User-facing docs** (`guide/`) - Getting started, configuration, concepts
2. **Reference docs** (`cli/`) - Command syntax and options
3. **Developer docs** (`agent-development/`) - Contributing, architecture, internals
4. **Migration docs** (`migration/`) - Upgrading and troubleshooting
5. **API docs** (`api/`) - Auto-generated TypeScript API documentation

**Markdown Frontmatter:**
- Landing page uses frontmatter: `layout: home`
- Other pages use standard markdown without frontmatter

**VitePress Features Used:**
- Navigation bar (top-level links)
- Sidebar navigation (section-specific)
- Local search (client-side)
- Edit links (GitHub integration)
- Last updated timestamps
- Table of contents (outline)
- Code syntax highlighting (github-light/github-dark themes)
- Line numbers in code blocks

**Integration Points:**
1. **Root README.md** - Links to docs for detailed information
2. **MIGRATION.md** - Comprehensive migration guide duplicated in docs
3. **AGENTS.md** - Agent development guidelines duplicated in docs
4. **CHANGELOG.md** - Duplicated as `docs/changelog.md`

### Gaps and Issues

**Critical Issues:**
1. **Missing logo asset** (`/logo.png` referenced on line 9 of index.md)
2. **Repository URL inconsistency** - Config uses `jmanhype`, package.json uses `mikehostetler`
3. **Item status error** - Previous implementation attempt left `prd.json became invalid during implementation`

**Content Gaps:**
1. **No public directory** for static assets (images, favicon, etc.)
2. **No custom branding** - Uses default VitePress theme
3. **API documentation** - Typedoc installed but not integrated into build
4. **Missing examples/tutorial content** - Quick start is minimal
5. **No troubleshooting guide** in the main docs (only in migration section)

**Polish Issues:**
1. **Inconsistent documentation tone** - Some pages are informal, others technical
2. **Missing visual assets** - No screenshots, diagrams beyond architecture
3. **No favicon or custom icons**
4. **No versioning strategy** for documentation
5. **Missing "About" or "Community" sections**

**GitHub Pages Configuration:**
- Base path set to `/wreckit/` which implies deployment to a subdirectory
- Need to verify GitHub Pages source is set to `docs/.vitepress/dist`
- Need to verify custom domain (if any)

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Repository URL mismatch breaks edit links | Medium | Update all references from `jmanhype` to `mikehostetler` in VitePress config |
| Missing logo.png causes broken image on homepage | High | Create or copy logo asset to `docs/public/logo.png` or update reference to existing `img/wreckit.png` |
| GitHub Pages base path mismatch causes 404s | High | Verify GitHub Pages source settings match base path configuration |
| Typedoc not integrated limits API documentation completeness | Medium | Add `docs:api` script to generate Typedoc output to `docs/api/` directory |
| Content duplication between root docs and docs/ causes maintenance burden | Low | Consolidate by moving root docs content into VitePress and adding redirects |
| Previous invalid prd.json indicates unresolved issues | Medium | Investigate and fix the PRD schema validation issue before proceeding |
| No custom branding makes docs feel generic | Low | Add custom CSS, favicon, and logo to differentiate from default VitePress sites |

## Recommended Approach

### Phase 1: Fix Critical Issues
1. **Resolve repository URL inconsistency**
   - Update `docs/.vitepress/config.ts` lines 24, 82, 87 to use `mikehostetler` instead of `jmanhype`
   - Verify all GitHub links point to canonical repository

2. **Fix missing logo asset**
   - Option A: Create `docs/public/` directory and add `logo.png`
   - Option B: Update `docs/index.md` to reference existing `../img/wreckit.png`
   - Recommended: Create proper asset structure with `docs/public/` for logos, favicons, etc.

3. **Fix invalid prd.json**
   - Investigate the schema validation error that caused previous implementation to fail
   - Run `wreckit doctor --fix` to repair item state if needed
   - Verify item can proceed through phases

### Phase 2: Content Enhancement
1. **Complete missing sections**
   - Add troubleshooting guide to main documentation (not just migration)
   - Add tutorial/walkthrough content beyond quick start
   - Create "Examples" section with real-world use cases

2. **Improve existing content**
   - Add more screenshots and diagrams
   - Standardize tone and voice across pages
   - Add code annotations and explanations

3. **Integrate API documentation**
   - Add npm script: `"docs:api": "typedoc --out docs/api src"`
   - Update build script to generate API docs before VitePress build
   - Link API docs from navigation

### Phase 3: Polish and Branding
1. **Custom theme configuration**
   - Add custom CSS in `docs/.vitepress/theme/custom.css`
   - Extend default theme with custom components
   - Add favicon and app icons

2. **Asset optimization**
   - Create organized `docs/public/` directory structure:
     ```
     docs/public/
     ├── logo.png
     ├── favicon.svg
     ├── hero-image.png
     └── images/
         ├── screenshots/
         └── diagrams/
     ```
   - Optimize images for web (compression, formats)

3. **Search optimization**
   - Add meta tags for SEO
   - Verify local search index includes all content
   - Add sitemap generation if not present

### Phase 4: Deployment Verification
1. **Test GitHub Pages deployment**
   - Verify workflow runs successfully on push to main
   - Confirm deployed site is accessible at configured URL
   - Test all internal links resolve correctly

2. **Set up documentation preview**
   - Add workflow to deploy preview builds for PRs
   - Allow contributors to preview changes before merging

3. **Add deployment status badge**
   - Add build/deployment status to README
   - Link to live documentation site

## Open Questions

1. **GitHub Pages configuration**
   - What is the intended GitHub Pages URL? (e.g., `https://mikehostetler.github.io/wreckit/`)
   - Is a custom domain planned?
   - Has the GitHub Pages source been configured to use the `docs/.vitepress/dist` directory?

2. **Asset sourcing**
   - Should the logo be newly created or can we reuse `/Users/speed/wreckit/img/wreckit.png`?
   - Are there brand guidelines (colors, fonts, logo usage)?
   - Who owns asset creation if new assets are needed?

3. **Content maintenance strategy**
   - Should root-level docs (README.md, MIGRATION.md, AGENTS.md) be migrated into VitePress?
   - How will we handle content duplication between root and docs/?
   - Who will own documentation maintenance going forward?

4. **API documentation scope**
   - Should all exported TypeScript APIs be documented or only public APIs?
   - Should internal modules (e.g., `src/domain/`) be included in API docs?
   - What's the process for keeping API docs in sync with code changes?

5. **Previous implementation failure**
   - What specifically caused the "prd.json became invalid during implementation" error?
   - What was the previous implementation approach that failed?
   - Are there any learnings from the previous attempt to avoid repeating issues?
