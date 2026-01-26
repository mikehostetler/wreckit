2026-01-21T18:28:11.7721951Z Current runner version: '2.331.0'
2026-01-21T18:28:11.7746000Z ##[group]Runner Image Provisioner
2026-01-21T18:28:11.7747417Z Hosted Compute Agent
2026-01-21T18:28:11.7748380Z Version: 20251211.462
2026-01-21T18:28:11.7749421Z Commit: 6cbad8c2bb55d58165063d031ccabf57e2d2db61
2026-01-21T18:28:11.7750755Z Build Date: 2025-12-11T16:28:49Z
2026-01-21T18:28:11.7751699Z Worker ID: {c4ac8c98-e1b7-4721-9542-7a4e5d049cac}
2026-01-21T18:28:11.7752803Z ##[endgroup]
2026-01-21T18:28:11.7753803Z ##[group]Operating System
2026-01-21T18:28:11.7754688Z Ubuntu
2026-01-21T18:28:11.7755143Z 24.04.3
2026-01-21T18:28:11.7755888Z LTS
2026-01-21T18:28:11.7756439Z ##[endgroup]
2026-01-21T18:28:11.7756898Z ##[group]Runner Image
2026-01-21T18:28:11.7757510Z Image: ubuntu-24.04
2026-01-21T18:28:11.7757986Z Version: 20260111.209.1
2026-01-21T18:28:11.7758974Z Included Software: https://github.com/actions/runner-images/blob/ubuntu24/20260111.209/images/ubuntu/Ubuntu2404-Readme.md
2026-01-21T18:28:11.7760581Z Image Release: https://github.com/actions/runner-images/releases/tag/ubuntu24%2F20260111.209
2026-01-21T18:28:11.7761525Z ##[endgroup]
2026-01-21T18:28:11.7762615Z ##[group]GITHUB_TOKEN Permissions
2026-01-21T18:28:11.7764384Z Contents: read
2026-01-21T18:28:11.7765032Z Metadata: read
2026-01-21T18:28:11.7765504Z Packages: read
2026-01-21T18:28:11.7766222Z ##[endgroup]
2026-01-21T18:28:11.7768107Z Secret source: Actions
2026-01-21T18:28:11.7768899Z Prepare workflow directory
2026-01-21T18:28:11.8219458Z Prepare all required actions
2026-01-21T18:28:11.8274408Z Getting action download info
2026-01-21T18:28:12.1220044Z Download action repository 'actions/checkout@v6' (SHA:8e8c483db84b4bee98b60c0593521ed34d9990e8)
2026-01-21T18:28:12.2642810Z Download action repository 'oven-sh/setup-bun@v2' (SHA:3d267786b128fe76c2f16a390aa2448b815359f3)
2026-01-21T18:28:12.7554139Z Complete job name: check
2026-01-21T18:28:12.8223379Z ##[group]Run actions/checkout@v6
2026-01-21T18:28:12.8224189Z with:
2026-01-21T18:28:12.8224588Z repository: mikehostetler/wreckit
2026-01-21T18:28:12.8225250Z token: **_
2026-01-21T18:28:12.8225872Z ssh-strict: true
2026-01-21T18:28:12.8226424Z ssh-user: git
2026-01-21T18:28:12.8226869Z persist-credentials: true
2026-01-21T18:28:12.8227296Z clean: true
2026-01-21T18:28:12.8227692Z sparse-checkout-cone-mode: true
2026-01-21T18:28:12.8228151Z fetch-depth: 1
2026-01-21T18:28:12.8228529Z fetch-tags: false
2026-01-21T18:28:12.8228910Z show-progress: true
2026-01-21T18:28:12.8229300Z lfs: false
2026-01-21T18:28:12.8229656Z submodules: false
2026-01-21T18:28:12.8230049Z set-safe-directory: true
2026-01-21T18:28:12.8230745Z ##[endgroup]
2026-01-21T18:28:12.9118866Z Syncing repository: mikehostetler/wreckit
2026-01-21T18:28:12.9120527Z ##[group]Getting Git version info
2026-01-21T18:28:12.9121188Z Working directory is '/home/runner/work/wreckit/wreckit'
2026-01-21T18:28:12.9122163Z [command]/usr/bin/git version
2026-01-21T18:28:12.9954600Z git version 2.52.0
2026-01-21T18:28:12.9976295Z ##[endgroup]
2026-01-21T18:28:12.9989575Z Temporarily overriding HOME='/home/runner/work/\_temp/ff0c316e-6c66-4f45-81e8-6a6dadf9253b' before making global git config changes
2026-01-21T18:28:12.9991380Z Adding repository directory to the temporary git global config as a safe directory
2026-01-21T18:28:12.9994175Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/wreckit/wreckit
2026-01-21T18:28:13.0066839Z Deleting the contents of '/home/runner/work/wreckit/wreckit'
2026-01-21T18:28:13.0070108Z ##[group]Initializing the repository
2026-01-21T18:28:13.0073992Z [command]/usr/bin/git init /home/runner/work/wreckit/wreckit
2026-01-21T18:28:13.0579396Z hint: Using 'master' as the name for the initial branch. This default branch name
2026-01-21T18:28:13.0580538Z hint: will change to "main" in Git 3.0. To configure the initial branch name
2026-01-21T18:28:13.0581494Z hint: to use in all of your new repositories, which will suppress this warning,
2026-01-21T18:28:13.0582223Z hint: call:
2026-01-21T18:28:13.0582583Z hint:
2026-01-21T18:28:13.0583309Z hint: git config --global init.defaultBranch <name>
2026-01-21T18:28:13.0583897Z hint:
2026-01-21T18:28:13.0584462Z hint: Names commonly chosen instead of 'master' are 'main', 'trunk' and
2026-01-21T18:28:13.0585398Z hint: 'development'. The just-created branch can be renamed via this command:
2026-01-21T18:28:13.0586348Z hint:
2026-01-21T18:28:13.0586734Z hint: git branch -m <name>
2026-01-21T18:28:13.0587179Z hint:
2026-01-21T18:28:13.0587778Z hint: Disable this message with "git config set advice.defaultBranchName false"
2026-01-21T18:28:13.0618397Z Initialized empty Git repository in /home/runner/work/wreckit/wreckit/.git/
2026-01-21T18:28:13.0628437Z [command]/usr/bin/git remote add origin https://github.com/mikehostetler/wreckit
2026-01-21T18:28:13.0700175Z ##[endgroup]
2026-01-21T18:28:13.0700927Z ##[group]Disabling automatic garbage collection
2026-01-21T18:28:13.0703468Z [command]/usr/bin/git config --local gc.auto 0
2026-01-21T18:28:13.0731945Z ##[endgroup]
2026-01-21T18:28:13.0733183Z ##[group]Setting up auth
2026-01-21T18:28:13.0734081Z Removing SSH command configuration
2026-01-21T18:28:13.0739861Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
2026-01-21T18:28:13.0769825Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
2026-01-21T18:28:13.2150688Z Removing HTTP extra header
2026-01-21T18:28:13.2154395Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
2026-01-21T18:28:13.2184698Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
2026-01-21T18:28:13.2391063Z Removing includeIf entries pointing to credentials config files
2026-01-21T18:28:13.2396083Z [command]/usr/bin/git config --local --name-only --get-regexp ^includeIf\.gitdir:
2026-01-21T18:28:13.2424640Z [command]/usr/bin/git submodule foreach --recursive git config --local --show-origin --name-only --get-regexp remote.origin.url
2026-01-21T18:28:13.2643333Z [command]/usr/bin/git config --file /home/runner/work/\_temp/git-credentials-dc287f16-5c1a-479c-8f2b-fae9df0e3c4d.config http.https://github.com/.extraheader AUTHORIZATION: basic _**
2026-01-21T18:28:13.2678490Z [command]/usr/bin/git config --local includeIf.gitdir:/home/runner/work/wreckit/wreckit/.git.path /home/runner/work/\_temp/git-credentials-dc287f16-5c1a-479c-8f2b-fae9df0e3c4d.config
2026-01-21T18:28:13.2707059Z [command]/usr/bin/git config --local includeIf.gitdir:/home/runner/work/wreckit/wreckit/.git/worktrees/_.path /home/runner/work/\_temp/git-credentials-dc287f16-5c1a-479c-8f2b-fae9df0e3c4d.config
2026-01-21T18:28:13.2737173Z [command]/usr/bin/git config --local includeIf.gitdir:/github/workspace/.git.path /github/runner_temp/git-credentials-dc287f16-5c1a-479c-8f2b-fae9df0e3c4d.config
2026-01-21T18:28:13.2767452Z [command]/usr/bin/git config --local includeIf.gitdir:/github/workspace/.git/worktrees/_.path /github/runner_temp/git-credentials-dc287f16-5c1a-479c-8f2b-fae9df0e3c4d.config
2026-01-21T18:28:13.2792570Z ##[endgroup]
2026-01-21T18:28:13.2793894Z ##[group]Fetching the repository
2026-01-21T18:28:13.2802969Z [command]/usr/bin/git -c protocol.version=2 fetch --no-tags --prune --no-recurse-submodules --depth=1 origin +1c5092ac0984a4e2e03ee23106c1e933a7657cbc:refs/remotes/origin/main
2026-01-21T18:28:13.7626752Z From https://github.com/mikehostetler/wreckit
2026-01-21T18:28:13.7627397Z \* [new ref] 1c5092ac0984a4e2e03ee23106c1e933a7657cbc -> origin/main
2026-01-21T18:28:13.7696756Z ##[endgroup]
2026-01-21T18:28:13.7697668Z ##[group]Determining the checkout info
2026-01-21T18:28:13.7699804Z ##[endgroup]
2026-01-21T18:28:13.7705059Z [command]/usr/bin/git sparse-checkout disable
2026-01-21T18:28:13.7814787Z [command]/usr/bin/git config --local --unset-all extensions.worktreeConfig
2026-01-21T18:28:13.7841122Z ##[group]Checking out the ref
2026-01-21T18:28:13.7845010Z [command]/usr/bin/git checkout --progress --force -B main refs/remotes/origin/main
2026-01-21T18:28:13.8048808Z Switched to a new branch 'main'
2026-01-21T18:28:13.8052117Z branch 'main' set up to track 'origin/main'.
2026-01-21T18:28:13.8059721Z ##[endgroup]
2026-01-21T18:28:13.8098215Z [command]/usr/bin/git log -1 --format=%H
2026-01-21T18:28:13.8122333Z 1c5092ac0984a4e2e03ee23106c1e933a7657cbc
2026-01-21T18:28:13.8420022Z ##[group]Run oven-sh/setup-bun@v2
2026-01-21T18:28:13.8420653Z with:
2026-01-21T18:28:13.8421108Z no-cache: false
2026-01-21T18:28:13.8421801Z token: \*\*\*
2026-01-21T18:28:13.8422232Z ##[endgroup]
2026-01-21T18:28:14.3052060Z Downloading a new version of Bun: https://github.com/oven-sh/bun/releases/download/bun-v1.3.6/bun-linux-x64.zip
2026-01-21T18:28:14.6456640Z [command]/usr/bin/unzip -o -q /home/runner/work/\_temp/0fd94a13-0ad6-42da-9ba9-fc72d9878228.zip
2026-01-21T18:28:15.3872469Z [command]/home/runner/.bun/bin/bun --revision
2026-01-21T18:28:15.3910266Z 1.3.6+d530ed993
2026-01-21T18:28:15.4050441Z ##[group]Run bun install
2026-01-21T18:28:15.4050763Z [36;1mbun install[0m
2026-01-21T18:28:15.4088424Z shell: /usr/bin/bash -e {0}
2026-01-21T18:28:15.4088679Z ##[endgroup]
2026-01-21T18:28:15.4183486Z bun install v1.3.6 (d530ed99)
2026-01-21T18:28:16.4582763Z
2026-01-21T18:28:16.4582964Z + @types/bun@1.3.6
2026-01-21T18:28:16.4583241Z + @types/node@25.0.8
2026-01-21T18:28:16.4583443Z + @types/pino@7.0.5
2026-01-21T18:28:16.4583662Z + chalk@5.6.2
2026-01-21T18:28:16.4583848Z + fast-check@4.5.3
2026-01-21T18:28:16.4584032Z + tsup@8.5.1
2026-01-21T18:28:16.4584223Z + typescript@5.9.3
2026-01-21T18:28:16.4584426Z + @anthropic-ai/claude-agent-sdk@0.2.7
2026-01-21T18:28:16.4584717Z + @clack/prompts@0.11.0
2026-01-21T18:28:16.4584914Z + @types/react@19.2.8
2026-01-21T18:28:16.4585103Z + commander@14.0.2
2026-01-21T18:28:16.4585271Z + ink@6.6.0
2026-01-21T18:28:16.4585486Z + pino@10.1.1
2026-01-21T18:28:16.4585682Z + pino-pretty@13.1.3
2026-01-21T18:28:16.4586069Z + react@19.2.3
2026-01-21T18:28:16.4586273Z + zod@4.3.5
2026-01-21T18:28:16.4586366Z
2026-01-21T18:28:16.4586454Z 132 packages installed [1040.00ms]
2026-01-21T18:28:16.4807093Z ##[group]Run bun run build
2026-01-21T18:28:16.4807366Z [36;1mbun run build[0m
2026-01-21T18:28:16.4840440Z shell: /usr/bin/bash -e {0}
2026-01-21T18:28:16.4840688Z ##[endgroup]
2026-01-21T18:28:16.4914923Z $ tsup src/index.ts --format esm --clean && cp -r src/prompts dist/
2026-01-21T18:28:18.4116031Z [34mCLI[39m Building entry: src/index.ts
2026-01-21T18:28:18.4125436Z [34mCLI[39m Using tsconfig: tsconfig.json
2026-01-21T18:28:18.4127248Z [34mCLI[39m tsup v8.5.1
2026-01-21T18:28:18.4149278Z [34mCLI[39m Target: es2022
2026-01-21T18:28:18.4154619Z [34mCLI[39m Cleaning output folder
2026-01-21T18:28:18.4164210Z [34mESM[39m Build start
2026-01-21T18:28:18.4754905Z [32mESM[39m [1mdist/index.js [22m[32m125.44 KB[39m
2026-01-21T18:28:18.4756346Z [32mESM[39m [1mdist/chunk-PHYS4TPD.js [22m[32m2.23 KB[39m
2026-01-21T18:28:18.4757820Z [32mESM[39m [1mdist/amp-sdk-runner-M4H6X4SZ.js [22m[32m1.27 KB[39m
2026-01-21T18:28:18.4758932Z [32mESM[39m [1mdist/codex-sdk-runner-U3R6C6R5.js [22m[32m1.29 KB[39m
2026-01-21T18:28:18.4759995Z [32mESM[39m [1mdist/opencode-sdk-runner-DVF57ETX.js [22m[32m1.31 KB[39m
2026-01-21T18:28:18.4761066Z [32mESM[39m [1mdist/workflow-754FZ4O2.js [22m[32m405.00 B[39m
2026-01-21T18:28:18.4762072Z [32mESM[39m [1mdist/chunk-3FP3WPL4.js [22m[32m6.35 KB[39m
2026-01-21T18:28:18.4763072Z [32mESM[39m [1mdist/chunk-4RLQKO7T.js [22m[32m101.16 KB[39m
2026-01-21T18:28:18.4764031Z [32mESM[39m [1mdist/chunk-2LNCQ4QD.js [22m[32m1.99 KB[39m
2026-01-21T18:28:18.4765033Z [32mESM[39m [1mdist/chunk-PNKVD2UK.js [22m[32m953.00 B[39m
2026-01-21T18:28:18.4766120Z [32mESM[39m [1mdist/claude-sdk-runner-OQNO7XNQ.js [22m[32m7.70 KB[39m
2026-01-21T18:28:18.4767227Z [32mESM[39m ⚡️ Build success in 60ms
2026-01-21T18:28:18.4968896Z ##[group]Run bun test
2026-01-21T18:28:18.4969397Z [36;1mbun test[0m
2026-01-21T18:28:18.5007217Z shell: /usr/bin/bash -e {0}
2026-01-21T18:28:18.5007455Z ##[endgroup]
2026-01-21T18:28:18.5070695Z bun test v1.3.6 (d530ed99)
2026-01-21T18:28:18.5112058Z
2026-01-21T18:28:18.5112671Z ##[group]src/**tests**/doctor.test.ts:
2026-01-21T18:28:18.5683728Z (pass) diagnose > returns empty diagnostics for clean .wreckit folder [6.00ms]
2026-01-21T18:28:18.5691704Z (pass) diagnose > returns MISSING_CONFIG when config.json does not exist [1.00ms]
2026-01-21T18:28:18.5706687Z (pass) diagnose > returns INVALID_CONFIG when config.json is invalid [1.00ms]
2026-01-21T18:28:18.5717505Z (pass) diagnose > returns INVALID_CONFIG for malformed JSON [2.00ms]
2026-01-21T18:28:18.5732697Z (pass) diagnose > returns MISSING_ITEM_JSON when item.json is missing [1.00ms]
2026-01-21T18:28:18.5761976Z (pass) diagnose > detects state/file mismatch for researched without research.md [3.00ms]
2026-01-21T18:28:18.5775461Z (pass) diagnose > detects state/file mismatch for planned without plan files [1.00ms]
2026-01-21T18:28:18.5799386Z (pass) diagnose > detects invalid prd.json [3.00ms]
2026-01-21T18:28:18.5828643Z (pass) diagnose > detects stale index [3.00ms]
2026-01-21T18:28:18.5836308Z (pass) diagnose > detects missing prompts directory
2026-01-21T18:28:18.5844566Z (pass) diagnose > no MISSING_PROMPTS when prompts directory exists [1.00ms]
2026-01-21T18:28:18.5884882Z (pass) applyFixes > rebuilds stale index [4.00ms]
2026-01-21T18:28:18.5905663Z (pass) applyFixes > creates missing prompts [2.00ms]
2026-01-21T18:28:18.5924270Z (pass) applyFixes > resets mismatched state [2.00ms]
2026-01-21T18:28:18.5929435Z (pass) applyFixes > does not modify non-fixable issues [1.00ms]
2026-01-21T18:28:18.5954243Z (pass) applyFixes > returns fix results for all fixable diagnostics [2.00ms]
2026-01-21T18:28:18.5978285Z Errors (1):
2026-01-21T18:28:18.5979046Z ✗ config.json has invalid JSON: JSON Parse error: Expected '}'
2026-01-21T18:28:18.5979654Z Warnings (1):
2026-01-21T18:28:18.5980191Z ⚠ [001-item] State is 'researched' but research.md is missing (fixable)
2026-01-21T18:28:18.5980701Z Info (1):
2026-01-21T18:28:18.5981293Z ℹ prompts directory is missing (defaults will be used) (fixable)
2026-01-21T18:28:18.5981775Z
2026-01-21T18:28:18.5981975Z Run with --fix to auto-fix recoverable issues
2026-01-21T18:28:18.5983981Z (pass) doctorCommand > prints diagnostics grouped by severity [3.00ms]
2026-01-21T18:28:18.5995301Z Warnings (2):
2026-01-21T18:28:18.5995966Z ⚠ config.json is missing (using defaults)
2026-01-21T18:28:18.5996684Z ⚠ [001-item] State is 'researched' but research.md is missing (fixable)
2026-01-21T18:28:18.5997050Z Info (1):
2026-01-21T18:28:18.5997366Z ℹ prompts directory is missing (defaults will be used) (fixable)
2026-01-21T18:28:18.5997626Z
2026-01-21T18:28:18.5997738Z Run with --fix to auto-fix recoverable issues
2026-01-21T18:28:18.5998799Z (pass) doctorCommand > without --fix, does not modify files [2.00ms]
2026-01-21T18:28:18.6025432Z Warnings (2):
2026-01-21T18:28:18.6026067Z ⚠ config.json is missing (using defaults)
2026-01-21T18:28:18.6026746Z ⚠ [001-item] State is 'researched' but research.md is missing (fixable)
2026-01-21T18:28:18.6027304Z Info (1):
2026-01-21T18:28:18.6027886Z ℹ prompts directory is missing (defaults will be used) (fixable)
2026-01-21T18:28:18.6028353Z
2026-01-21T18:28:18.6028477Z Fixes applied:
2026-01-21T18:28:18.6028900Z ✓ Created default prompt templates
2026-01-21T18:28:18.6029508Z ✓ [001-item] Reset state from 'researched' to 'idea'
2026-01-21T18:28:18.6029894Z
2026-01-21T18:28:18.6030032Z Fixed 2 issue(s), 0 failed
2026-01-21T18:28:18.6031397Z (pass) doctorCommand > with --fix, applies fixes [3.00ms]
2026-01-21T18:28:18.6049908Z Errors (1):
2026-01-21T18:28:18.6050349Z ✗ config.json has invalid JSON: JSON Parse error: Expected '}'
2026-01-21T18:28:18.6051212Z Info (1):
2026-01-21T18:28:18.6052032Z ℹ prompts directory is missing (defaults will be used) (fixable)
2026-01-21T18:28:18.6052538Z
2026-01-21T18:28:18.6052678Z Fixes applied:
2026-01-21T18:28:18.6053106Z ✓ Created default prompt templates
2026-01-21T18:28:18.6053423Z
2026-01-21T18:28:18.6053574Z Fixed 1 issue(s), 0 failed
2026-01-21T18:28:18.6054349Z (pass) doctorCommand > exits with code 1 if errors remain after fixes [2.00ms]
2026-01-21T18:28:18.6063313Z ✓ No issues found
2026-01-21T18:28:18.6065685Z (pass) doctorCommand > shows success message when no issues found [1.00ms]
2026-01-21T18:28:18.6066373Z
2026-01-21T18:28:18.6066808Z ##[endgroup]
2026-01-21T18:28:18.6066935Z
2026-01-21T18:28:18.6067240Z ##[group]src/**tests**/domain.property.test.ts:
2026-01-21T18:28:18.6382547Z (pass) property-based state machine tests > monotonicity > valid transitions only increase state index by exactly 1 [4.00ms]
2026-01-21T18:28:18.6384397Z (pass) property-based state machine tests > terminal state > once done, no further transitions are valid [1.00ms]
2026-01-21T18:28:18.6388063Z (pass) property-based state machine tests > terminal state > isTerminalState is consistent with getNextState returning null
2026-01-21T18:28:18.6648601Z (pass) property-based state machine tests > story invariants > allStoriesDone ⇔ !hasPendingStories when stories exist [27.00ms]
2026-01-21T18:28:18.6661668Z (pass) property-based state machine tests > immutability > applyStateTransition never mutates input [1.00ms]
2026-01-21T18:28:18.6665427Z (pass) property-based state machine tests > immutability > result item is a new object, not the input
2026-01-21T18:28:18.6666980Z (pass) property-based state machine tests > transition ordering > getStateIndex returns consecutive integers starting at 0
2026-01-21T18:28:18.6668430Z (pass) property-based state machine tests > transition ordering > getNextState chain covers all states exactly once
2026-01-21T18:28:18.6669187Z
2026-01-21T18:28:18.6669762Z ##[endgroup]
2026-01-21T18:28:18.6669974Z
2026-01-21T18:28:18.6670296Z ##[group]src/**tests**/cli-utils.test.ts:
2026-01-21T18:28:18.6706321Z (pass) handleError > formats WreckitError with code
2026-01-21T18:28:18.6708450Z (pass) handleError > formats regular Error message [1.00ms]
2026-01-21T18:28:18.6709340Z (pass) handleError > shows stack in verbose mode for regular Error
2026-01-21T18:28:18.6710064Z (pass) handleError > does not show stack when not verbose
2026-01-21T18:28:18.6710658Z (pass) handleError > handles non-Error types
2026-01-21T18:28:18.6711165Z (pass) handleError > handles null/undefined
2026-01-21T18:28:18.6712838Z (pass) handleError > handles object types
2026-01-21T18:28:18.6713375Z (pass) executeCommand > does not exit on success
2026-01-21T18:28:18.6714348Z (pass) executeCommand > logs WreckitError with code and exits 1
2026-01-21T18:28:18.6716799Z (pass) executeCommand > logs regular Error message and exits 1
2026-01-21T18:28:18.6718321Z (pass) executeCommand > exits 130 for InterruptedError [1.00ms]
2026-01-21T18:28:18.6720363Z (pass) executeCommand > exits 130 for Error with SIGINT message
2026-01-21T18:28:18.6721695Z (pass) executeCommand > exits 1 for unknown error type
2026-01-21T18:28:18.6723667Z (pass) executeCommand > passes options to handleError
2026-01-21T18:28:18.6724053Z
2026-01-21T18:28:18.6724471Z ##[endgroup]
2026-01-21T18:28:18.6724597Z
2026-01-21T18:28:18.6724868Z ##[group]src/**tests**/prd-schema.test.ts:
2026-01-21T18:28:18.6741290Z (pass) PRD Schema Validation (Gap 4: Schema Version Inconsistency) > schema_version enforcement > accepts PRD with schema_version: 1 [1.00ms]
2026-01-21T18:28:18.6742883Z (pass) PRD Schema Validation (Gap 4: Schema Version Inconsistency) > schema_version enforcement > rejects PRD with schema_version: 0
2026-01-21T18:28:18.6744419Z (pass) PRD Schema Validation (Gap 4: Schema Version Inconsistency) > schema_version enforcement > rejects PRD with schema_version: 2
2026-01-21T18:28:18.6746029Z (pass) PRD Schema Validation (Gap 4: Schema Version Inconsistency) > schema_version enforcement > rejects PRD with schema_version: 99
2026-01-21T18:28:18.6748258Z (pass) PRD Schema Validation (Gap 4: Schema Version Inconsistency) > schema_version enforcement > rejects PRD with schema_version as string
2026-01-21T18:28:18.6749899Z (pass) PRD Schema Validation (Gap 4: Schema Version Inconsistency) > schema_version enforcement > rejects PRD with missing schema_version
2026-01-21T18:28:18.6751147Z (pass) PRD Schema Validation (Gap 4: Schema Version Inconsistency) > schema_version enforcement > rejects PRD with null schema_version [1.00ms]
2026-01-21T18:28:18.6752805Z (pass) PRD Schema Validation (Gap 4: Schema Version Inconsistency) > alignment with MCP tool schema > accepts valid PRD that matches MCP tool expectations
2026-01-21T18:28:18.6754425Z (pass) PRD Schema Validation (Gap 4: Schema Version Inconsistency) > error messages > provides helpful error for wrong schema_version
2026-01-21T18:28:18.6755877Z (pass) PRD Schema Validation (Gap 4: Schema Version Inconsistency) > real-world scenarios > accepts minimal valid PRD
2026-01-21T18:28:18.6756833Z (pass) PRD Schema Validation (Gap 4: Schema Version Inconsistency) > real-world scenarios > accepts PRD with many stories
2026-01-21T18:28:18.6757644Z (pass) PRD Schema Validation (Gap 4: Schema Version Inconsistency) > real-world scenarios > rejects PRD from old schema version
2026-01-21T18:28:18.6758500Z (pass) PRD Schema Validation (Gap 4: Schema Version Inconsistency) > real-world scenarios > rejects PRD from future schema version
2026-01-21T18:28:18.6758982Z
2026-01-21T18:28:18.6759264Z ##[endgroup]
2026-01-21T18:28:18.6759375Z
2026-01-21T18:28:18.6759641Z ##[group]src/**tests**/tui.test.ts:
2026-01-21T18:28:18.7989301Z (pass) TUI > createTuiState > creates state from items
2026-01-21T18:28:18.7989914Z (pass) TUI > createTuiState > sets correct counts
2026-01-21T18:28:18.7990539Z (pass) TUI > createTuiState > initializes with null current values
2026-01-21T18:28:18.7991051Z (pass) TUI > updateTuiState > updates state with partial
2026-01-21T18:28:18.7994463Z (pass) TUI > renderDashboard > renders header with current item
2026-01-21T18:28:18.7995567Z (pass) TUI > renderDashboard > renders item list with icons
2026-01-21T18:28:18.7997107Z (pass) TUI > renderDashboard > renders progress bar/count [1.00ms]
2026-01-21T18:28:18.7997847Z (pass) TUI > renderDashboard > handles empty items
2026-01-21T18:28:18.7998719Z (pass) TUI > renderDashboard > truncates long names
2026-01-21T18:28:18.7999818Z (pass) TUI > renderDashboard > renders phase and story info
2026-01-21T18:28:18.8000519Z (pass) TUI > renderDashboard > renders keyboard shortcuts
2026-01-21T18:28:18.8024245Z (pass) TUI > formatRuntime > formats seconds correctly [2.00ms]
2026-01-21T18:28:18.8024969Z (pass) TUI > formatRuntime > formats minutes correctly
2026-01-21T18:28:18.8025608Z (pass) TUI > formatRuntime > formats hours correctly
2026-01-21T18:28:18.8026449Z (pass) TUI > formatRuntime > pads single digits with zeros
2026-01-21T18:28:18.8027380Z (pass) TUI > getStateIcon > returns ✓ for done
2026-01-21T18:28:18.8028190Z (pass) TUI > getStateIcon > returns → for implementing [1.00ms]
2026-01-21T18:28:18.8028977Z (pass) TUI > getStateIcon > returns → for in_pr
2026-01-21T18:28:18.8029651Z (pass) TUI > getStateIcon > returns ○ for raw
2026-01-21T18:28:18.8030340Z (pass) TUI > getStateIcon > returns ○ for researched
2026-01-21T18:28:18.8031073Z (pass) TUI > getStateIcon > returns ○ for planned
2026-01-21T18:28:18.8031791Z (pass) TUI > getStateIcon > returns ○ for unknown state
2026-01-21T18:28:18.8032384Z (pass) TUI > padToWidth > pads short strings
2026-01-21T18:28:18.8033000Z (pass) TUI > padToWidth > truncates long strings with ellipsis
2026-01-21T18:28:18.8033697Z (pass) TUI > padToWidth > leaves exact-length strings unchanged
2026-01-21T18:28:18.8034352Z (pass) TUI > TuiRunner > creates runner without error
2026-01-21T18:28:18.8034927Z (pass) TUI > TuiRunner > updates state correctly
2026-01-21T18:28:18.8036780Z (pass) TUI > TuiRunner > appendLog adds log entries [1.00ms]
2026-01-21T18:28:18.8038293Z (pass) TUI > TuiRunner > subscribe notifies on state changes
2026-01-21T18:28:18.8039584Z (pass) TUI > TuiRunner > unsubscribe stops notifications
2026-01-21T18:28:18.8040740Z (pass) TUI > createSimpleProgress > logs update messages
2026-01-21T18:28:18.8041488Z (pass) TUI > createSimpleProgress > logs update without message
2026-01-21T18:28:18.8042199Z (pass) TUI > createSimpleProgress > logs complete messages
2026-01-21T18:28:18.8042809Z (pass) TUI > createSimpleProgress > logs fail messages
2026-01-21T18:28:18.8043208Z
2026-01-21T18:28:18.8043844Z ##[endgroup]
2026-01-21T18:28:18.8044033Z
2026-01-21T18:28:18.8044550Z ##[group]src/**tests**/agent.test.ts:
2026-01-21T18:28:18.8136056Z (pass) getAgentConfig > extracts correct fields from ConfigResolved
2026-01-21T18:28:18.8136818Z (pass) getAgentConfig > works with DEFAULT_CONFIG
2026-01-21T18:28:18.8137515Z (pass) getAgentConfig > extracts custom agent configuration [1.00ms]
2026-01-21T18:28:18.8180619Z output
2026-01-21T18:28:18.8180986Z <promise>COMPLETE</promise>
2026-01-21T18:28:18.8193308Z (pass) runAgent > successful run with completion signal detected [5.00ms]
2026-01-21T18:28:18.8206361Z output without signal
2026-01-21T18:28:18.8210325Z (pass) runAgent > run without completion signal (success: false, completionDetected: false) [2.00ms]
2026-01-21T18:28:21.8243397Z (pass) runAgent > timeout handling [3002.98ms]
2026-01-21T18:28:21.8249944Z (pass) runAgent > dryRun mode logs but doesn't execute [1.00ms]
2026-01-21T18:28:21.8263773Z error output
2026-01-21T18:28:21.8266828Z (pass) runAgent > non-zero exit code handling [1.00ms]
2026-01-21T18:28:21.8276761Z <promise>COMPLETE</promise>
2026-01-21T18:28:21.8280262Z (pass) runAgent > non-zero exit code with completion signal still fails [1.00ms]
2026-01-21T18:28:21.8300342Z This is my test prompt content<promise>COMPLETE</promise>
2026-01-21T18:28:21.8303169Z (pass) runAgent > receives prompt via stdin [2.00ms]
2026-01-21T18:28:21.8317142Z (pass) runAgent > handles command not found [2.00ms]
2026-01-21T18:28:21.8320855Z (pass) runAgent > dry-run mode works with SDK mode
2026-01-21T18:28:22.4692441Z 🤖 [mock-agent] Starting simulated agent run...
2026-01-21T18:28:23.1119905Z 📋 [mock-agent] Analyzing prompt...
2026-01-21T18:28:23.4440881Z 🔍 [mock-agent] Researching codebase...
2026-01-21T18:28:23.9947682Z ✏️ [mock-agent] Making changes...
2026-01-21T18:28:24.4473326Z ✅ [mock-agent] Changes complete!
2026-01-21T18:28:25.1190533Z <promise>COMPLETE</promise>
2026-01-21T18:28:25.1192867Z (pass) runAgent > mock-agent mode works with SDK mode [3287.99ms]
2026-01-21T18:28:25.1194149Z (pass) runAgent - SDK mode config > SDK mode configuration
2026-01-21T18:28:25.1194591Z
2026-01-21T18:28:25.1195024Z ##[endgroup]
2026-01-21T18:28:25.1195562Z
2026-01-21T18:28:25.1196230Z ##[group]src/**tests**/fs-util.test.ts:
2026-01-21T18:28:25.1215126Z (pass) fs/util utilities > pathExists > returns true for existing file
2026-01-21T18:28:25.1219365Z (pass) fs/util utilities > pathExists > returns true for existing directory [1.00ms]
2026-01-21T18:28:25.1223561Z (pass) fs/util utilities > pathExists > returns false for non-existent path
2026-01-21T18:28:25.1228845Z (pass) fs/util utilities > dirExists > returns true for existing directory [1.00ms]
2026-01-21T18:28:25.1233016Z (pass) fs/util utilities > dirExists > returns false for existing file
2026-01-21T18:28:25.1236648Z (pass) fs/util utilities > dirExists > returns false for non-existent path
2026-01-21T18:28:25.1237223Z
2026-01-21T18:28:25.1237628Z ##[endgroup]
2026-01-21T18:28:25.1237821Z
2026-01-21T18:28:25.1238345Z ##[group]src/**tests**/schemas.test.ts:
2026-01-21T18:28:25.1251815Z (pass) WorkflowStateSchema > accepts valid states
2026-01-21T18:28:25.1254560Z (pass) WorkflowStateSchema > rejects invalid state
2026-01-21T18:28:25.1255213Z (pass) StoryStatusSchema > accepts valid statuses
2026-01-21T18:28:25.1256197Z (pass) StoryStatusSchema > rejects invalid status
2026-01-21T18:28:25.1258261Z (pass) ConfigSchema > parses valid config from SPEC [1.00ms]
2026-01-21T18:28:25.1259277Z (pass) ConfigSchema > applies defaults for optional fields
2026-01-21T18:28:25.1260823Z (pass) ConfigSchema > rejects missing agent config
2026-01-21T18:28:25.1261835Z (pass) ItemSchema > parses valid item from SPEC
2026-01-21T18:28:25.1262942Z (pass) ItemSchema > accepts item with string values for nullable fields
2026-01-21T18:28:25.1264654Z (pass) ItemSchema > rejects invalid state value
2026-01-21T18:28:25.1268220Z (pass) ItemSchema > rejects missing required fields [1.00ms]
2026-01-21T18:28:25.1269685Z (pass) ItemSchema > rejects invalid types
2026-01-21T18:28:25.1270472Z (pass) StorySchema > parses valid story from SPEC
2026-01-21T18:28:25.1271891Z (pass) StorySchema > rejects invalid status value
2026-01-21T18:28:25.1274358Z (pass) StorySchema > rejects missing required fields
2026-01-21T18:28:25.1275576Z (pass) StorySchema > rejects invalid types
2026-01-21T18:28:25.1277531Z (pass) PrdSchema > parses valid prd from SPEC [1.00ms]
2026-01-21T18:28:25.1279556Z (pass) PrdSchema > rejects invalid story in user_stories
2026-01-21T18:28:25.1280445Z (pass) IndexItemSchema > parses valid index item from SPEC
2026-01-21T18:28:25.1281093Z (pass) IndexItemSchema > rejects invalid state
2026-01-21T18:28:25.1282527Z (pass) IndexSchema > parses valid index from SPEC
2026-01-21T18:28:25.1284198Z (pass) IndexSchema > rejects missing required fields
2026-01-21T18:28:25.1286257Z (pass) IndexSchema > rejects invalid item in items array
2026-01-21T18:28:25.1286685Z
2026-01-21T18:28:25.1287091Z ##[endgroup]
2026-01-21T18:28:25.1287287Z
2026-01-21T18:28:25.1287813Z ##[group]src/**tests**/story-quality.test.ts:
2026-01-21T18:28:25.1312876Z (pass) Story Quality Validation (Gap 3) > validateStoryQuality > story count validation > passes with at least one story
2026-01-21T18:28:25.1316075Z (pass) Story Quality Validation (Gap 3) > validateStoryQuality > story count validation > passes with multiple stories within limit
2026-01-21T18:28:25.1317630Z (pass) Story Quality Validation (Gap 3) > validateStoryQuality > story count validation > fails with no stories
2026-01-21T18:28:25.1319104Z (pass) Story Quality Validation (Gap 3) > validateStoryQuality > story count validation > fails with too many stories
2026-01-21T18:28:25.1320582Z (pass) Story Quality Validation (Gap 3) > validateStoryQuality > story count validation > allows custom story count limits
2026-01-21T18:28:25.1322134Z (pass) Story Quality Validation (Gap 3) > validateStoryQuality > story ID format validation > passes with valid US-### format
2026-01-21T18:28:25.1323723Z (pass) Story Quality Validation (Gap 3) > validateStoryQuality > story ID format validation > fails with invalid story ID format
2026-01-21T18:28:25.1325300Z (pass) Story Quality Validation (Gap 3) > validateStoryQuality > story ID format validation > fails with missing US prefix
2026-01-21T18:28:25.1327148Z (pass) Story Quality Validation (Gap 3) > validateStoryQuality > story ID format validation > allows disabling story ID format enforcement
2026-01-21T18:28:25.1328926Z (pass) Story Quality Validation (Gap 3) > validateStoryQuality > acceptance criteria validation > passes with sufficient acceptance criteria
2026-01-21T18:28:25.1330753Z (pass) Story Quality Validation (Gap 3) > validateStoryQuality > acceptance criteria validation > fails with insufficient acceptance criteria
2026-01-21T18:28:25.1332544Z (pass) Story Quality Validation (Gap 3) > validateStoryQuality > acceptance criteria validation > fails with empty acceptance criteria array
2026-01-21T18:28:25.1334405Z (pass) Story Quality Validation (Gap 3) > validateStoryQuality > acceptance criteria validation > fails with empty acceptance criteria strings [1.00ms]
2026-01-21T18:28:25.1336472Z (pass) Story Quality Validation (Gap 3) > validateStoryQuality > acceptance criteria validation > allows custom minimum acceptance criteria
2026-01-21T18:28:25.1338213Z (pass) Story Quality Validation (Gap 3) > validateStoryQuality > priority range validation > passes with priority in valid range (1-4)
2026-01-21T18:28:25.1339858Z (pass) Story Quality Validation (Gap 3) > validateStoryQuality > priority range validation > fails with priority below minimum
2026-01-21T18:28:25.1341939Z (pass) Story Quality Validation (Gap 3) > validateStoryQuality > priority range validation > fails with priority above maximum
2026-01-21T18:28:25.1343553Z (pass) Story Quality Validation (Gap 3) > validateStoryQuality > priority range validation > fails with negative priority
2026-01-21T18:28:25.1345081Z (pass) Story Quality Validation (Gap 3) > validateStoryQuality > priority range validation > allows custom priority range
2026-01-21T18:28:25.1346732Z (pass) Story Quality Validation (Gap 3) > validateStoryQuality > title validation > passes with non-empty title
2026-01-21T18:28:25.1348078Z (pass) Story Quality Validation (Gap 3) > validateStoryQuality > title validation > fails with empty title
2026-01-21T18:28:25.1349434Z (pass) Story Quality Validation (Gap 3) > validateStoryQuality > title validation > fails with whitespace-only title
2026-01-21T18:28:25.1350988Z (pass) Story Quality Validation (Gap 3) > validateStoryQuality > multiple validation errors > collects all errors from multiple stories
2026-01-21T18:28:25.1352634Z (pass) Story Quality Validation (Gap 3) > validateStoryQuality > multiple validation errors > includes story ID and title in error details
2026-01-21T18:28:25.1354186Z (pass) Story Quality Validation (Gap 3) > validateStoryQuality > real-world examples > validates a well-structured PRD
2026-01-21T18:28:25.1355960Z (pass) Story Quality Validation (Gap 3) > validateStoryQuality > real-world examples > rejects a PRD with poor quality stories [1.00ms]
2026-01-21T18:28:25.1357515Z (pass) Story Quality Validation (Gap 3) > validateStoryQuality > edge cases > handles single story at boundary conditions
2026-01-21T18:28:25.1358904Z (pass) Story Quality Validation (Gap 3) > validateStoryQuality > edge cases > handles maximum allowed stories
2026-01-21T18:28:25.1360331Z (pass) Story Quality Validation (Gap 3) > validateStoryQuality > edge cases > handles stories with exactly minimum acceptance criteria
2026-01-21T18:28:25.1361831Z (pass) Story Quality Validation (Gap 3) > validateStoryQuality > edge cases > handles stories at priority boundaries
2026-01-21T18:28:25.1363646Z (pass) Story Quality Validation (Gap 3) > verifyStoryCompletion (Gap 1: Acceptance Criteria Verification) > with valid PRD and story > returns valid when story has acceptance criteria
2026-01-21T18:28:25.1366041Z (pass) Story Quality Validation (Gap 3) > verifyStoryCompletion (Gap 1: Acceptance Criteria Verification) > with valid PRD and story > returns warning when story has no acceptance criteria
2026-01-21T18:28:25.1368413Z (pass) Story Quality Validation (Gap 3) > verifyStoryCompletion (Gap 1: Acceptance Criteria Verification) > with valid PRD and story > returns warning when story has empty acceptance criteria
2026-01-21T18:28:25.1370745Z (pass) Story Quality Validation (Gap 3) > verifyStoryCompletion (Gap 1: Acceptance Criteria Verification) > with valid PRD and story > returns warning when story is already done
2026-01-21T18:28:25.1372850Z (pass) Story Quality Validation (Gap 3) > verifyStoryCompletion (Gap 1: Acceptance Criteria Verification) > with invalid input > returns error when PRD is null
2026-01-21T18:28:25.1375289Z (pass) Story Quality Validation (Gap 3) > verifyStoryCompletion (Gap 1: Acceptance Criteria Verification) > with invalid input > returns error when story not found in PRD
2026-01-21T18:28:25.1377621Z (pass) Story Quality Validation (Gap 3) > verifyStoryCompletion (Gap 1: Acceptance Criteria Verification) > multiple warnings > accumulates warnings from multiple issues
2026-01-21T18:28:25.1378802Z
2026-01-21T18:28:25.1379294Z ##[endgroup]
2026-01-21T18:28:25.1379481Z
2026-01-21T18:28:25.1379922Z ##[group]src/**tests**/domain.test.ts:
2026-01-21T18:28:25.1380549Z (pass) state machine > getNextState > returns idea -> researched
2026-01-21T18:28:25.1381317Z (pass) state machine > getNextState > returns researched -> planned
2026-01-21T18:28:25.1382119Z (pass) state machine > getNextState > returns planned -> implementing
2026-01-21T18:28:25.1383414Z (pass) state machine > getNextState > returns implementing -> in_pr
2026-01-21T18:28:25.1384174Z (pass) state machine > getNextState > returns in_pr -> done
2026-01-21T18:28:25.1384869Z (pass) state machine > getNextState > returns null for done
2026-01-21T18:28:25.1385674Z (pass) state machine > getAllowedNextStates > returns allowed states for idea
2026-01-21T18:28:25.1386837Z (pass) state machine > getAllowedNextStates > returns allowed states for researched
2026-01-21T18:28:25.1387841Z (pass) state machine > getAllowedNextStates > returns allowed states for planned
2026-01-21T18:28:25.1388852Z (pass) state machine > getAllowedNextStates > returns allowed states for implementing
2026-01-21T18:28:25.1389860Z (pass) state machine > getAllowedNextStates > returns allowed states for in_pr
2026-01-21T18:28:25.1390773Z (pass) state machine > getAllowedNextStates > returns allowed states for done
2026-01-21T18:28:25.1391622Z (pass) state machine > isTerminalState > returns true only for done
2026-01-21T18:28:25.1392429Z (pass) state machine > isTerminalState > returns false for idea
2026-01-21T18:28:25.1393250Z (pass) state machine > isTerminalState > returns false for researched
2026-01-21T18:28:25.1394017Z (pass) state machine > isTerminalState > returns false for planned
2026-01-21T18:28:25.1394784Z (pass) state machine > isTerminalState > returns false for implementing
2026-01-21T18:28:25.1395536Z (pass) state machine > isTerminalState > returns false for in_pr
2026-01-21T18:28:25.1396566Z (pass) state machine > getStateIndex > returns correct index for each state
2026-01-21T18:28:25.1397454Z (pass) validation > canEnterResearched > returns valid when hasResearchMd is true
2026-01-21T18:28:25.1398423Z (pass) validation > canEnterResearched > returns invalid when hasResearchMd is false
2026-01-21T18:28:25.1399441Z (pass) validation > canEnterPlanned > returns valid when hasPlanMd and prd exist [1.00ms]
2026-01-21T18:28:25.1400451Z (pass) validation > canEnterPlanned > returns invalid when hasPlanMd is false
2026-01-21T18:28:25.1401308Z (pass) validation > canEnterPlanned > returns invalid when prd is null
2026-01-21T18:28:25.1402163Z (pass) validation > canEnterImplementing > returns valid when prd has pending stories
2026-01-21T18:28:25.1403104Z (pass) validation > canEnterImplementing > returns invalid when prd is null
2026-01-21T18:28:25.1404001Z (pass) validation > canEnterImplementing > returns invalid when no pending stories
2026-01-21T18:28:25.1404961Z (pass) validation > canEnterInPr > returns valid when all stories done and hasPr
2026-01-21T18:28:25.1406007Z (pass) validation > canEnterInPr > returns invalid when stories not all done
2026-01-21T18:28:25.1406830Z (pass) validation > canEnterInPr > returns invalid when hasPr is false
2026-01-21T18:28:25.1407617Z (pass) validation > canEnterDone > returns valid when prMerged is true
2026-01-21T18:28:25.1408442Z (pass) validation > canEnterDone > returns invalid when prMerged is false
2026-01-21T18:28:25.1409277Z (pass) validateTransition > valid: raw -> researched with hasResearchMd
2026-01-21T18:28:25.1410170Z (pass) validateTransition > invalid: raw -> researched without hasResearchMd
2026-01-21T18:28:25.1411048Z (pass) validateTransition > invalid: skip states (raw -> planned)
2026-01-21T18:28:25.1411879Z (pass) validateTransition > invalid: backward transition (planned -> raw)
2026-01-21T18:28:25.1412653Z (pass) validateTransition > valid: full workflow progression
2026-01-21T18:28:25.1413380Z (pass) helper functions > allStoriesDone > returns false for null prd
2026-01-21T18:28:25.1414191Z (pass) helper functions > allStoriesDone > returns false for empty stories
2026-01-21T18:28:25.1415085Z (pass) helper functions > allStoriesDone > returns false when some stories pending
2026-01-21T18:28:25.1416150Z (pass) helper functions > allStoriesDone > returns true when all stories done
2026-01-21T18:28:25.1417006Z (pass) helper functions > hasPendingStories > returns false for null prd
2026-01-21T18:28:25.1418114Z (pass) helper functions > hasPendingStories > returns false when no pending stories
2026-01-21T18:28:25.1419366Z (pass) helper functions > hasPendingStories > returns true when at least one pending story
2026-01-21T18:28:25.1420699Z (pass) state machine edge cases > same-state transition is invalid: idea → %s
2026-01-21T18:28:25.1421795Z (pass) state machine edge cases > same-state transition is invalid: researched → %s
2026-01-21T18:28:25.1422885Z (pass) state machine edge cases > same-state transition is invalid: planned → %s
2026-01-21T18:28:25.1423992Z (pass) state machine edge cases > same-state transition is invalid: implementing → %s
2026-01-21T18:28:25.1425090Z (pass) state machine edge cases > same-state transition is invalid: in_pr → %s
2026-01-21T18:28:25.1426347Z (pass) state machine edge cases > same-state transition is invalid: done → %s
2026-01-21T18:28:25.1427211Z (pass) state machine edge cases > disallows all non-adjacent transitions
2026-01-21T18:28:25.1428046Z (pass) state machine edge cases > no transition from done is valid
2026-01-21T18:28:25.1428992Z (pass) applyStateTransition > returns new item with updated state and updated_at
2026-01-21T18:28:25.1429881Z (pass) applyStateTransition > returns error for invalid transition
2026-01-21T18:28:25.1430664Z (pass) applyStateTransition > returns error for terminal state
2026-01-21T18:28:25.1431399Z (pass) applyStateTransition > never mutates the input item
2026-01-21T18:28:25.1431832Z
2026-01-21T18:28:25.1432370Z ##[endgroup]
2026-01-21T18:28:25.1432571Z
2026-01-21T18:28:25.1433028Z ##[group]src/**tests**/research-quality.test.ts:
2026-01-21T18:28:25.1434307Z (pass) Research Quality Validation (Gap 2) > validateResearchQuality > citation density validation > passes with sufficient file:line citations [1.00ms]
2026-01-21T18:28:25.1436354Z (pass) Research Quality Validation (Gap 2) > validateResearchQuality > citation density validation > fails with insufficient citations
2026-01-21T18:28:25.1438204Z (pass) Research Quality Validation (Gap 2) > validateResearchQuality > citation density validation > correctly counts various citation formats
2026-01-21T18:28:25.1441923Z (pass) Research Quality Validation (Gap 2) > validateResearchQuality > citation density validation > does not count citations without line numbers [1.00ms]
2026-01-21T18:28:25.1444243Z (pass) Research Quality Validation (Gap 2) > validateResearchQuality > required sections validation > passes with all required sections present
2026-01-21T18:28:25.1447385Z (pass) Research Quality Validation (Gap 2) > validateResearchQuality > required sections validation > fails with missing required sections
2026-01-21T18:28:25.1449224Z (pass) Research Quality Validation (Gap 2) > validateResearchQuality > required sections validation > allows case-insensitive section matching
2026-01-21T18:28:25.1450982Z (pass) Research Quality Validation (Gap 2) > validateResearchQuality > minimum length validation > passes with sufficient summary length
2026-01-21T18:28:25.1452750Z (pass) Research Quality Validation (Gap 2) > validateResearchQuality > minimum length validation > fails with insufficient summary length
2026-01-21T18:28:25.1454570Z (pass) Research Quality Validation (Gap 2) > validateResearchQuality > minimum length validation > fails with insufficient current state analysis
2026-01-21T18:28:25.1456452Z (pass) Research Quality Validation (Gap 2) > validateResearchQuality > edge cases > handles empty content gracefully [1.00ms]
2026-01-21T18:28:25.1457899Z (pass) Research Quality Validation (Gap 2) > validateResearchQuality > edge cases > handles content with no sections
2026-01-21T18:28:25.1459229Z (pass) Research Quality Validation (Gap 2) > validateResearchQuality > edge cases > allows custom options
2026-01-21T18:28:25.1460642Z (pass) Research Quality Validation (Gap 2) > validateResearchQuality > edge cases > handles malformed citations gracefully
2026-01-21T18:28:25.1462287Z (pass) Research Quality Validation (Gap 2) > validateResearchQuality > real-world examples > validates a minimal but acceptable research document
2026-01-21T18:28:25.1464379Z (pass) Research Quality Validation (Gap 2) > validateResearchQuality > real-world examples > rejects a superficial research document
2026-01-21T18:28:25.1465324Z
2026-01-21T18:28:25.1465892Z ##[endgroup]
2026-01-21T18:28:25.1466076Z
2026-01-21T18:28:25.1466549Z ##[group]src/**tests**/fs.test.ts:
2026-01-21T18:28:25.1483883Z (pass) Path utilities > findRepoRoot > throws when .wreckit missing
2026-01-21T18:28:25.1488838Z (pass) Path utilities > findRepoRoot > throws when .git missing [1.00ms]
2026-01-21T18:28:25.1493972Z (pass) Path utilities > findRepoRoot > succeeds when both exist
2026-01-21T18:28:25.1502151Z (pass) Path utilities > findRepoRoot > finds root from nested directory [1.00ms]
2026-01-21T18:28:25.1504687Z (pass) Path utilities > path helpers > getWreckitDir returns correct path
2026-01-21T18:28:25.1507113Z (pass) Path utilities > path helpers > getConfigPath returns correct path [1.00ms]
2026-01-21T18:28:25.1509430Z (pass) Path utilities > path helpers > getIndexPath returns correct path
2026-01-21T18:28:25.1511845Z (pass) Path utilities > path helpers > getPromptsDir returns correct path
2026-01-21T18:28:25.1514435Z (pass) Path utilities > path helpers > getItemsDir returns correct path
2026-01-21T18:28:25.1517158Z (pass) Path utilities > path helpers > getItemDir returns correct path [1.00ms]
2026-01-21T18:28:25.1519585Z (pass) Path utilities > path helpers > getItemJsonPath returns correct path
2026-01-21T18:28:25.1522431Z (pass) Path utilities > path helpers > getPrdPath returns correct path
2026-01-21T18:28:25.1524754Z (pass) Path utilities > path helpers > getResearchPath returns correct path
2026-01-21T18:28:25.1527381Z (pass) Path utilities > path helpers > getPlanPath returns correct path [1.00ms]
2026-01-21T18:28:25.1529879Z (pass) Path utilities > path helpers > getProgressLogPath returns correct path
2026-01-21T18:28:25.1532891Z (pass) Path utilities > path helpers > getPromptPath returns correct path
2026-01-21T18:28:25.1541146Z (pass) JSON utilities > readJsonWithSchema > succeeds with valid JSON [1.00ms]
2026-01-21T18:28:25.1547143Z (pass) JSON utilities > readJsonWithSchema > throws SchemaValidationError for invalid data [1.00ms]
2026-01-21T18:28:25.1552203Z (pass) JSON utilities > readJsonWithSchema > throws InvalidJsonError for malformed JSON
2026-01-21T18:28:25.1556298Z (pass) JSON utilities > readJsonWithSchema > throws FileNotFoundError for missing file
2026-01-21T18:28:25.1561892Z (pass) JSON utilities > writeJsonPretty > creates pretty-printed JSON with 2 spaces and trailing newline [1.00ms]
2026-01-21T18:28:25.1568944Z (pass) JSON utilities > writeJsonPretty > creates parent directories if needed [1.00ms]
2026-01-21T18:28:25.1582225Z (pass) JSON utilities > round-trip > write then read returns same data [1.00ms]
2026-01-21T18:28:25.1590103Z (pass) Typed wrapper tests > readConfig > reads valid config [1.00ms]
2026-01-21T18:28:25.1596555Z (pass) Typed wrapper tests > readConfig > throws on invalid config
2026-01-21T18:28:25.1607547Z (pass) Typed wrapper tests > readItem / writeItem > writes and reads valid item [2.00ms]
2026-01-21T18:28:25.1616606Z (pass) Typed wrapper tests > readItem / writeItem > throws on invalid item data
2026-01-21T18:28:25.1628103Z (pass) Typed wrapper tests > readPrd / writePrd > writes and reads valid prd [2.00ms]
2026-01-21T18:28:25.1636141Z (pass) Typed wrapper tests > readPrd / writePrd > throws on invalid prd data
2026-01-21T18:28:25.1646131Z (pass) Typed wrapper tests > readIndex / writeIndex > writes and reads valid index [1.00ms]
2026-01-21T18:28:25.1650838Z (pass) Typed wrapper tests > readIndex / writeIndex > returns null when index does not exist [1.00ms]
2026-01-21T18:28:25.1657303Z (pass) Typed wrapper tests > readIndex / writeIndex > throws on invalid index data [1.00ms]
2026-01-21T18:28:25.1657922Z
2026-01-21T18:28:25.1658247Z ##[endgroup]
2026-01-21T18:28:25.1658357Z
2026-01-21T18:28:25.1658867Z ##[group]src/**tests**/config.test.ts:
2026-01-21T18:28:25.1681906Z (pass) loadConfig > returns defaults when config.json does not exist [1.00ms]
2026-01-21T18:28:25.1689513Z (pass) loadConfig > fills missing fields from defaults for partial config.json [1.00ms]
2026-01-21T18:28:25.1695619Z (pass) loadConfig > uses full config.json as-is when all fields present
2026-01-21T18:28:25.1702335Z (pass) loadConfig > throws SchemaValidationError for invalid config.json [1.00ms]
2026-01-21T18:28:25.1708144Z (pass) loadConfig > throws InvalidJsonError for malformed JSON [1.00ms]
2026-01-21T18:28:25.1709019Z (pass) mergeWithDefaults > returns full defaults for empty object
2026-01-21T18:28:25.1709790Z (pass) mergeWithDefaults > merges partial object correctly
2026-01-21T18:28:25.1710688Z (pass) mergeWithDefaults > merges nested agent object correctly with partial agent config
2026-01-21T18:28:25.1711633Z (pass) applyOverrides > returns same config when no overrides
2026-01-21T18:28:25.1712327Z (pass) applyOverrides > applies baseBranch override
2026-01-21T18:28:25.1712937Z (pass) applyOverrides > applies agentCommand override
2026-01-21T18:28:25.1713455Z (pass) applyOverrides > applies maxIterations override
2026-01-21T18:28:25.1714147Z (pass) applyOverrides > applies multiple overrides together
2026-01-21T18:28:25.1721768Z (pass) createDefaultConfig > creates .wreckit/config.json if it does not exist [1.00ms]
2026-01-21T18:28:25.1741034Z (pass) createDefaultConfig > created file validates against ConfigSchema [2.00ms]
2026-01-21T18:28:25.1741406Z
2026-01-21T18:28:25.1741671Z ##[endgroup]
2026-01-21T18:28:25.1741788Z
2026-01-21T18:28:25.1742039Z ##[group]src/**tests**/ideas-mcp-server.test.ts:
2026-01-21T18:28:25.2686805Z (pass) createIdeasMcpServer > server creation > creates server successfully [7.00ms]
2026-01-21T18:28:25.2698864Z (pass) createIdeasMcpServer > server creation > creates server with handlers [2.00ms]
2026-01-21T18:28:25.2714301Z (pass) createIdeasMcpServer > onInterviewIdeas handler > calls onInterviewIdeas handler when save_interview_ideas is invoked [1.00ms]
2026-01-21T18:28:25.2716948Z (pass) createIdeasMcpServer > onInterviewIdeas handler > captures ideas correctly through handler
2026-01-21T18:28:25.2718732Z (pass) createIdeasMcpServer > onInterviewIdeas handler > handles multiple ideas
2026-01-21T18:28:25.2724482Z (pass) createIdeasMcpServer > onParsedIdeas handler > calls onParsedIdeas handler when save_parsed_ideas is invoked [1.00ms]
2026-01-21T18:28:25.2729453Z (pass) createIdeasMcpServer > onParsedIdeas handler > handles ideas with all optional fields
2026-01-21T18:28:25.2733643Z (pass) createIdeasMcpServer > server can be used with both handlers > supports both interview and parsed ideas handlers [1.00ms]
2026-01-21T18:28:25.2738950Z (pass) createIdeasMcpServer > server can be used with both handlers > works with empty handlers object [1.00ms]
2026-01-21T18:28:25.2744326Z (pass) createIdeasMcpServer > server can be used with both handlers > works with no handlers
2026-01-21T18:28:25.2749772Z (pass) createIdeasMcpServer > security: ideas-only server > creates server that only handles ideas (no PRD, no story status) [1.00ms]
2026-01-21T18:28:25.2752251Z (pass) createIdeasMcpServer > security: ideas-only server > reduces blast radius by excluding other phase handlers
2026-01-21T18:28:25.2753095Z
2026-01-21T18:28:25.2753583Z ##[endgroup]
2026-01-21T18:28:25.2753765Z
2026-01-21T18:28:25.2754255Z ##[group]src/**tests**/workflow.test.ts:
2026-01-21T18:28:25.2887863Z (pass) workflow > buildValidationContext > returns correct flags based on file existence [2.00ms]
2026-01-21T18:28:25.2896882Z (pass) workflow > buildValidationContext > detects research.md when present [1.00ms]
2026-01-21T18:28:25.2908425Z (pass) workflow > buildValidationContext > detects plan.md and prd.json when present [1.00ms]
2026-01-21T18:28:25.2915986Z (pass) workflow > buildValidationContext > handles missing files gracefully
2026-01-21T18:28:25.3007960Z (pass) workflow > runPhaseResearch > transitions from raw to researched on success [10.00ms]
2026-01-21T18:28:25.3016850Z (pass) workflow > runPhaseResearch > fails when not in raw state
2026-01-21T18:28:25.3049103Z (pass) workflow > runPhaseResearch > fails when research.md not created by agent [3.00ms]
2026-01-21T18:28:25.3082318Z (pass) workflow > runPhaseResearch > fails when research.md has insufficient quality (Gap 2) [3.00ms]
2026-01-21T18:28:25.3172422Z (pass) workflow > runPhasePlan > transitions from researched to planned on success [9.00ms]
2026-01-21T18:28:25.3180670Z (pass) workflow > runPhasePlan > fails when not in researched state [1.00ms]
2026-01-21T18:28:25.3221127Z (pass) workflow > runPhasePlan > fails when plan.md not created [4.00ms]
2026-01-21T18:28:25.3260610Z (pass) workflow > runPhasePlan > fails when prd.json not created [4.00ms]
2026-01-21T18:28:25.3491826Z (pass) workflow > runPhasePlan > write containment enforcement (Gap 1) > fails when agent modifies source files during planning [23.00ms]
2026-01-21T18:28:25.3717391Z (pass) workflow > runPhasePlan > write containment enforcement (Gap 1) > fails when agent creates files outside item directory [23.00ms]
2026-01-21T18:28:25.3972183Z (pass) workflow > runPhasePlan > write containment enforcement (Gap 1) > succeeds when agent only writes allowed files (plan.md and prd.json) [25.00ms]
2026-01-21T18:28:25.3991611Z (pass) workflow > runPhasePlan > write containment enforcement (Gap 1) > skips write containment check in dryRun mode [2.00ms]
2026-01-21T18:28:25.4016989Z (pass) workflow > runPhasePlan > write containment enforcement (Gap 1) > skips write containment check in mockAgent mode [2.00ms]
2026-01-21T18:28:25.4101747Z (pass) workflow > runPhaseImplement > transitions from planned to implementing [8.00ms]
2026-01-21T18:28:25.4110395Z (pass) workflow > runPhaseImplement > fails when not in planned or implementing state [1.00ms]
2026-01-21T18:28:25.4124521Z (pass) workflow > runPhaseImplement > fails when prd.json missing [1.00ms]
2026-01-21T18:28:25.4183722Z (pass) workflow > runPhaseImplement > updates story status after agent run [6.00ms]
2026-01-21T18:28:25.4262795Z (pass) workflow > runPhaseImplement > appends to progress.log [8.00ms]
2026-01-21T18:28:25.4406655Z (pass) workflow > runPhaseImplement > respects max_iterations [14.00ms]
2026-01-21T18:28:25.4450483Z (pass) workflow > runPhaseImplement > handles timeout [5.00ms]
2026-01-21T18:28:25.4681937Z (pass) workflow > runPhaseImplement > scope tracking (Gap 2) > logs file changes during story implementation [23.00ms]
2026-01-21T18:28:25.4906830Z (pass) workflow > runPhaseImplement > scope tracking (Gap 2) > warns when story modifies wreckit system files [22.00ms]
2026-01-21T18:28:25.5145619Z (pass) workflow > runPhaseImplement > scope tracking (Gap 2) > does not warn for changes within item directory [24.00ms]
2026-01-21T18:28:25.5308695Z (pass) workflow > runPhaseImplement > scope tracking (Gap 2) > skips scope tracking in mockAgent mode [17.00ms]
2026-01-21T18:28:25.5478076Z (pass) workflow > runPhaseImplement > scope tracking (Gap 2) > skips scope tracking in dryRun mode [17.00ms]
2026-01-21T18:28:25.5507282Z (pass) workflow > runPhasePr > fails when not all stories done [3.00ms]
2026-01-21T18:28:25.5529003Z (pass) workflow > runPhasePr > succeeds when all stories done (stubbed) [2.00ms]
2026-01-21T18:28:25.5549721Z (pass) workflow > runPhasePr > preflight/commit ordering bug (Gap 1) > auto-commits uncommitted changes before preflight check [2.00ms]
2026-01-21T18:28:25.5568455Z (pass) workflow > runPhasePr > preflight/commit ordering bug (Gap 1) > skips auto-commit when there are no uncommitted changes [2.00ms]
2026-01-21T18:28:25.5587963Z (pass) workflow > runPhasePr > preflight/commit ordering bug (Gap 1) > commits changes even when preflight would fail due to uncommitted changes [2.00ms]
2026-01-21T18:28:25.5619080Z (pass) workflow > runPhaseComplete > transitions from in_pr to done (stubbed) [3.00ms]
2026-01-21T18:28:25.5627966Z (pass) workflow > runPhaseComplete > fails when not in in_pr state [1.00ms]
2026-01-21T18:28:25.5641462Z (pass) workflow > runPhaseComplete > records completion metadata (Spec 006 Gap 5: Audit Trail) [1.00ms]
2026-01-21T18:28:25.5648971Z (pass) workflow > runPhaseComplete > fails when PR merged to wrong branch (Spec 006 Gap 1) [1.00ms]
2026-01-21T18:28:25.5656390Z (pass) workflow > runPhaseComplete > fails with distinct error for gh command failure (Spec 006 Gap 3)
2026-01-21T18:28:25.5669064Z (pass) workflow > runPhaseComplete > warns when PR head branch differs from expected [2.00ms]
2026-01-21T18:28:25.5681605Z (pass) workflow > runPhaseComplete > warns when CI checks did not pass [1.00ms]
2026-01-21T18:28:25.5684107Z (pass) workflow > getNextPhase > raw -> 'research'
2026-01-21T18:28:25.5686638Z (pass) workflow > getNextPhase > researched -> 'plan' [1.00ms]
2026-01-21T18:28:25.5689040Z (pass) workflow > getNextPhase > planned -> 'implement'
2026-01-21T18:28:25.5691316Z (pass) workflow > getNextPhase > implementing -> 'pr'
2026-01-21T18:28:25.5693670Z (pass) workflow > getNextPhase > in_pr -> 'complete'
2026-01-21T18:28:25.5696220Z (pass) workflow > getNextPhase > done -> null
2026-01-21T18:28:25.5711158Z (pass) workflow > runPhasePr - direct mode safeguards (Gap 4) > fails when direct mode enabled without explicit opt-in [2.00ms]
2026-01-21T18:28:25.5728067Z (pass) workflow > runPhasePr - direct mode safeguards (Gap 4) > succeeds when direct mode enabled with explicit opt-in [2.00ms]
2026-01-21T18:28:25.5744285Z (pass) workflow > runPhasePr - direct mode safeguards (Gap 4) > logs warning when direct mode is enabled with opt-in [1.00ms]
2026-01-21T18:28:25.5770073Z (pass) workflow > runPhasePr - direct mode safeguards (Gap 4) > creates rollback anchor before direct merge [3.00ms]
2026-01-21T18:28:25.5785247Z (pass) workflow > runPhasePr - direct mode safeguards (Gap 4) > cleans up branch after direct merge when cleanup enabled [1.00ms]
2026-01-21T18:28:25.5800297Z (pass) workflow > runPhasePr - direct mode safeguards (Gap 4) > skips branch cleanup when cleanup disabled [2.00ms]
2026-01-21T18:28:25.5813062Z (pass) workflow > runPhaseComplete - branch cleanup (Gap 4) > cleans up branch after PR merge when cleanup enabled [1.00ms]
2026-01-21T18:28:25.5825982Z (pass) workflow > runPhaseComplete - branch cleanup (Gap 4) > skips branch cleanup when cleanup disabled [1.00ms]
2026-01-21T18:28:25.5839298Z (pass) workflow > runPhaseComplete - branch cleanup (Gap 4) > only deletes local branch when delete_remote is false [2.00ms]
2026-01-21T18:28:25.5839971Z
2026-01-21T18:28:25.5840771Z ##[endgroup]
2026-01-21T18:28:25.5840895Z
2026-01-21T18:28:25.5841145Z ##[group]src/**tests**/z-git.test.ts:
2026-01-21T18:28:25.5989532Z (pass) git functions > isGitRepo > returns true in git repo [14.00ms]
2026-01-21T18:28:25.6109560Z 64 |
2026-01-21T18:28:25.6110008Z 65 | it("returns false outside git repo", async () => {
2026-01-21T18:28:25.6110801Z 66 | const nonRepoDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-non-repo-"));
2026-01-21T18:28:25.6111367Z 67 | try {
2026-01-21T18:28:25.6111600Z 68 | const result = await isGitRepo(nonRepoDir);
2026-01-21T18:28:25.6111902Z 69 | expect(result).toBe(false);
2026-01-21T18:28:25.6112167Z ^
2026-01-21T18:28:25.6112413Z error: expect(received).toBe(expected)
2026-01-21T18:28:25.6112603Z
2026-01-21T18:28:25.6112678Z Expected: false
2026-01-21T18:28:25.6112863Z Received: true
2026-01-21T18:28:25.6112966Z
2026-01-21T18:28:25.6113222Z at <anonymous> (/home/runner/work/wreckit/wreckit/src/**tests**/z-git.test.ts:69:24)
2026-01-21T18:28:25.6113567Z
2026-01-21T18:28:25.6132704Z ##[error]Expected: false
Received: true

      at <anonymous> (/home/runner/work/wreckit/wreckit/src/__tests__/z-git.test.ts:69:24)

2026-01-21T18:28:25.6140233Z (fail) git functions > isGitRepo > returns false outside git repo [12.00ms]
2026-01-21T18:28:25.6229135Z 74 | });
2026-01-21T18:28:25.6229351Z 75 |
2026-01-21T18:28:25.6229562Z 76 | describe("getCurrentBranch", () => {
2026-01-21T18:28:25.6230126Z 77 | it("returns current branch name", async () => {
2026-01-21T18:28:25.6230756Z 78 | const result = await getCurrentBranch(gitOptions);
2026-01-21T18:28:25.6231756Z 79 | expect(["main", "master"]).toContain(result); // git may use either
2026-01-21T18:28:25.6232608Z ^
2026-01-21T18:28:25.6232897Z error: expect(received).toContain(expected)
2026-01-21T18:28:25.6233090Z
2026-01-21T18:28:25.6233203Z Expected to contain: "wreckit/001-test-feature"
2026-01-21T18:28:25.6233636Z Received: [ "main", "master" ]
2026-01-21T18:28:25.6233855Z
2026-01-21T18:28:25.6234100Z at <anonymous> (/home/runner/work/wreckit/wreckit/src/**tests**/z-git.test.ts:79:34)
2026-01-21T18:28:25.6234447Z
2026-01-21T18:28:25.6236348Z ##[error]Expected to contain: "wreckit/001-test-feature"
Received: [ "main", "master" ]

      at <anonymous> (/home/runner/work/wreckit/wreckit/src/__tests__/z-git.test.ts:79:34)

2026-01-21T18:28:25.6237661Z (fail) git functions > getCurrentBranch > returns current branch name [12.00ms]
2026-01-21T18:28:25.6349653Z (pass) git functions > branchExists > returns true for existing branch [12.00ms]
2026-01-21T18:28:25.6469646Z 88 | expect(result).toBe(true);
2026-01-21T18:28:25.6470097Z 89 | });
2026-01-21T18:28:25.6470391Z 90 |
2026-01-21T18:28:25.6470786Z 91 | it("returns false for non-existing branch", async () => {
2026-01-21T18:28:25.6471492Z 92 | const result = await branchExists("nonexistent", gitOptions);
2026-01-21T18:28:25.6472073Z 93 | expect(result).toBe(false);
2026-01-21T18:28:25.6472470Z ^
2026-01-21T18:28:25.6472838Z error: expect(received).toBe(expected)
2026-01-21T18:28:25.6473131Z
2026-01-21T18:28:25.6473249Z Expected: false
2026-01-21T18:28:25.6473543Z Received: true
2026-01-21T18:28:25.6473717Z
2026-01-21T18:28:25.6474105Z at <anonymous> (/home/runner/work/wreckit/wreckit/src/**tests**/z-git.test.ts:93:22)
2026-01-21T18:28:25.6474686Z
2026-01-21T18:28:25.6476524Z ##[error]Expected: false
Received: true

      at <anonymous> (/home/runner/work/wreckit/wreckit/src/__tests__/z-git.test.ts:93:22)

2026-01-21T18:28:25.6477774Z (fail) git functions > branchExists > returns false for non-existing branch [12.00ms]
2026-01-21T18:28:25.6593563Z 95 | });
2026-01-21T18:28:25.6593861Z 96 |
2026-01-21T18:28:25.6594241Z 97 | describe("hasUncommittedChanges", () => {
2026-01-21T18:28:25.6594825Z 98 | it("returns false when no changes", async () => {
2026-01-21T18:28:25.6595494Z 99 | const result = await hasUncommittedChanges(gitOptions);
2026-01-21T18:28:25.6596644Z 100 | expect(result).toBe(false);
2026-01-21T18:28:25.6597052Z ^
2026-01-21T18:28:25.6597436Z error: expect(received).toBe(expected)
2026-01-21T18:28:25.6597737Z
2026-01-21T18:28:25.6597860Z Expected: false
2026-01-21T18:28:25.6598157Z Received: true
2026-01-21T18:28:25.6598265Z
2026-01-21T18:28:25.6598517Z at <anonymous> (/home/runner/work/wreckit/wreckit/src/**tests**/z-git.test.ts:100:22)
2026-01-21T18:28:25.6598872Z
2026-01-21T18:28:25.6600000Z ##[error]Expected: false
Received: true

      at <anonymous> (/home/runner/work/wreckit/wreckit/src/__tests__/z-git.test.ts:100:22)

2026-01-21T18:28:25.6601209Z (fail) git functions > hasUncommittedChanges > returns false when no changes [12.00ms]
2026-01-21T18:28:25.6713061Z (pass) git functions > hasUncommittedChanges > returns true when changes exist [12.00ms]
2026-01-21T18:28:25.6854620Z (pass) git functions > runGitCommand > executes git commands [14.00ms]
2026-01-21T18:28:25.6978264Z 115 |
2026-01-21T18:28:25.6978766Z 116 | it("handles dryRun", async () => {
2026-01-21T18:28:25.6979391Z 117 | const dryOptions: GitOptions = { ...gitOptions, dryRun: true };
2026-01-21T18:28:25.6980211Z 118 | const result = await runGitCommand(["status"], dryOptions);
2026-01-21T18:28:25.6980864Z 119 | expect(result.exitCode).toBe(0);
2026-01-21T18:28:25.6981365Z 120 | expect(result.stdout).toBe("");
2026-01-21T18:28:25.6981660Z ^
2026-01-21T18:28:25.6981910Z error: expect(received).toBe(expected)
2026-01-21T18:28:25.6982304Z
2026-01-21T18:28:25.6982435Z Expected: ""
2026-01-21T18:28:25.6982759Z Received: "abc123def456"
2026-01-21T18:28:25.6983073Z
2026-01-21T18:28:25.6983326Z at <anonymous> (/home/runner/work/wreckit/wreckit/src/**tests**/z-git.test.ts:120:29)
2026-01-21T18:28:25.6983672Z
2026-01-21T18:28:25.6984905Z ##[error]Expected: ""
Received: "abc123def456"

      at <anonymous> (/home/runner/work/wreckit/wreckit/src/__tests__/z-git.test.ts:120:29)

2026-01-21T18:28:25.6986333Z (fail) git functions > runGitCommand > handles dryRun [13.00ms]
2026-01-21T18:28:27.4951309Z (pass) git functions > runGhCommand > executes gh commands (may fail if gh not installed) [1797.03ms]
2026-01-21T18:28:27.5078889Z (pass) git functions > runGhCommand > handles dryRun [13.00ms]
2026-01-21T18:28:27.5226905Z (pass) git functions > commitAll > handles dryRun [15.00ms]
2026-01-21T18:28:27.5345393Z (pass) git functions > pushBranch > handles dryRun [11.00ms]
2026-01-21T18:28:27.5474494Z 163 | "Test PR",
2026-01-21T18:28:27.5474902Z 164 | "Body",
2026-01-21T18:28:27.5475179Z 165 | dryOptions
2026-01-21T18:28:27.5475533Z 166 | );
2026-01-21T18:28:27.5476067Z 167 | expect(result.created).toBe(true);
2026-01-21T18:28:27.5476378Z 168 | expect(result.number).toBe(0);
2026-01-21T18:28:27.5476638Z ^
2026-01-21T18:28:27.5476875Z error: expect(received).toBe(expected)
2026-01-21T18:28:27.5477056Z
2026-01-21T18:28:27.5477121Z Expected: 0
2026-01-21T18:28:27.5477285Z Received: 42
2026-01-21T18:28:27.5477393Z
2026-01-21T18:28:27.5477640Z at <anonymous> (/home/runner/work/wreckit/wreckit/src/**tests**/z-git.test.ts:168:29)
2026-01-21T18:28:27.5477992Z
2026-01-21T18:28:27.5480005Z ##[error]Expected: 0
Received: 42

      at <anonymous> (/home/runner/work/wreckit/wreckit/src/__tests__/z-git.test.ts:168:29)

2026-01-21T18:28:27.5482274Z (fail) git functions > createOrUpdatePr > handles dryRun [13.00ms]
2026-01-21T18:28:27.5596137Z 171 |
2026-01-21T18:28:27.5596847Z 172 | describe("isPrMerged", () => {
2026-01-21T18:28:27.5597444Z 173 | it("returns false when PR not found", async () => {
2026-01-21T18:28:27.5597903Z 174 | // gh might not be configured, so we expect this to return false or throw
2026-01-21T18:28:27.5598385Z 175 | const result = await isPrMerged(999, gitOptions);
2026-01-21T18:28:27.5598694Z 176 | expect(result).toBe(false);
2026-01-21T18:28:27.5598946Z ^
2026-01-21T18:28:27.5599170Z error: expect(received).toBe(expected)
2026-01-21T18:28:27.5599348Z
2026-01-21T18:28:27.5599420Z Expected: false
2026-01-21T18:28:27.5599598Z Received: true
2026-01-21T18:28:27.5599699Z
2026-01-21T18:28:27.5599938Z at <anonymous> (/home/runner/work/wreckit/wreckit/src/**tests**/z-git.test.ts:176:22)
2026-01-21T18:28:27.5600276Z
2026-01-21T18:28:27.5601469Z ##[error]Expected: false
Received: true

      at <anonymous> (/home/runner/work/wreckit/wreckit/src/__tests__/z-git.test.ts:176:22)

2026-01-21T18:28:27.5602855Z (fail) git functions > isPrMerged > returns false when PR not found [12.00ms]
2026-01-21T18:28:27.6211891Z (pass) git functions > getPrByBranch > returns null when PR not found [62.00ms]
2026-01-21T18:28:27.6212398Z
2026-01-21T18:28:27.6212674Z ##[endgroup]
2026-01-21T18:28:27.6212781Z
2026-01-21T18:28:27.6213009Z ##[group]src/**tests**/indexing.test.ts:
2026-01-21T18:28:27.6232264Z (pass) parseItemId > parses valid ID
2026-01-21T18:28:27.6232807Z (pass) parseItemId > parses ID with multi-digit number
2026-01-21T18:28:27.6233486Z (pass) parseItemId > returns null for invalid ID without number prefix
2026-01-21T18:28:27.6234141Z (pass) formatItemId > formats components into ID
2026-01-21T18:28:27.6234604Z (pass) formatItemId > round-trips with parseItemId
2026-01-21T18:28:27.6235149Z (pass) toIndexItem > converts Item to IndexItem
2026-01-21T18:28:27.6236507Z (pass) buildIndex > builds empty index from empty array [1.00ms]
2026-01-21T18:28:27.6237105Z (pass) buildIndex > builds index with items
2026-01-21T18:28:27.6238002Z (pass) buildIndex > sets generated_at to current ISO timestamp
2026-01-21T18:28:27.6247625Z (pass) scanItems > returns empty array for empty .wreckit [1.00ms]
2026-01-21T18:28:27.6251333Z (pass) scanItems > returns empty array when .wreckit does not exist
2026-01-21T18:28:27.6263003Z (pass) scanItems > returns single item [1.00ms]
2026-01-21T18:28:27.6278763Z (pass) scanItems > returns multiple items sorted by number [2.00ms]
2026-01-21T18:28:27.6292959Z (pass) scanItems > skips invalid item.json files with warning [1.00ms]
2026-01-21T18:28:27.6303568Z (pass) scanItems > ignores directories without number prefix [1.00ms]
2026-01-21T18:28:27.6319495Z (pass) refreshIndex > creates index.json if it does not exist [2.00ms]
2026-01-21T18:28:27.6334463Z (pass) refreshIndex > updates existing index.json with current state [1.00ms]
2026-01-21T18:28:27.6343191Z (pass) refreshIndex > returns valid Index object [1.00ms]
2026-01-21T18:28:27.6362117Z (pass) getItem > returns Item for valid ID [2.00ms]
2026-01-21T18:28:27.6367858Z (pass) getItem > returns null for non-existent ID [1.00ms]
2026-01-21T18:28:27.6377149Z (pass) itemExists > returns true when item exists [1.00ms]
2026-01-21T18:28:27.6382706Z (pass) itemExists > returns false when item does not exist
2026-01-21T18:28:27.6383141Z
2026-01-21T18:28:27.6383549Z ##[endgroup]
2026-01-21T18:28:27.6383727Z
2026-01-21T18:28:27.6384126Z ##[group]src/**tests**/payload-validation.test.ts:
2026-01-21T18:28:27.6404323Z (pass) validatePayloadLimits > valid payloads > accepts empty array
2026-01-21T18:28:27.6405300Z (pass) validatePayloadLimits > valid payloads > accepts single idea within limits
2026-01-21T18:28:27.6406584Z (pass) validatePayloadLimits > valid payloads > accepts multiple ideas within all limits
2026-01-21T18:28:27.6408486Z (pass) validatePayloadLimits > valid payloads > accepts max ideas (50)
2026-01-21T18:28:27.6409484Z (pass) validatePayloadLimits > valid payloads > accepts title at max length (120 chars)
2026-01-21T18:28:27.6410640Z (pass) validatePayloadLimits > valid payloads > accepts description at max length (2000 chars)
2026-01-21T18:28:27.6411811Z (pass) validatePayloadLimits > valid payloads > accepts max success criteria items (20)
2026-01-21T18:28:27.6413887Z (pass) validatePayloadLimits > valid payloads > accepts ideas at total payload size limit (~100 KB)
2026-01-21T18:28:27.6415614Z (pass) validatePayloadLimits > idea count violations > rejects more than max ideas (50)
2026-01-21T18:28:27.6419142Z (pass) validatePayloadLimits > idea count violations > reports exact count in error message [1.00ms]
2026-01-21T18:28:27.6420417Z (pass) validatePayloadLimits > title length violations > rejects title exceeding 120 characters
2026-01-21T18:28:27.6421614Z (pass) validatePayloadLimits > title length violations > reports multiple title violations
2026-01-21T18:28:27.6422919Z (pass) validatePayloadLimits > description length violations > rejects description exceeding 2000 characters
2026-01-21T18:28:27.6424323Z (pass) validatePayloadLimits > description length violations > reports multiple description violations
2026-01-21T18:28:27.6425691Z (pass) validatePayloadLimits > success criteria violations > rejects success criteria exceeding 20 items
2026-01-21T18:28:27.6427245Z (pass) validatePayloadLimits > success criteria violations > reports multiple success criteria violations
2026-01-21T18:28:27.6432079Z (pass) validatePayloadLimits > total payload size violations > rejects payload exceeding 100 KB [1.00ms]
2026-01-21T18:28:27.6436492Z (pass) validatePayloadLimits > total payload size violations > includes size in KB and bytes in error message
2026-01-21T18:28:27.6437833Z (pass) validatePayloadLimits > multiple violations > reports all violations together [1.00ms]
2026-01-21T18:28:27.6439599Z (pass) validatePayloadLimits > multiple violations > reports violations across multiple ideas
2026-01-21T18:28:27.6440764Z (pass) validatePayloadLimits > edge cases > handles ideas with optional fields missing
2026-01-21T18:28:27.6441856Z (pass) validatePayloadLimits > edge cases > handles empty strings in optional fields
2026-01-21T18:28:27.6443429Z (pass) validatePayloadLimits > edge cases > handles ideas with all optional fields
2026-01-21T18:28:27.6444334Z (pass) assertPayloadLimits > does not throw for valid payloads
2026-01-21T18:28:27.6445442Z (pass) assertPayloadLimits > throws PayloadValidationError for invalid payloads
2026-01-21T18:28:27.6447429Z (pass) assertPayloadLimits > includes all violations in error message [1.00ms]
2026-01-21T18:28:27.6448426Z (pass) assertPayloadLimits > formats error message with bullet points
2026-01-21T18:28:27.6451142Z (pass) assertPayloadLimits > has correct error code
2026-01-21T18:28:27.6451565Z
2026-01-21T18:28:27.6451955Z ##[endgroup]
2026-01-21T18:28:27.6452132Z
2026-01-21T18:28:27.6452541Z ##[group]src/**tests**/prompts.test.ts:
2026-01-21T18:28:27.6474679Z (pass) loadPromptTemplate > returns custom template if exists in .wreckit/prompts/
2026-01-21T18:28:27.6479541Z (pass) loadPromptTemplate > returns default template if custom doesn't exist [1.00ms]
2026-01-21T18:28:27.6491435Z (pass) loadPromptTemplate > works for all template names [1.00ms]
2026-01-21T18:28:27.6492121Z (pass) renderPrompt > replaces single variable
2026-01-21T18:28:27.6492667Z (pass) renderPrompt > replaces multiple variables
2026-01-21T18:28:27.6493260Z (pass) renderPrompt > replaces same variable multiple times
2026-01-21T18:28:27.6494061Z (pass) renderPrompt > handles missing optional variables by replacing with empty string
2026-01-21T18:28:27.6494882Z (pass) renderPrompt > handles optional variables when provided
2026-01-21T18:28:27.6495529Z (pass) renderPrompt > handles special characters in values
2026-01-21T18:28:27.6496283Z (pass) renderPrompt > leaves unknown variables as-is
2026-01-21T18:28:27.6519174Z (pass) initPromptTemplates > creates prompts directory [3.00ms]
2026-01-21T18:28:27.6539851Z (pass) initPromptTemplates > creates all template files [2.00ms]
2026-01-21T18:28:27.6555656Z (pass) initPromptTemplates > doesn't overwrite existing templates [1.00ms]
2026-01-21T18:28:27.6559873Z (pass) getDefaultTemplate > returns correct template for each name [1.00ms]
2026-01-21T18:28:27.6560487Z
2026-01-21T18:28:27.6560876Z ##[endgroup]
2026-01-21T18:28:27.6561072Z
2026-01-21T18:28:27.6561469Z ##[group]src/**tests**/logging.test.ts:
2026-01-21T18:28:27.7034169Z (pass) Logger > Logger interface > implements all required methods
2026-01-21T18:28:27.7041002Z (pass) Logger > Logger interface > can be called without throwing [1.00ms]
2026-01-21T18:28:27.7044951Z (pass) Logger > Logger interface > accepts additional arguments
2026-01-21T18:28:27.7049053Z (pass) Logger > json output > outputs valid JSON [1.00ms]
2026-01-21T18:28:27.7054828Z (pass) Logger > initLogger > creates and sets a global logger
2026-01-21T18:28:27.7055571Z (pass) Logger > setLogger > allows setting a custom logger
2026-01-21T18:28:27.7059462Z (pass) Logger > createLogger options > creates logger with default options [1.00ms]
2026-01-21T18:28:27.7062883Z (pass) Logger > createLogger options > creates logger with verbose option
2026-01-21T18:28:27.7066026Z (pass) Logger > createLogger options > creates logger with quiet option
2026-01-21T18:28:27.7069686Z (pass) Logger > createLogger options > creates logger with noColor option [1.00ms]
2026-01-21T18:28:27.7071512Z (pass) Logger > createLogger options > creates logger with debug option for JSON output
2026-01-21T18:28:27.7072950Z (pass) Logger > createLogger options > creates logger with multiple options
2026-01-21T18:28:27.7073758Z (pass) Error exit codes > toExitCode(null) returns 0
2026-01-21T18:28:27.7074400Z (pass) Error exit codes > toExitCode(undefined) returns 0
2026-01-21T18:28:27.7075110Z (pass) Error exit codes > toExitCode(new WreckitError()) returns 1
2026-01-21T18:28:27.7076136Z (pass) Error exit codes > toExitCode(new ConfigError()) returns 1
2026-01-21T18:28:27.7076951Z (pass) Error exit codes > toExitCode(new InterruptedError()) returns 130
2026-01-21T18:28:27.7077786Z (pass) Error exit codes > toExitCode(new Error("SIGINT")) returns 130
2026-01-21T18:28:27.7078946Z (pass) Error exit codes > toExitCode(new Error("interrupted")) returns 130
2026-01-21T18:28:27.7079981Z (pass) Error exit codes > toExitCode(new Error("random")) returns 1
2026-01-21T18:28:27.7080732Z (pass) Error exit codes > toExitCode with non-error returns 1
2026-01-21T18:28:27.7081346Z (pass) wrapError > wraps Error with context
2026-01-21T18:28:27.7081989Z (pass) wrapError > wraps WreckitError with context preserving code
2026-01-21T18:28:27.7082652Z (pass) wrapError > wraps string with context
2026-01-21T18:28:27.7083220Z (pass) isWreckitError > returns true for WreckitError
2026-01-21T18:28:27.7083886Z (pass) isWreckitError > returns true for WreckitError subclasses
2026-01-21T18:28:27.7084589Z (pass) isWreckitError > returns false for regular Error
2026-01-21T18:28:27.7085217Z (pass) isWreckitError > returns false for non-errors
2026-01-21T18:28:27.7085601Z
2026-01-21T18:28:27.7086241Z ##[endgroup]
2026-01-21T18:28:27.7086412Z
2026-01-21T18:28:27.7086817Z ##[group]src/**tests**/onboarding.test.ts:
2026-01-21T18:28:27.7173540Z (pass) runOnboardingIfNeeded > when not in a git repo > returns not-git-repo in non-interactive mode [1.00ms]
2026-01-21T18:28:27.7187491Z (pass) runOnboardingIfNeeded > when in a git repo without .wreckit > returns noninteractive when not interactive [2.00ms]
2026-01-21T18:28:27.7191909Z (pass) runOnboardingIfNeeded > when in a git repo without .wreckit > returns noninteractive when noTui is true
2026-01-21T18:28:27.7200579Z (pass) runOnboardingIfNeeded > when in a git repo with .wreckit but no ideas > returns noninteractive when not interactive [1.00ms]
2026-01-21T18:28:27.7212892Z (pass) runOnboardingIfNeeded > when in a git repo with .wreckit and ideas > proceeds without prompts [1.00ms]
2026-01-21T18:28:27.7223978Z (pass) runOnboardingIfNeeded > when in a git repo with .wreckit and ideas > proceeds in interactive mode too [1.00ms]
2026-01-21T18:28:27.7224839Z
2026-01-21T18:28:27.7225230Z ##[endgroup]
2026-01-21T18:28:27.7225417Z
2026-01-21T18:28:27.7226094Z ##[group]src/**tests**/ideas.test.ts:
2026-01-21T18:28:27.7244499Z (pass) parseIdeasFromText > single line becomes single idea
2026-01-21T18:28:27.7245312Z (pass) parseIdeasFromText > multiple lines become multiple ideas
2026-01-21T18:28:27.7246265Z (pass) parseIdeasFromText > markdown headers become titles
2026-01-21T18:28:27.7247049Z (pass) parseIdeasFromText > bullet points become separate items
2026-01-21T18:28:27.7247844Z (pass) parseIdeasFromText > empty lines separate items [1.00ms]
2026-01-21T18:28:27.7248690Z (pass) parseIdeasFromText > consecutive lines become title + description
2026-01-21T18:28:27.7249445Z (pass) parseIdeasFromText > handles mixed input
2026-01-21T18:28:27.7250092Z (pass) generateSlug > 'Add Dark Mode' -> 'add-dark-mode'
2026-01-21T18:28:27.7250736Z (pass) generateSlug > 'Fix bug #123' -> 'fix-bug-123'
2026-01-21T18:28:27.7251340Z (pass) generateSlug > long title is truncated
2026-01-21T18:28:27.7251694Z (pass) generateSlug > special characters removed
2026-01-21T18:28:27.7252271Z (pass) generateSlug > multiple spaces become single hyphen
2026-01-21T18:28:27.7273032Z (pass) generateSlug > trims leading/trailing hyphens
2026-01-21T18:28:27.7273769Z (pass) allocateItemId > empty items folder returns 001 [1.00ms]
2026-01-21T18:28:27.7274399Z (pass) allocateItemId > existing 001 returns 002
2026-01-21T18:28:27.7274750Z (pass) allocateItemId > existing 001, 002 returns 003 [1.00ms]
2026-01-21T18:28:27.7280455Z (pass) allocateItemId > handles gaps (001, 003 -> 004) [1.00ms]
2026-01-21T18:28:27.7284337Z (pass) allocateItemId > returns correct dir path
2026-01-21T18:28:27.7286737Z (pass) createItemFromIdea > creates valid Item with correct fields [1.00ms]
2026-01-21T18:28:27.7287441Z (pass) createItemFromIdea > state is 'idea'
2026-01-21T18:28:27.7287936Z (pass) createItemFromIdea > timestamps are set
2026-01-21T18:28:27.7288485Z (pass) createItemFromIdea > nullable fields are null
2026-01-21T18:28:27.7289441Z (pass) createItemFromIdea > builds rich overview from structured fields
2026-01-21T18:28:27.7303259Z (pass) persistItems > creates directories and item.json [1.00ms]
2026-01-21T18:28:27.7309513Z (pass) persistItems > skips existing items [1.00ms]
2026-01-21T18:28:27.7321935Z (pass) persistItems > returns created and skipped lists [1.00ms]
2026-01-21T18:28:27.7346261Z (pass) persistItems > creates items in items folder [2.00ms]
2026-01-21T18:28:27.7371017Z (pass) ingestIdeas integration > full flow from text to persisted items [3.00ms]
2026-01-21T18:28:27.7380524Z (pass) ingestIdeas integration > idempotent (re-running doesn't duplicate) [1.00ms]
2026-01-21T18:28:27.7384355Z (pass) ingestIdeas integration > handles empty input
2026-01-21T18:28:27.7388387Z (pass) ingestIdeas integration > handles whitespace-only input [1.00ms]
2026-01-21T18:28:27.7388899Z
2026-01-21T18:28:27.7389167Z ##[endgroup]
2026-01-21T18:28:27.7389284Z
2026-01-21T18:28:27.7389533Z ##[group]src/**tests**/remote-validation.test.ts:
2026-01-21T18:28:27.7532657Z 46 | });
2026-01-21T18:28:27.7532958Z 47 |
2026-01-21T18:28:27.7533262Z 48 | describe("getRemoteUrl", () => {
2026-01-21T18:28:27.7533782Z 49 | it("returns null when no remote is configured", async () => {
2026-01-21T18:28:27.7534200Z 50 | const url = await getRemoteUrl("origin", gitOptions);
2026-01-21T18:28:27.7534526Z 51 | expect(url).toBeNull();
2026-01-21T18:28:27.7534749Z ^
2026-01-21T18:28:27.7534966Z error: expect(received).toBeNull()
2026-01-21T18:28:27.7535125Z
2026-01-21T18:28:27.7535206Z Received: "abc123def456"
2026-01-21T18:28:27.7535333Z
2026-01-21T18:28:27.7535628Z at <anonymous> (/home/runner/work/wreckit/wreckit/src/**tests**/remote-validation.test.ts:51:19)
2026-01-21T18:28:27.7536353Z
2026-01-21T18:28:27.7537762Z ##[error]Received: "abc123def456"

      at <anonymous> (/home/runner/work/wreckit/wreckit/src/__tests__/remote-validation.test.ts:51:19)

2026-01-21T18:28:27.7543453Z (fail) remote validation (Gap 6: No Remote Validation) > getRemoteUrl > returns null when no remote is configured [14.00ms]
2026-01-21T18:28:27.7683507Z 52 | });
2026-01-21T18:28:27.7683820Z 53 |
2026-01-21T18:28:27.7684282Z 54 | it("returns null when remote does not exist", async () => {
2026-01-21T18:28:27.7685273Z 55 | await Bun.$`cd ${tempDir} && git remote add origin https://github.com/example/repo.git`.quiet();
2026-01-21T18:28:27.7686403Z 56 | const url = await getRemoteUrl("upstream", gitOptions);
2026-01-21T18:28:27.7686984Z 57 | expect(url).toBeNull();
2026-01-21T18:28:27.7687376Z ^
2026-01-21T18:28:27.7687752Z error: expect(received).toBeNull()
2026-01-21T18:28:27.7688036Z
2026-01-21T18:28:27.7688172Z Received: "abc123def456"
2026-01-21T18:28:27.7688416Z
2026-01-21T18:28:27.7688923Z at <anonymous> (/home/runner/work/wreckit/wreckit/src/**tests**/remote-validation.test.ts:57:19)
2026-01-21T18:28:27.7689619Z
2026-01-21T18:28:27.7691876Z ##[error]Received: "abc123def456"

      at <anonymous> (/home/runner/work/wreckit/wreckit/src/__tests__/remote-validation.test.ts:57:19)

2026-01-21T18:28:27.7696552Z (fail) remote validation (Gap 6: No Remote Validation) > getRemoteUrl > returns null when remote does not exist [15.00ms]
2026-01-21T18:28:27.7834028Z 59 |
2026-01-21T18:28:27.7834386Z 60 | it("returns HTTPS remote URL", async () => {
2026-01-21T18:28:27.7834801Z 61 | const expectedUrl = "https://github.com/example/repo.git";
2026-01-21T18:28:27.7835267Z 62 | await Bun.$`cd ${tempDir} && git remote add origin ${expectedUrl}`.quiet();
2026-01-21T18:28:27.7835694Z 63 | const url = await getRemoteUrl("origin", gitOptions);
2026-01-21T18:28:27.7836245Z 64 | expect(url).toBe(expectedUrl);
2026-01-21T18:28:27.7836498Z ^
2026-01-21T18:28:27.7836713Z error: expect(received).toBe(expected)
2026-01-21T18:28:27.7836888Z
2026-01-21T18:28:27.7837015Z Expected: "https://github.com/example/repo.git"
2026-01-21T18:28:27.7837295Z Received: "abc123def456"
2026-01-21T18:28:27.7837435Z
2026-01-21T18:28:27.7837937Z at <anonymous> (/home/runner/work/wreckit/wreckit/src/**tests**/remote-validation.test.ts:64:19)
2026-01-21T18:28:27.7838433Z
2026-01-21T18:28:27.7839966Z ##[error]Expected: "https://github.com/example/repo.git"
Received: "abc123def456"

      at <anonymous> (/home/runner/work/wreckit/wreckit/src/__tests__/remote-validation.test.ts:64:19)

2026-01-21T18:28:27.7844218Z (fail) remote validation (Gap 6: No Remote Validation) > getRemoteUrl > returns HTTPS remote URL [15.00ms]
2026-01-21T18:28:27.7984600Z 66 |
2026-01-21T18:28:27.7984995Z 67 | it("returns SSH remote URL", async () => {
2026-01-21T18:28:27.7985606Z 68 | const expectedUrl = "git@github.com:example/repo.git";
2026-01-21T18:28:27.7986291Z 69 | await Bun.$`cd ${tempDir} && git remote add origin ${expectedUrl}`.quiet();
2026-01-21T18:28:27.7986754Z 70 | const url = await getRemoteUrl("origin", gitOptions);
2026-01-21T18:28:27.7987094Z 71 | expect(url).toBe(expectedUrl);
2026-01-21T18:28:27.7987348Z ^
2026-01-21T18:28:27.7987575Z error: expect(received).toBe(expected)
2026-01-21T18:28:27.7987747Z
2026-01-21T18:28:27.7987860Z Expected: "git@github.com:example/repo.git"
2026-01-21T18:28:27.7988116Z Received: "abc123def456"
2026-01-21T18:28:27.7988255Z
2026-01-21T18:28:27.7988545Z at <anonymous> (/home/runner/work/wreckit/wreckit/src/**tests**/remote-validation.test.ts:71:19)
2026-01-21T18:28:27.7988931Z
2026-01-21T18:28:27.7991704Z ##[error]Expected: "git@github.com:example/repo.git"
Received: "abc123def456"

      at <anonymous> (/home/runner/work/wreckit/wreckit/src/__tests__/remote-validation.test.ts:71:19)

2026-01-21T18:28:27.7998116Z (fail) remote validation (Gap 6: No Remote Validation) > getRemoteUrl > returns SSH remote URL [16.00ms]
2026-01-21T18:28:27.8137662Z 73 |
2026-01-21T18:28:27.8139138Z 74 | it("returns Git protocol URL", async () => {
2026-01-21T18:28:27.8140144Z 75 | const expectedUrl = "git://github.com/example/repo.git";
2026-01-21T18:28:27.8141287Z 76 | await Bun.$`cd ${tempDir} && git remote add origin ${expectedUrl}`.quiet();
2026-01-21T18:28:27.8142542Z 77 | const url = await getRemoteUrl("origin", gitOptions);
2026-01-21T18:28:27.8143382Z 78 | expect(url).toBe(expectedUrl);
2026-01-21T18:28:27.8145256Z ^
2026-01-21T18:28:27.8145681Z error: expect(received).toBe(expected)
2026-01-21T18:28:27.8146242Z
2026-01-21T18:28:27.8146477Z Expected: "git://github.com/example/repo.git"
2026-01-21T18:28:27.8146987Z Received: "abc123def456"
2026-01-21T18:28:27.8147226Z
2026-01-21T18:28:27.8147756Z at <anonymous> (/home/runner/work/wreckit/wreckit/src/**tests**/remote-validation.test.ts:78:19)
2026-01-21T18:28:27.8148456Z
2026-01-21T18:28:27.8157684Z ##[error]Expected: "git://github.com/example/repo.git"
Received: "abc123def456"

      at <anonymous> (/home/runner/work/wreckit/wreckit/src/__tests__/remote-validation.test.ts:78:19)

2026-01-21T18:28:27.8160356Z (fail) remote validation (Gap 6: No Remote Validation) > getRemoteUrl > returns Git protocol URL [15.00ms]
2026-01-21T18:28:27.8289808Z 80 |
2026-01-21T18:28:27.8291396Z 81 | it("handles URLs with .git suffix", async () => {
2026-01-21T18:28:27.8292138Z 82 | const expectedUrl = "https://github.com/example/repo.git";
2026-01-21T18:28:27.8292718Z 83 | await Bun.$`cd ${tempDir} && git remote add origin ${expectedUrl}`.quiet();
2026-01-21T18:28:27.8293187Z 84 | const url = await getRemoteUrl("origin", gitOptions);
2026-01-21T18:28:27.8293524Z 85 | expect(url).toBe(expectedUrl);
2026-01-21T18:28:27.8293782Z ^
2026-01-21T18:28:27.8294003Z error: expect(received).toBe(expected)
2026-01-21T18:28:27.8294182Z
2026-01-21T18:28:27.8294319Z Expected: "https://github.com/example/repo.git"
2026-01-21T18:28:27.8294617Z Received: "abc123def456"
2026-01-21T18:28:27.8294761Z
2026-01-21T18:28:27.8295062Z at <anonymous> (/home/runner/work/wreckit/wreckit/src/**tests**/remote-validation.test.ts:85:19)
2026-01-21T18:28:27.8295455Z
2026-01-21T18:28:27.8298764Z ##[error]Expected: "https://github.com/example/repo.git"
Received: "abc123def456"

      at <anonymous> (/home/runner/work/wreckit/wreckit/src/__tests__/remote-validation.test.ts:85:19)

2026-01-21T18:28:27.8306680Z (fail) remote validation (Gap 6: No Remote Validation) > getRemoteUrl > handles URLs with .git suffix [15.00ms]
2026-01-21T18:28:27.8443552Z 87 |
2026-01-21T18:28:27.8444006Z 88 | it("handles URLs without .git suffix", async () => {
2026-01-21T18:28:27.8444703Z 89 | const expectedUrl = "https://github.com/example/repo";
2026-01-21T18:28:27.8445489Z 90 | await Bun.$`cd ${tempDir} && git remote add origin ${expectedUrl}`.quiet();
2026-01-21T18:28:27.8446499Z 91 | const url = await getRemoteUrl("origin", gitOptions);
2026-01-21T18:28:27.8447089Z 92 | expect(url).toBe(expectedUrl);
2026-01-21T18:28:27.8447525Z ^
2026-01-21T18:28:27.8447897Z error: expect(received).toBe(expected)
2026-01-21T18:28:27.8448204Z
2026-01-21T18:28:27.8448412Z Expected: "https://github.com/example/repo"
2026-01-21T18:28:27.8448879Z Received: "abc123def456"
2026-01-21T18:28:27.8449127Z
2026-01-21T18:28:27.8449625Z at <anonymous> (/home/runner/work/wreckit/wreckit/src/**tests**/remote-validation.test.ts:92:19)
2026-01-21T18:28:27.8450309Z
2026-01-21T18:28:27.8452950Z ##[error]Expected: "https://github.com/example/repo"
Received: "abc123def456"

      at <anonymous> (/home/runner/work/wreckit/wreckit/src/__tests__/remote-validation.test.ts:92:19)

2026-01-21T18:28:27.8456775Z (fail) remote validation (Gap 6: No Remote Validation) > getRemoteUrl > handles URLs without .git suffix [15.00ms]
2026-01-21T18:28:27.8612613Z 97 | const pushUrl = "https://github.com/example/push.git";
2026-01-21T18:28:27.8613400Z 98 | await Bun.$`cd ${tempDir} && git remote add origin ${fetchUrl}`.quiet();
2026-01-21T18:28:27.8614267Z  99 |       await Bun.$`cd ${tempDir} && git remote set-url --push origin ${pushUrl}`.quiet();
2026-01-21T18:28:27.8615056Z 100 | const url = await getRemoteUrl("origin", gitOptions);
2026-01-21T18:28:27.8615697Z 101 | // Should return push URL for validation purposes
2026-01-21T18:28:27.8616304Z 102 | expect(url).toBe(pushUrl);
2026-01-21T18:28:27.8616552Z ^
2026-01-21T18:28:27.8616768Z error: expect(received).toBe(expected)
2026-01-21T18:28:27.8616957Z
2026-01-21T18:28:27.8617094Z Expected: "https://github.com/example/push.git"
2026-01-21T18:28:27.8617386Z Received: "abc123def456"
2026-01-21T18:28:27.8617535Z
2026-01-21T18:28:27.8618044Z at <anonymous> (/home/runner/work/wreckit/wreckit/src/**tests**/remote-validation.test.ts:102:19)
2026-01-21T18:28:27.8618746Z
2026-01-21T18:28:27.8621418Z ##[error]Expected: "https://github.com/example/push.git"
Received: "abc123def456"

      at <anonymous> (/home/runner/work/wreckit/wreckit/src/__tests__/remote-validation.test.ts:102:19)

2026-01-21T18:28:27.8628870Z (fail) remote validation (Gap 6: No Remote Validation) > getRemoteUrl > returns push URL if different from fetch URL [18.00ms]
2026-01-21T18:28:27.8764387Z 109 |
2026-01-21T18:28:27.8764943Z 110 | const result = await validateRemoteUrl("origin", [], gitOptions);
2026-01-21T18:28:27.8765585Z 111 |
2026-01-21T18:28:27.8766110Z 112 | expect(result.valid).toBe(true);
2026-01-21T18:28:27.8766636Z 113 | expect(result.errors).toEqual([]);
2026-01-21T18:28:27.8767354Z 114 | expect(result.actualUrl).toBe("https://github.com/example/repo.git");
2026-01-21T18:28:27.8768059Z ^
2026-01-21T18:28:27.8768506Z error: expect(received).toBe(expected)
2026-01-21T18:28:27.8768829Z
2026-01-21T18:28:27.8769042Z Expected: "https://github.com/example/repo.git"
2026-01-21T18:28:27.8769591Z Received: "https://github.com/example/repo"
2026-01-21T18:28:27.8769948Z
2026-01-21T18:28:27.8770468Z at <anonymous> (/home/runner/work/wreckit/wreckit/src/**tests**/remote-validation.test.ts:114:32)
2026-01-21T18:28:27.8771175Z
2026-01-21T18:28:27.8774274Z ##[error]Expected: "https://github.com/example/repo.git"
Received: "https://github.com/example/repo"

      at <anonymous> (/home/runner/work/wreckit/wreckit/src/__tests__/remote-validation.test.ts:114:32)

2026-01-21T18:28:27.8777675Z (fail) remote validation (Gap 6: No Remote Validation) > validateRemoteUrl > passes when no patterns are configured [15.00ms]
2026-01-21T18:28:27.8919262Z 119 |
2026-01-21T18:28:27.8919913Z 120 | const result = await validateRemoteUrl("origin", ["github.com/myorg/"], gitOptions);
2026-01-21T18:28:27.8920646Z 121 |
2026-01-21T18:28:27.8920971Z 122 | expect(result.valid).toBe(true);
2026-01-21T18:28:27.8921458Z 123 | expect(result.errors).toEqual([]);
2026-01-21T18:28:27.8922129Z 124 | expect(result.actualUrl).toBe("https://github.com/myorg/myrepo.git");
2026-01-21T18:28:27.8922628Z ^
2026-01-21T18:28:27.8922881Z error: expect(received).toBe(expected)
2026-01-21T18:28:27.8923063Z
2026-01-21T18:28:27.8923191Z Expected: "https://github.com/myorg/myrepo.git"
2026-01-21T18:28:27.8923520Z Received: "https://github.com/example/repo"
2026-01-21T18:28:27.8923730Z
2026-01-21T18:28:27.8924024Z at <anonymous> (/home/runner/work/wreckit/wreckit/src/**tests**/remote-validation.test.ts:124:32)
2026-01-21T18:28:27.8924411Z
2026-01-21T18:28:27.8926827Z ##[error]Expected: "https://github.com/myorg/myrepo.git"
Received: "https://github.com/example/repo"

      at <anonymous> (/home/runner/work/wreckit/wreckit/src/__tests__/remote-validation.test.ts:124:32)

2026-01-21T18:28:27.8929432Z (fail) remote validation (Gap 6: No Remote Validation) > validateRemoteUrl > passes when URL matches allowed pattern [15.00ms]
2026-01-21T18:28:27.9079823Z (pass) remote validation (Gap 6: No Remote Validation) > validateRemoteUrl > passes when URL matches multiple allowed patterns [15.00ms]
2026-01-21T18:28:27.9226151Z (pass) remote validation (Gap 6: No Remote Validation) > validateRemoteUrl > passes when SSH URL matches pattern [14.00ms]
2026-01-21T18:28:27.9370557Z (pass) remote validation (Gap 6: No Remote Validation) > validateRemoteUrl > passes when HTTPS URL matches pattern [15.00ms]
2026-01-21T18:28:27.9510638Z 158 | it("fails when URL does not match any allowed pattern", async () => {
2026-01-21T18:28:27.9511644Z 159 | await Bun.$`cd ${tempDir} && git remote add origin https://github.com/otherorg/repo.git`.quiet();
2026-01-21T18:28:27.9512161Z 160 |
2026-01-21T18:28:27.9512514Z 161 | const result = await validateRemoteUrl("origin", ["github.com/myorg/"], gitOptions);
2026-01-21T18:28:27.9512941Z 162 |
2026-01-21T18:28:27.9513130Z 163 | expect(result.valid).toBe(false);
2026-01-21T18:28:27.9513394Z ^
2026-01-21T18:28:27.9513629Z error: expect(received).toBe(expected)
2026-01-21T18:28:27.9513807Z
2026-01-21T18:28:27.9513880Z Expected: false
2026-01-21T18:28:27.9514062Z Received: true
2026-01-21T18:28:27.9514165Z
2026-01-21T18:28:27.9514459Z at <anonymous> (/home/runner/work/wreckit/wreckit/src/**tests**/remote-validation.test.ts:163:28)
2026-01-21T18:28:27.9514856Z
2026-01-21T18:28:27.9516342Z ##[error]Expected: false
Received: true

      at <anonymous> (/home/runner/work/wreckit/wreckit/src/__tests__/remote-validation.test.ts:163:28)

2026-01-21T18:28:27.9520754Z (fail) remote validation (Gap 6: No Remote Validation) > validateRemoteUrl > fails when URL does not match any allowed pattern [15.00ms]
2026-01-21T18:28:27.9664210Z 169 | it("fails when remote points to different organization", async () => {
2026-01-21T18:28:27.9665196Z 170 | await Bun.$`cd ${tempDir} && git remote add origin https://github.com/evilorg/repo.git`.quiet();
2026-01-21T18:28:27.9665671Z 171 |
2026-01-21T18:28:27.9666240Z 172 | const result = await validateRemoteUrl("origin", ["github.com/myorg/"], gitOptions);
2026-01-21T18:28:27.9666672Z 173 |
2026-01-21T18:28:27.9666878Z 174 | expect(result.valid).toBe(false);
2026-01-21T18:28:27.9667139Z ^
2026-01-21T18:28:27.9667609Z error: expect(received).toBe(expected)
2026-01-21T18:28:27.9667790Z
2026-01-21T18:28:27.9667982Z Expected: false
2026-01-21T18:28:27.9668168Z Received: true
2026-01-21T18:28:27.9668272Z
2026-01-21T18:28:27.9668573Z at <anonymous> (/home/runner/work/wreckit/wreckit/src/**tests**/remote-validation.test.ts:174:28)
2026-01-21T18:28:27.9668962Z
2026-01-21T18:28:27.9670458Z ##[error]Expected: false
Received: true

      at <anonymous> (/home/runner/work/wreckit/wreckit/src/__tests__/remote-validation.test.ts:174:28)

2026-01-21T18:28:27.9676793Z (fail) remote validation (Gap 6: No Remote Validation) > validateRemoteUrl > fails when remote points to different organization [15.00ms]
2026-01-21T18:28:27.9812407Z 178 | it("fails when remote points to different host", async () => {
2026-01-21T18:28:27.9813407Z 179 | await Bun.$`cd ${tempDir} && git remote add origin https://gitlab.com/myorg/repo.git`.quiet();
2026-01-21T18:28:27.9814185Z 180 |
2026-01-21T18:28:27.9814821Z 181 | const result = await validateRemoteUrl("origin", ["github.com/myorg/"], gitOptions);
2026-01-21T18:28:27.9815592Z 182 |
2026-01-21T18:28:27.9816126Z 183 | expect(result.valid).toBe(false);
2026-01-21T18:28:27.9816583Z ^
2026-01-21T18:28:27.9817002Z error: expect(received).toBe(expected)
2026-01-21T18:28:27.9817311Z
2026-01-21T18:28:27.9817439Z Expected: false
2026-01-21T18:28:27.9817759Z Received: true
2026-01-21T18:28:27.9817944Z
2026-01-21T18:28:27.9818474Z at <anonymous> (/home/runner/work/wreckit/wreckit/src/**tests**/remote-validation.test.ts:183:28)
2026-01-21T18:28:27.9819177Z
2026-01-21T18:28:27.9821225Z ##[error]Expected: false
Received: true

      at <anonymous> (/home/runner/work/wreckit/wreckit/src/__tests__/remote-validation.test.ts:183:28)

2026-01-21T18:28:27.9825281Z (fail) remote validation (Gap 6: No Remote Validation) > validateRemoteUrl > fails when remote points to different host [15.00ms]
2026-01-21T18:28:27.9979855Z (pass) remote validation (Gap 6: No Remote Validation) > validateRemoteUrl > handles wildcard patterns [16.00ms]
2026-01-21T18:28:28.0124666Z (pass) remote validation (Gap 6: No Remote Validation) > validateRemoteUrl > passes with exact repository match [14.00ms]
2026-01-21T18:28:28.0273685Z 205 | it("fails when exact repository match differs", async () => {
2026-01-21T18:28:28.0274750Z 206 | await Bun.$`cd ${tempDir} && git remote add origin https://github.com/myorg/wrong-repo.git`.quiet();
2026-01-21T18:28:28.0275574Z 207 |
2026-01-21T18:28:28.0276483Z 208 | const result = await validateRemoteUrl("origin", ["github.com/myorg/specific-repo"], gitOptions);
2026-01-21T18:28:28.0277327Z 209 |
2026-01-21T18:28:28.0277661Z 210 | expect(result.valid).toBe(false);
2026-01-21T18:28:28.0278160Z ^
2026-01-21T18:28:28.0278592Z error: expect(received).toBe(expected)
2026-01-21T18:28:28.0278905Z
2026-01-21T18:28:28.0279032Z Expected: false
2026-01-21T18:28:28.0279356Z Received: true
2026-01-21T18:28:28.0279562Z
2026-01-21T18:28:28.0280102Z at <anonymous> (/home/runner/work/wreckit/wreckit/src/**tests**/remote-validation.test.ts:210:28)
2026-01-21T18:28:28.0280831Z
2026-01-21T18:28:28.0283422Z ##[error]Expected: false
Received: true

      at <anonymous> (/home/runner/work/wreckit/wreckit/src/__tests__/remote-validation.test.ts:210:28)

2026-01-21T18:28:28.0287039Z (fail) remote validation (Gap 6: No Remote Validation) > validateRemoteUrl > fails when exact repository match differs [16.00ms]
2026-01-21T18:28:28.0434703Z (pass) remote validation (Gap 6: No Remote Validation) > validateRemoteUrl > passes when URL ends with .git and pattern does not [15.00ms]
2026-01-21T18:28:28.0581262Z (pass) remote validation (Gap 6: No Remote Validation) > validateRemoteUrl > passes when URL lacks .git and pattern has it [15.00ms]
2026-01-21T18:28:28.0720413Z 232 | it("returns actual URL even when validation fails", async () => {
2026-01-21T18:28:28.0721369Z 233 | await Bun.$`cd ${tempDir} && git remote add origin https://github.com/wrongorg/repo.git`.quiet();
2026-01-21T18:28:28.0722045Z 234 |
2026-01-21T18:28:28.0722535Z 235 | const result = await validateRemoteUrl("origin", ["github.com/correctorg/"], gitOptions);
2026-01-21T18:28:28.0722968Z 236 |
2026-01-21T18:28:28.0723159Z 237 | expect(result.valid).toBe(false);
2026-01-21T18:28:28.0723423Z ^
2026-01-21T18:28:28.0723656Z error: expect(received).toBe(expected)
2026-01-21T18:28:28.0723827Z
2026-01-21T18:28:28.0723905Z Expected: false
2026-01-21T18:28:28.0724074Z Received: true
2026-01-21T18:28:28.0724179Z
2026-01-21T18:28:28.0724471Z at <anonymous> (/home/runner/work/wreckit/wreckit/src/**tests**/remote-validation.test.ts:237:28)
2026-01-21T18:28:28.0724865Z
2026-01-21T18:28:28.0726479Z ##[error]Expected: false
Received: true

      at <anonymous> (/home/runner/work/wreckit/wreckit/src/__tests__/remote-validation.test.ts:237:28)

2026-01-21T18:28:28.0730603Z (fail) remote validation (Gap 6: No Remote Validation) > validateRemoteUrl > returns actual URL even when validation fails [15.00ms]
2026-01-21T18:28:28.0880576Z (pass) remote validation (Gap 6: No Remote Validation) > validateRemoteUrl > handles patterns with special characters [15.00ms]
2026-01-21T18:28:28.0997716Z 249 |
2026-01-21T18:28:28.0998344Z 250 | it("returns valid result with null actual URL when remote does not exist", async () => {
2026-01-21T18:28:28.0999126Z 251 | const result = await validateRemoteUrl("nonexistent", ["github.com/myorg/"], gitOptions);
2026-01-21T18:28:28.0999589Z 252 |
2026-01-21T18:28:28.0999788Z 253 | expect(result.valid).toBe(true);
2026-01-21T18:28:28.1000087Z 254 | expect(result.actualUrl).toBeNull();
2026-01-21T18:28:28.1000351Z ^
2026-01-21T18:28:28.1000594Z error: expect(received).toBeNull()
2026-01-21T18:28:28.1000756Z
2026-01-21T18:28:28.1000873Z Received: "https://github.com/example/repo"
2026-01-21T18:28:28.1001093Z
2026-01-21T18:28:28.1001411Z at <anonymous> (/home/runner/work/wreckit/wreckit/src/**tests**/remote-validation.test.ts:254:32)
2026-01-21T18:28:28.1001892Z
2026-01-21T18:28:28.1003547Z ##[error]Received: "https://github.com/example/repo"

      at <anonymous> (/home/runner/work/wreckit/wreckit/src/__tests__/remote-validation.test.ts:254:32)

2026-01-21T18:28:28.1008095Z (fail) remote validation (Gap 6: No Remote Validation) > validateRemoteUrl > returns valid result with null actual URL when remote does not exist [13.00ms]
2026-01-21T18:28:28.1008702Z
2026-01-21T18:28:28.1008955Z ##[endgroup]
2026-01-21T18:28:28.1009065Z
2026-01-21T18:28:28.1009339Z ##[group]src/**tests**/git-status-comparison.test.ts:
2026-01-21T18:28:28.1163443Z (pass) git status comparison (Gap 1: Read-Only Enforcement) > parseGitStatusPorcelain > parses empty status [13.00ms]
2026-01-21T18:28:28.1290193Z (pass) git status comparison (Gap 1: Read-Only Enforcement) > parseGitStatusPorcelain > parses modified file [13.00ms]
2026-01-21T18:28:28.1427471Z (pass) git status comparison (Gap 1: Read-Only Enforcement) > parseGitStatusPorcelain > parses added file [14.00ms]
2026-01-21T18:28:28.1554577Z (pass) git status comparison (Gap 1: Read-Only Enforcement) > parseGitStatusPorcelain > parses deleted file [12.00ms]
2026-01-21T18:28:28.1685244Z (pass) git status comparison (Gap 1: Read-Only Enforcement) > parseGitStatusPorcelain > parses untracked file [13.00ms]
2026-01-21T18:28:28.1822281Z (pass) git status comparison (Gap 1: Read-Only Enforcement) > parseGitStatusPorcelain > parses multiple files [14.00ms]
2026-01-21T18:28:28.1955465Z (pass) git status comparison (Gap 1: Read-Only Enforcement) > parseGitStatusPorcelain > parses renamed file [13.00ms]
2026-01-21T18:28:28.2085431Z (pass) git status comparison (Gap 1: Read-Only Enforcement) > parseGitStatusPorcelain > handles staged and working tree status [13.00ms]
2026-01-21T18:28:28.2212558Z (pass) git status comparison (Gap 1: Read-Only Enforcement) > parseGitStatusPorcelain > handles spaces in status code [13.00ms]
2026-01-21T18:28:28.2363823Z (pass) git status comparison (Gap 1: Read-Only Enforcement) > compareGitStatus > passes when no changes occur [15.00ms]
2026-01-21T18:28:28.2518676Z (pass) git status comparison (Gap 1: Read-Only Enforcement) > compareGitStatus > passes when only allowed path changes [16.00ms]
2026-01-21T18:28:28.2675261Z (pass) git status comparison (Gap 1: Read-Only Enforcement) > compareGitStatus > fails when disallowed file is modified [15.00ms]
2026-01-21T18:28:28.2834666Z (pass) git status comparison (Gap 1: Read-Only Enforcement) > compareGitStatus > fails when disallowed file is added [16.00ms]
2026-01-21T18:28:28.3057212Z (pass) git status comparison (Gap 1: Read-Only Enforcement) > compareGitStatus > fails when disallowed file is deleted [22.00ms]
2026-01-21T18:28:28.3219552Z (pass) git status comparison (Gap 1: Read-Only Enforcement) > compareGitStatus > allows multiple allowed paths [17.00ms]
2026-01-21T18:28:28.3397071Z (pass) git status comparison (Gap 1: Read-Only Enforcement) > compareGitStatus > detects changes that were present before [17.00ms]
2026-01-21T18:28:28.3552790Z (pass) git status comparison (Gap 1: Read-Only Enforcement) > compareGitStatus > handles nested paths correctly [16.00ms]
2026-01-21T18:28:28.3711002Z (pass) git status comparison (Gap 1: Read-Only Enforcement) > compareGitStatus > fails when sibling directory changes but only specific subdirectory is allowed [16.00ms]
2026-01-21T18:28:28.3848061Z (pass) git status comparison (Gap 1: Read-Only Enforcement) > formatViolations > returns empty string for valid result [14.00ms]
2026-01-21T18:28:28.3977410Z (pass) git status comparison (Gap 1: Read-Only Enforcement) > formatViolations > formats single violation [12.00ms]
2026-01-21T18:28:28.4105218Z (pass) git status comparison (Gap 1: Read-Only Enforcement) > formatViolations > formats multiple violations [12.00ms]
2026-01-21T18:28:28.4231692Z (pass) git status comparison (Gap 1: Read-Only Enforcement) > formatViolations > includes status descriptions [13.00ms]
2026-01-21T18:28:28.4232201Z
2026-01-21T18:28:28.4232498Z ##[endgroup]
2026-01-21T18:28:28.4232606Z
2026-01-21T18:28:28.4232834Z ##[group]src/**tests**/cli.test.ts:
2026-01-21T18:28:28.4366177Z (pass) wreckit CLI > should import without error
2026-01-21T18:28:28.4366646Z (pass) wreckit CLI > should have correct version
2026-01-21T18:28:28.4367095Z (pass) wreckit CLI > should have correct description [1.00ms]
2026-01-21T18:28:28.4367464Z (pass) wreckit CLI > should have global options
2026-01-21T18:28:28.4393053Z (pass) wreckit CLI > --help includes usage information [2.00ms]
2026-01-21T18:28:28.4393549Z
2026-01-21T18:28:28.4394081Z ##[endgroup]
2026-01-21T18:28:28.4394262Z
2026-01-21T18:28:28.4394654Z ##[group]src/**tests**/ideas-agent.test.ts:
2026-01-21T18:28:28.4442144Z (pass) parseIdeasWithAgent - MCP Tool Requirement Enforcement > throws McpToolNotCalledError when mock agent does not call MCP tool [3.00ms]
2026-01-21T18:28:28.4458107Z (pass) parseIdeasWithAgent - MCP Tool Requirement Enforcement > provides clear error message explaining MCP tool requirement [2.00ms]
2026-01-21T18:28:28.4473102Z (pass) parseIdeasWithAgent - MCP Tool Requirement Enforcement > error message mentions security reason for removing fallback [1.00ms]
2026-01-21T18:28:28.4488697Z (pass) parseIdeasWithAgent - Security: No JSON Fallback > does not parse JSON from agent text output (Gap 1 mitigation) [2.00ms]
2026-01-21T18:28:28.4500474Z (pass) parseIdeasWithAgent - Security: No JSON Fallback > enforces structured extraction channel only [1.00ms]
2026-01-21T18:28:28.4516487Z (pass) parseIdeasWithAgent - Security: No JSON Fallback > fails with specific error code MCP_TOOL_NOT_CALLED [1.00ms]
2026-01-21T18:28:28.4517014Z
2026-01-21T18:28:28.4517258Z ##[endgroup]
2026-01-21T18:28:28.4517370Z
2026-01-21T18:28:28.4517616Z ##[group]src/**tests**/plan-quality.test.ts:
2026-01-21T18:28:28.4541089Z (pass) Plan Quality Validation (Gap 2) > validatePlanQuality > phase count validation > passes with at least one implementation phase
2026-01-21T18:28:28.4542820Z (pass) Plan Quality Validation (Gap 2) > validatePlanQuality > phase count validation > passes with multiple implementation phases
2026-01-21T18:28:28.4544127Z (pass) Plan Quality Validation (Gap 2) > validatePlanQuality > phase count validation > fails with no implementation phases
2026-01-21T18:28:28.4545477Z (pass) Plan Quality Validation (Gap 2) > validatePlanQuality > phase count validation > only counts ### headers within the Phases section
2026-01-21T18:28:28.4546867Z (pass) Plan Quality Validation (Gap 2) > validatePlanQuality > phase count validation > requires at least the minimum number of phases
2026-01-21T18:28:28.4548307Z (pass) Plan Quality Validation (Gap 2) > validatePlanQuality > required sections validation > passes with all required sections present
2026-01-21T18:28:28.4549410Z (pass) Plan Quality Validation (Gap 2) > validatePlanQuality > required sections validation > fails with missing required sections [1.00ms]
2026-01-21T18:28:28.4550837Z (pass) Plan Quality Validation (Gap 2) > validatePlanQuality > required sections validation > allows case-insensitive section matching
2026-01-21T18:28:28.4552013Z (pass) Plan Quality Validation (Gap 2) > validatePlanQuality > required sections validation > handles alternative section header styles
2026-01-21T18:28:28.4553189Z (pass) Plan Quality Validation (Gap 2) > validatePlanQuality > real-world examples > validates a minimal but acceptable plan
2026-01-21T18:28:28.4554428Z (pass) Plan Quality Validation (Gap 2) > validatePlanQuality > real-world examples > rejects a superficial plan without phases
2026-01-21T18:28:28.4555594Z (pass) Plan Quality Validation (Gap 2) > validatePlanQuality > real-world examples > rejects a plan missing key sections
2026-01-21T18:28:28.4556528Z (pass) Plan Quality Validation (Gap 2) > validatePlanQuality > edge cases > handles empty content gracefully
2026-01-21T18:28:28.4557476Z (pass) Plan Quality Validation (Gap 2) > validatePlanQuality > edge cases > handles content with no sections
2026-01-21T18:28:28.4558432Z (pass) Plan Quality Validation (Gap 2) > validatePlanQuality > edge cases > allows custom options
2026-01-21T18:28:28.4559215Z (pass) Plan Quality Validation (Gap 2) > validatePlanQuality > edge cases > handles phases section at the end without Testing Strategy
2026-01-21T18:28:28.4560014Z (pass) Plan Quality Validation (Gap 2) > validatePlanQuality > edge cases > handles malformed phase headers
2026-01-21T18:28:28.4560848Z (pass) Plan Quality Validation (Gap 2) > validatePlanQuality > section extraction behavior > handles What We're NOT Doing section correctly [1.00ms]
2026-01-21T18:28:28.4561789Z (pass) Plan Quality Validation (Gap 2) > validatePlanQuality > section extraction behavior > handles sections with special characters
2026-01-21T18:28:28.4562284Z
2026-01-21T18:28:28.4562518Z ##[endgroup]
2026-01-21T18:28:28.4562618Z
2026-01-21T18:28:28.4562875Z ##[group]src/**tests**/integration/idempotent.test.ts:
2026-01-21T18:28:28.4597029Z (pass) idempotent phase operations > already-researched item > reading researched item preserves state [2.00ms]
2026-01-21T18:28:28.4613988Z (pass) idempotent phase operations > already-planned item > reading planned item preserves state and artifacts [1.00ms]
2026-01-21T18:28:28.4624337Z (pass) idempotent phase operations > item state persistence > writing then reading item preserves all fields [1.00ms]
2026-01-21T18:28:28.4643307Z (pass) idempotent phase operations > item state persistence > multiple writes preserve consistency [2.00ms]
2026-01-21T18:28:28.4657900Z (pass) state artifact consistency > state requires artifacts > planned state requires plan.md and prd.json files [2.00ms]
2026-01-21T18:28:28.4668503Z (pass) state artifact consistency > state requires artifacts > researched state requires research.md [1.00ms]
2026-01-21T18:28:28.4669325Z
2026-01-21T18:28:28.4669719Z ##[endgroup]
2026-01-21T18:28:28.4669919Z
2026-01-21T18:28:28.4670358Z ##[group]src/**tests**/commands/rollback.test.ts:
2026-01-21T18:28:28.4704030Z (pass) rollbackCommand > returns error when no rollback_sha exists [2.00ms]
2026-01-21T18:28:28.4715669Z (pass) rollbackCommand > returns error when item is not in 'done' state without --force [1.00ms]
2026-01-21T18:28:28.4731618Z (pass) rollbackCommand > allows rollback with --force when item is not in 'done' state [2.00ms]
2026-01-21T18:28:28.4752862Z (pass) rollbackCommand > performs dry-run without making changes [2.00ms]
2026-01-21T18:28:28.4768509Z (pass) rollbackCommand > executes git commands during rollback [2.00ms]
2026-01-21T18:28:28.4783746Z (pass) rollbackCommand > updates item state after successful rollback [1.00ms]
2026-01-21T18:28:28.4794402Z (pass) rollbackCommand > returns error if checkout fails [1.00ms]
2026-01-21T18:28:28.4804677Z (pass) rollbackCommand > returns error if reset fails [1.00ms]
2026-01-21T18:28:28.4816644Z (pass) rollbackCommand > returns error if force push fails [1.00ms]
2026-01-21T18:28:28.4817174Z
2026-01-21T18:28:28.4817594Z ##[endgroup]
2026-01-21T18:28:28.4817790Z
2026-01-21T18:28:28.4818235Z ##[group]src/**tests**/commands/list.test.ts:
2026-01-21T18:28:28.4840558Z No items found
2026-01-21T18:28:28.4843184Z (pass) listCommand > shows 'No items found' for empty items dir [1.00ms]
2026-01-21T18:28:28.4859245Z # STATE TITLE
2026-01-21T18:28:28.4859638Z 1 idea auth
2026-01-21T18:28:28.4860006Z 2 researched api
2026-01-21T18:28:28.4860302Z 3 planned crash
2026-01-21T18:28:28.4860439Z
2026-01-21T18:28:28.4860508Z Total: 3 item(s)
2026-01-21T18:28:28.4863695Z (pass) listCommand > lists all items with state and title [2.00ms]
2026-01-21T18:28:28.4877587Z # STATE TITLE
2026-01-21T18:28:28.4877938Z 1 idea auth
2026-01-21T18:28:28.4878142Z
2026-01-21T18:28:28.4878421Z Total: 1 item(s)
2026-01-21T18:28:28.4882403Z (pass) listCommand > filters by state when --state option provided [2.00ms]
2026-01-21T18:28:28.4893220Z [
2026-01-21T18:28:28.4893491Z {
2026-01-21T18:28:28.4893735Z "id": 1,
2026-01-21T18:28:28.4894028Z "fullId": "001-auth",
2026-01-21T18:28:28.4894379Z "state": "idea",
2026-01-21T18:28:28.4894690Z "title": "auth"
2026-01-21T18:28:28.4894966Z },
2026-01-21T18:28:28.4895215Z {
2026-01-21T18:28:28.4895453Z "id": 2,
2026-01-21T18:28:28.4895888Z "fullId": "002-crash",
2026-01-21T18:28:28.4896233Z "state": "planned",
2026-01-21T18:28:28.4896564Z "title": "crash"
2026-01-21T18:28:28.4896861Z }
2026-01-21T18:28:28.4897122Z ]
2026-01-21T18:28:28.4904101Z (pass) listCommand > outputs JSON when --json option provided [2.00ms]
2026-01-21T18:28:28.4917223Z # STATE TITLE
2026-01-21T18:28:28.4917550Z 1 idea first
2026-01-21T18:28:28.4917836Z 2 idea second
2026-01-21T18:28:28.4918135Z 3 idea third
2026-01-21T18:28:28.4918326Z
2026-01-21T18:28:28.4918436Z Total: 3 item(s)
2026-01-21T18:28:28.4922240Z (pass) listCommand > lists items sorted by id with short numeric IDs [2.00ms]
2026-01-21T18:28:28.4922614Z
2026-01-21T18:28:28.4922855Z ##[endgroup]
2026-01-21T18:28:28.4922967Z
2026-01-21T18:28:28.4923225Z ##[group]src/**tests**/commands/status.test.ts:
2026-01-21T18:28:28.4943096Z (pass) scanItems > returns empty array for empty items dir
2026-01-21T18:28:28.4961538Z (pass) scanItems > returns items sorted by id [2.00ms]
2026-01-21T18:28:28.4969483Z (pass) scanItems > returns correct item properties [1.00ms]
2026-01-21T18:28:28.4978683Z (pass) scanItems > skips directories not matching item pattern [1.00ms]
2026-01-21T18:28:28.4985484Z No items found
2026-01-21T18:28:28.4988661Z (pass) statusCommand > shows 'No items found' for empty items dir [1.00ms]
2026-01-21T18:28:28.5001481Z # STATE
2026-01-21T18:28:28.5001774Z 1 idea
2026-01-21T18:28:28.5002046Z 2 researched
2026-01-21T18:28:28.5002330Z 3 planned
2026-01-21T18:28:28.5006050Z (pass) statusCommand > shows multiple items with correct states [1.00ms]
2026-01-21T18:28:28.5019492Z (pass) statusCommand > outputs valid Index JSON with --json [2.00ms]
2026-01-21T18:28:28.5035432Z (pass) statusCommand > items are sorted by number [1.00ms]
2026-01-21T18:28:28.5036213Z
2026-01-21T18:28:28.5036473Z ##[endgroup]
2026-01-21T18:28:28.5036588Z
2026-01-21T18:28:28.5036973Z ##[group]src/**tests**/commands/init.test.ts:
2026-01-21T18:28:28.5076067Z Initialized .wreckit/ directory
2026-01-21T18:28:28.5076564Z Created config.json
2026-01-21T18:28:28.5076966Z Created prompts/research.md
2026-01-21T18:28:28.5077398Z Created prompts/plan.md
2026-01-21T18:28:28.5077808Z Created prompts/implement.md
2026-01-21T18:28:28.5078083Z
2026-01-21T18:28:28.5078521Z Tip: Create .wreckit/config.local.json for project-specific env overrides (gitignored)
2026-01-21T18:28:28.5080665Z (pass) initCommand > creates .wreckit directory [3.00ms]
2026-01-21T18:28:28.5099872Z Initialized .wreckit/ directory
2026-01-21T18:28:28.5100337Z Created config.json
2026-01-21T18:28:28.5100667Z Created prompts/research.md
2026-01-21T18:28:28.5100909Z Created prompts/plan.md
2026-01-21T18:28:28.5101131Z Created prompts/implement.md
2026-01-21T18:28:28.5101282Z
2026-01-21T18:28:28.5101526Z Tip: Create .wreckit/config.local.json for project-specific env overrides (gitignored)
2026-01-21T18:28:28.5103553Z (pass) initCommand > creates config.json with defaults [2.00ms]
2026-01-21T18:28:28.5115405Z Initialized .wreckit/ directory
2026-01-21T18:28:28.5116058Z Created config.json
2026-01-21T18:28:28.5116436Z Created prompts/research.md
2026-01-21T18:28:28.5116817Z Created prompts/plan.md
2026-01-21T18:28:28.5117184Z Created prompts/implement.md
2026-01-21T18:28:28.5117354Z
2026-01-21T18:28:28.5117606Z Tip: Create .wreckit/config.local.json for project-specific env overrides (gitignored)
2026-01-21T18:28:28.5119566Z (pass) initCommand > creates prompts directory with templates [2.00ms]
2026-01-21T18:28:28.5130541Z Initialized .wreckit/ directory
2026-01-21T18:28:28.5130991Z Created config.json
2026-01-21T18:28:28.5131346Z Created prompts/research.md
2026-01-21T18:28:28.5131729Z Created prompts/plan.md
2026-01-21T18:28:28.5131993Z Created prompts/implement.md
2026-01-21T18:28:28.5132151Z
2026-01-21T18:28:28.5132416Z Tip: Create .wreckit/config.local.json for project-specific env overrides (gitignored)
2026-01-21T18:28:28.5133920Z (pass) initCommand > creates research.md prompt template [1.00ms]
2026-01-21T18:28:28.5144687Z Initialized .wreckit/ directory
2026-01-21T18:28:28.5145047Z Created config.json
2026-01-21T18:28:28.5145440Z Created prompts/research.md
2026-01-21T18:28:28.5146033Z Created prompts/plan.md
2026-01-21T18:28:28.5146435Z Created prompts/implement.md
2026-01-21T18:28:28.5146714Z
2026-01-21T18:28:28.5147148Z Tip: Create .wreckit/config.local.json for project-specific env overrides (gitignored)
2026-01-21T18:28:28.5148737Z (pass) initCommand > creates plan.md prompt template [2.00ms]
2026-01-21T18:28:28.5162573Z Initialized .wreckit/ directory
2026-01-21T18:28:28.5163017Z Created config.json
2026-01-21T18:28:28.5163362Z Created prompts/research.md
2026-01-21T18:28:28.5163768Z Created prompts/plan.md
2026-01-21T18:28:28.5164163Z Created prompts/implement.md
2026-01-21T18:28:28.5164453Z
2026-01-21T18:28:28.5164894Z Tip: Create .wreckit/config.local.json for project-specific env overrides (gitignored)
2026-01-21T18:28:28.5167814Z (pass) initCommand > creates implement.md prompt template [2.00ms]
2026-01-21T18:28:28.5174571Z (pass) initCommand > fails if .wreckit exists (without --force)
2026-01-21T18:28:28.5189744Z Initialized .wreckit/ directory
2026-01-21T18:28:28.5190110Z Created config.json
2026-01-21T18:28:28.5190332Z Created prompts/research.md
2026-01-21T18:28:28.5190665Z Created prompts/plan.md
2026-01-21T18:28:28.5191069Z Created prompts/implement.md
2026-01-21T18:28:28.5191339Z
2026-01-21T18:28:28.5191792Z Tip: Create .wreckit/config.local.json for project-specific env overrides (gitignored)
2026-01-21T18:28:28.5193949Z (pass) initCommand > overwrites with --force [2.00ms]
2026-01-21T18:28:28.5198711Z (pass) initCommand > fails if not in git repo [1.00ms]
2026-01-21T18:28:28.5210473Z Initialized .wreckit/ directory
2026-01-21T18:28:28.5210861Z Created config.json
2026-01-21T18:28:28.5211259Z Created prompts/research.md
2026-01-21T18:28:28.5211836Z Created prompts/plan.md
2026-01-21T18:28:28.5212259Z Created prompts/implement.md
2026-01-21T18:28:28.5212539Z
2026-01-21T18:28:28.5212969Z Tip: Create .wreckit/config.local.json for project-specific env overrides (gitignored)
2026-01-21T18:28:28.5221472Z (pass) initCommand > prints success messages [2.00ms]
2026-01-21T18:28:28.5221891Z
2026-01-21T18:28:28.5222299Z ##[endgroup]
2026-01-21T18:28:28.5222422Z
2026-01-21T18:28:28.5222680Z ##[group]src/**tests**/commands/show.test.ts:
2026-01-21T18:28:28.5252482Z (pass) loadItemDetails > loads item without optional files [1.00ms]
2026-01-21T18:28:28.5263237Z (pass) loadItemDetails > detects research.md when exists [1.00ms]
2026-01-21T18:28:28.5273488Z (pass) loadItemDetails > detects plan.md when exists [1.00ms]
2026-01-21T18:28:28.5285154Z (pass) loadItemDetails > loads prd.json when exists [1.00ms]
2026-01-21T18:28:28.5296632Z ID: 001-test
2026-01-21T18:28:28.5296997Z Title: Test Feature
2026-01-21T18:28:28.5297352Z State: idea
2026-01-21T18:28:28.5297686Z Overview: A test feature
2026-01-21T18:28:28.5297962Z
2026-01-21T18:28:28.5298268Z Research: ✗
2026-01-21T18:28:28.5298455Z Plan: ✗
2026-01-21T18:28:28.5298647Z Stories: -
2026-01-21T18:28:28.5300837Z (pass) showCommand > shows item details correctly [2.00ms]
2026-01-21T18:28:28.5310218Z ID: 001-test
2026-01-21T18:28:28.5310570Z Title: test
2026-01-21T18:28:28.5310877Z State: idea
2026-01-21T18:28:28.5311165Z Overview: Test overview
2026-01-21T18:28:28.5311309Z
2026-01-21T18:28:28.5311433Z Research: ✓
2026-01-21T18:28:28.5311610Z Plan: ✗
2026-01-21T18:28:28.5311765Z Stories: -
2026-01-21T18:28:28.5314002Z (pass) showCommand > shows research.md indicator when exists [1.00ms]
2026-01-21T18:28:28.5321999Z ID: 001-test
2026-01-21T18:28:28.5322315Z Title: test
2026-01-21T18:28:28.5322596Z State: idea
2026-01-21T18:28:28.5322881Z Overview: Test overview
2026-01-21T18:28:28.5323106Z
2026-01-21T18:28:28.5323300Z Research: ✗
2026-01-21T18:28:28.5323579Z Plan: ✗
2026-01-21T18:28:28.5323843Z Stories: -
2026-01-21T18:28:28.5325066Z (pass) showCommand > shows research.md indicator when missing [1.00ms]
2026-01-21T18:28:28.5334285Z ID: 001-test
2026-01-21T18:28:28.5334701Z Title: test
2026-01-21T18:28:28.5334994Z State: idea
2026-01-21T18:28:28.5335173Z Overview: Test overview
2026-01-21T18:28:28.5335310Z
2026-01-21T18:28:28.5335430Z Research: ✗
2026-01-21T18:28:28.5335605Z Plan: ✓
2026-01-21T18:28:28.5335991Z Stories: -
2026-01-21T18:28:28.5338391Z (pass) showCommand > shows plan.md indicator when exists [2.00ms]
2026-01-21T18:28:28.5348284Z ID: 001-test
2026-01-21T18:28:28.5348641Z Title: test
2026-01-21T18:28:28.5348944Z State: idea
2026-01-21T18:28:28.5349364Z Overview: Test overview
2026-01-21T18:28:28.5349505Z
2026-01-21T18:28:28.5349632Z Research: ✗
2026-01-21T18:28:28.5349806Z Plan: ✗
2026-01-21T18:28:28.5349978Z Stories: 2 pending, 1 done
2026-01-21T18:28:28.5352280Z (pass) showCommand > shows prd.json story count when exists [1.00ms]
2026-01-21T18:28:28.5360231Z ID: 001-test
2026-01-21T18:28:28.5360564Z Title: test
2026-01-21T18:28:28.5360889Z State: idea
2026-01-21T18:28:28.5361121Z Overview: Test overview
2026-01-21T18:28:28.5361275Z
2026-01-21T18:28:28.5361395Z Research: ✗
2026-01-21T18:28:28.5361565Z Plan: ✗
2026-01-21T18:28:28.5361730Z Stories: -
2026-01-21T18:28:28.5363996Z (pass) showCommand > handles missing optional files [1.00ms]
2026-01-21T18:28:28.5383374Z (pass) showCommand > outputs full item data with --json [2.00ms]
2026-01-21T18:28:28.5390848Z (pass) showCommand > throws error for non-existent ID [1.00ms]
2026-01-21T18:28:28.5399443Z ID: 001-test
2026-01-21T18:28:28.5399755Z Title: test
2026-01-21T18:28:28.5400028Z State: idea
2026-01-21T18:28:28.5400304Z Overview: Test overview
2026-01-21T18:28:28.5400527Z
2026-01-21T18:28:28.5400727Z Research: ✗
2026-01-21T18:28:28.5401006Z Plan: ✗
2026-01-21T18:28:28.5401268Z Stories: -
2026-01-21T18:28:28.5401549Z Branch: wreckit/001-test
2026-01-21T18:28:28.5402682Z (pass) showCommand > shows branch info when available [1.00ms]
2026-01-21T18:28:28.5410914Z ID: 001-test
2026-01-21T18:28:28.5411404Z Title: test
2026-01-21T18:28:28.5411674Z State: idea
2026-01-21T18:28:28.5411973Z Overview: Test overview
2026-01-21T18:28:28.5412218Z
2026-01-21T18:28:28.5412478Z Research: ✗
2026-01-21T18:28:28.5412804Z Plan: ✗
2026-01-21T18:28:28.5413081Z Stories: -
2026-01-21T18:28:28.5413448Z PR: https://github.com/org/repo/pull/123
2026-01-21T18:28:28.5414891Z (pass) showCommand > shows PR info when available [1.00ms]
2026-01-21T18:28:28.5423132Z ID: 001-test
2026-01-21T18:28:28.5423443Z Title: test
2026-01-21T18:28:28.5423708Z State: idea
2026-01-21T18:28:28.5423998Z Overview: Test overview
2026-01-21T18:28:28.5424223Z
2026-01-21T18:28:28.5424371Z Research: ✗
2026-01-21T18:28:28.5424565Z Plan: ✗
2026-01-21T18:28:28.5424725Z Stories: -
2026-01-21T18:28:28.5424900Z Rollback SHA: abc123def456
2026-01-21T18:28:28.5426522Z (pass) showCommand > shows rollback_sha when available [1.00ms]
2026-01-21T18:28:28.5434575Z ID: 001-test
2026-01-21T18:28:28.5434869Z Title: test
2026-01-21T18:28:28.5435151Z State: idea
2026-01-21T18:28:28.5435438Z Overview: Test overview
2026-01-21T18:28:28.5435659Z
2026-01-21T18:28:28.5435903Z Research: ✗
2026-01-21T18:28:28.5436079Z Plan: ✗
2026-01-21T18:28:28.5436242Z Stories: -
2026-01-21T18:28:28.5436424Z Completed: 2024-01-15T10:30:00Z
2026-01-21T18:28:28.5437950Z (pass) showCommand > shows completed_at when available [2.00ms]
2026-01-21T18:28:28.5438444Z
2026-01-21T18:28:28.5438849Z ##[endgroup]
2026-01-21T18:28:28.5439025Z
2026-01-21T18:28:28.5439441Z ##[group]src/**tests**/commands/ideas.test.ts:
2026-01-21T18:28:28.5479952Z Created 2 items:
2026-01-21T18:28:28.5480200Z 001-add-dark-mode
2026-01-21T18:28:28.5480388Z 002-fix-bug
2026-01-21T18:28:28.5484786Z (pass) ideasCommand > creates items from file input [2.00ms]
2026-01-21T18:28:28.5497056Z Created 2 items:
2026-01-21T18:28:28.5497364Z 001-first-feature
2026-01-21T18:28:28.5497659Z 002-second-feature
2026-01-21T18:28:28.5501010Z (pass) ideasCommand > creates items with correct IDs [2.00ms]
2026-01-21T18:28:28.5513980Z Created 2 items:
2026-01-21T18:28:28.5514342Z 001-add-feature
2026-01-21T18:28:28.5514649Z 002-fix-bug
2026-01-21T18:28:28.5517919Z (pass) ideasCommand > prints created items [2.00ms]
2026-01-21T18:28:28.5523372Z Would create 1 items:
2026-01-21T18:28:28.5523608Z XXX-add-dark-mode
2026-01-21T18:28:28.5526819Z (pass) ideasCommand > --dry-run doesn't create files [1.00ms]
2026-01-21T18:28:28.5543277Z Created 1 items:
2026-01-21T18:28:28.5543597Z 001-add-dark-mode
2026-01-21T18:28:28.5545196Z Skipped 1 existing items:
2026-01-21T18:28:28.5545553Z 001-add-dark-mode
2026-01-21T18:28:28.5548764Z (pass) ideasCommand > skips existing items (idempotent) [2.00ms]
2026-01-21T18:28:28.5554007Z No items created
2026-01-21T18:28:28.5556815Z (pass) ideasCommand > handles empty input gracefully [1.00ms]
2026-01-21T18:28:28.5562277Z No items created
2026-01-21T18:28:28.5564796Z (pass) ideasCommand > handles input with only whitespace
2026-01-21T18:28:28.5576299Z Created 2 items:
2026-01-21T18:28:28.5576642Z 001-test-feature
2026-01-21T18:28:28.5576953Z 002-fix-test-bug
2026-01-21T18:28:28.5579589Z (pass) ideasCommand > works with inputOverride parameter [2.00ms]
2026-01-21T18:28:28.5584921Z (pass) readFile > reads file content
2026-01-21T18:28:28.5588582Z (pass) readFile > throws FileNotFoundError for missing file [1.00ms]
2026-01-21T18:28:28.5591438Z (pass) readFile > throws FileNotFoundError with correct message
2026-01-21T18:28:28.5601809Z Created 1 items:
2026-01-21T18:28:28.5602134Z 001-test-idea
2026-01-21T18:28:28.5605480Z (pass) ideasCommand - git warnings > warns when uncommitted changes exist [1.00ms]
2026-01-21T18:28:28.5614198Z Created 1 items:
2026-01-21T18:28:28.5614551Z 001-test-idea
2026-01-21T18:28:28.5617773Z (pass) ideasCommand - git warnings > does not warn when repo is clean [2.00ms]
2026-01-21T18:28:28.5622704Z Would create 1 items:
2026-01-21T18:28:28.5623265Z XXX-test-idea
2026-01-21T18:28:28.5625116Z (pass) ideasCommand - git warnings > does not warn in dry-run mode even with changes
2026-01-21T18:28:28.5634085Z Created 1 items:
2026-01-21T18:28:28.5634395Z 001-test-idea
2026-01-21T18:28:28.5637873Z (pass) ideasCommand - git warnings > does not warn outside git repo [2.00ms]
2026-01-21T18:28:28.5638404Z
2026-01-21T18:28:28.5638654Z ##[endgroup]
2026-01-21T18:28:28.5638768Z
2026-01-21T18:28:28.5639038Z ##[group]src/**tests**/commands/orchestrator.test.ts:
2026-01-21T18:28:28.5671227Z (pass) orchestrator > orchestrateAll > empty items returns empty result [2.00ms]
2026-01-21T18:28:28.5686449Z (pass) orchestrator > orchestrateAll > all items 'done' returns all in skipped [1.00ms]
2026-01-21T18:28:28.5710871Z (pass) orchestrator > orchestrateAll > runs items in number order [3.00ms]
2026-01-21T18:28:28.5730224Z (pass) orchestrator > orchestrateAll > tracks completed and failed separately [2.00ms]
2026-01-21T18:28:28.5744092Z (pass) orchestrator > orchestrateAll > continues after failure (doesn't stop) [1.00ms]
2026-01-21T18:28:28.5759716Z (pass) orchestrator > orchestrateAll > --dry-run doesn't run items [2.00ms]
2026-01-21T18:28:28.5773421Z (pass) orchestrator > orchestrateNext > returns null if all items done [1.00ms]
2026-01-21T18:28:28.5790448Z (pass) orchestrator > orchestrateNext > returns first non-done item [2.00ms]
2026-01-21T18:28:28.5803505Z (pass) orchestrator > orchestrateNext > runs only that one item [1.00ms]
2026-01-21T18:28:28.5814115Z (pass) orchestrator > orchestrateNext > returns success/failure status [1.00ms]
2026-01-21T18:28:28.5819814Z (pass) orchestrator > getNextIncompleteItem > returns null for empty .wreckit [1.00ms]
2026-01-21T18:28:28.5831571Z (pass) orchestrator > getNextIncompleteItem > returns null if all 'done' [1.00ms]
2026-01-21T18:28:28.5844668Z (pass) orchestrator > getNextIncompleteItem > returns first non-done item (sorted) [1.00ms]
2026-01-21T18:28:28.5863996Z (pass) orchestrator > getNextIncompleteItem > respects numeric ordering [2.00ms]
2026-01-21T18:28:28.5864663Z
2026-01-21T18:28:28.5865055Z ##[endgroup]
2026-01-21T18:28:28.5865249Z
2026-01-21T18:28:28.5865918Z ##[group]src/**tests**/edge-cases/corruption.test.ts:
2026-01-21T18:28:28.5886792Z (pass) corruption detection > truncated item.json > throws InvalidJsonError for truncated JSON
2026-01-21T18:28:28.5891168Z (pass) corruption detection > invalid JSON > throws InvalidJsonError for malformed JSON [1.00ms]
2026-01-21T18:28:28.5898980Z (pass) corruption detection > invalid JSON > throws SchemaValidationError for valid JSON with wrong schema [1.00ms]
2026-01-21T18:28:28.5901828Z (pass) corruption detection > missing file > throws FileNotFoundError for non-existent file
2026-01-21T18:28:28.5908679Z (pass) atomic writes > safeWriteJson > writes valid JSON that can be read back [1.00ms]
2026-01-21T18:28:28.5915419Z (pass) atomic writes > safeWriteJson > creates parent directories if needed
2026-01-21T18:28:28.5920971Z (pass) atomic writes > safeWriteJson > does not leave .tmp files on success [1.00ms]
2026-01-21T18:28:28.5930109Z (pass) atomic writes > safeWriteJson > overwrites existing file atomically [1.00ms]
2026-01-21T18:28:28.5941480Z (pass) orphaned temp file cleanup > removes orphaned .tmp files [1.00ms]
2026-01-21T18:28:28.5949094Z (pass) orphaned temp file cleanup > recursively cleans nested directories [1.00ms]
2026-01-21T18:28:28.5952921Z (pass) orphaned temp file cleanup > returns empty array for non-existent directory
2026-01-21T18:28:28.5958997Z (pass) orphaned temp file cleanup > ignores non-.tmp files [1.00ms]
2026-01-21T18:28:28.5959496Z
2026-01-21T18:28:28.5959871Z ##[endgroup]
2026-01-21T18:28:28.5960057Z
2026-01-21T18:28:28.5960429Z ##[group]src/**tests**/edge-cases/config.test.ts:
2026-01-21T18:28:28.5984872Z (pass) Edge Cases: Config Handling (Tests 42-46) > Test 42: Missing config.json - uses defaults > returns DEFAULT_CONFIG when .wreckit exists but config.json is missing
2026-01-21T18:28:28.5990226Z (pass) Edge Cases: Config Handling (Tests 42-46) > Test 42: Missing config.json - uses defaults > returns correct default values for all fields [1.00ms]
2026-01-21T18:28:28.5994749Z (pass) Edge Cases: Config Handling (Tests 42-46) > Test 42: Missing config.json - uses defaults > does not throw when .wreckit directory is empty
2026-01-21T18:28:28.6001064Z (pass) Edge Cases: Config Handling (Tests 42-46) > Test 43: Invalid JSON in config - throws InvalidJsonError > throws InvalidJsonError for malformed JSON with missing quotes [1.00ms]
2026-01-21T18:28:28.6006352Z (pass) Edge Cases: Config Handling (Tests 42-46) > Test 43: Invalid JSON in config - throws InvalidJsonError > throws InvalidJsonError for truncated JSON
2026-01-21T18:28:28.6012130Z (pass) Edge Cases: Config Handling (Tests 42-46) > Test 43: Invalid JSON in config - throws InvalidJsonError > throws InvalidJsonError for completely invalid content [1.00ms]
2026-01-21T18:28:28.6024845Z (pass) Edge Cases: Config Handling (Tests 42-46) > Test 43: Invalid JSON in config - throws InvalidJsonError > includes file path in error message [1.00ms]
2026-01-21T18:28:28.6030638Z (pass) Edge Cases: Config Handling (Tests 42-46) > Test 43: Invalid JSON in config - throws InvalidJsonError > throws InvalidJsonError for empty file [1.00ms]
2026-01-21T18:28:28.6036297Z (pass) Edge Cases: Config Handling (Tests 42-46) > Test 43: Invalid JSON in config - throws InvalidJsonError > throws InvalidJsonError for JSON with trailing commas
2026-01-21T18:28:28.6043497Z (pass) Edge Cases: Config Handling (Tests 42-46) > Test 44: Schema validation failure - throws SchemaValidationError > throws SchemaValidationError when base_branch is a number [1.00ms]
2026-01-21T18:28:28.6049954Z (pass) Edge Cases: Config Handling (Tests 42-46) > Test 44: Schema validation failure - throws SchemaValidationError > throws SchemaValidationError when schema_version is a string [1.00ms]
2026-01-21T18:28:28.6056332Z (pass) Edge Cases: Config Handling (Tests 42-46) > Test 44: Schema validation failure - throws SchemaValidationError > throws SchemaValidationError when agent is a string instead of object
2026-01-21T18:28:28.6062908Z (pass) Edge Cases: Config Handling (Tests 42-46) > Test 44: Schema validation failure - throws SchemaValidationError > throws SchemaValidationError when max_iterations is negative [1.00ms]
2026-01-21T18:28:28.6069121Z (pass) Edge Cases: Config Handling (Tests 42-46) > Test 44: Schema validation failure - throws SchemaValidationError > throws SchemaValidationError when timeout_seconds is a boolean [1.00ms]
2026-01-21T18:28:28.6075922Z (pass) Edge Cases: Config Handling (Tests 42-46) > Test 44: Schema validation failure - throws SchemaValidationError > throws SchemaValidationError when agent.args is a string instead of array
2026-01-21T18:28:28.6082288Z (pass) Edge Cases: Config Handling (Tests 42-46) > Test 44: Schema validation failure - throws SchemaValidationError > includes file path in schema error message [1.00ms]
2026-01-21T18:28:28.6089449Z (pass) Edge Cases: Config Handling (Tests 42-46) > Test 45: Partial config with defaults - mergeWithDefaults fills missing values > fills missing base_branch with default [1.00ms]
2026-01-21T18:28:28.6095684Z (pass) Edge Cases: Config Handling (Tests 42-46) > Test 45: Partial config with defaults - mergeWithDefaults fills missing values > uses provided agent when all agent fields are present
2026-01-21T18:28:28.6099469Z (pass) Edge Cases: Config Handling (Tests 42-46) > Test 45: Partial config with defaults - mergeWithDefaults fills missing values > mergeWithDefaults returns full defaults for empty object [1.00ms]
2026-01-21T18:28:28.6102708Z (pass) Edge Cases: Config Handling (Tests 42-46) > Test 45: Partial config with defaults - mergeWithDefaults fills missing values > mergeWithDefaults preserves provided values
2026-01-21T18:28:28.6106444Z (pass) Edge Cases: Config Handling (Tests 42-46) > Test 45: Partial config with defaults - mergeWithDefaults fills missing values > mergeWithDefaults handles partial agent with all fields
2026-01-21T18:28:28.6113909Z (pass) Edge Cases: Config Handling (Tests 42-46) > Test 45: Partial config with defaults - mergeWithDefaults fills missing values > config with schema_version and agent fills other defaults [1.00ms]
2026-01-21T18:28:28.6120527Z (pass) Edge Cases: Config Handling (Tests 42-46) > Test 46: Config overrides (applyOverrides) - override values take precedence > baseBranch override takes precedence over config [1.00ms]
2026-01-21T18:28:28.6126269Z (pass) Edge Cases: Config Handling (Tests 42-46) > Test 46: Config overrides (applyOverrides) - override values take precedence > multiple overrides all take precedence
2026-01-21T18:28:28.6130119Z (pass) Edge Cases: Config Handling (Tests 42-46) > Test 46: Config overrides (applyOverrides) - override values take precedence > applyOverrides with empty overrides returns original config [1.00ms]
2026-01-21T18:28:28.6133159Z (pass) Edge Cases: Config Handling (Tests 42-46) > Test 46: Config overrides (applyOverrides) - override values take precedence > applyOverrides applies agentCommand override
2026-01-21T18:28:28.6136499Z (pass) Edge Cases: Config Handling (Tests 42-46) > Test 46: Config overrides (applyOverrides) - override values take precedence > applyOverrides applies agentArgs override
2026-01-21T18:28:28.6139825Z (pass) Edge Cases: Config Handling (Tests 42-46) > Test 46: Config overrides (applyOverrides) - override values take precedence > applyOverrides applies completionSignal override [1.00ms]
2026-01-21T18:28:28.6142633Z (pass) Edge Cases: Config Handling (Tests 42-46) > Test 46: Config overrides (applyOverrides) - override values take precedence > applyOverrides applies timeoutSeconds override
2026-01-21T18:28:28.6147073Z (pass) Edge Cases: Config Handling (Tests 42-46) > Test 46: Config overrides (applyOverrides) - override values take precedence > overrides work with missing config.json (defaults + overrides)
2026-01-21T18:28:28.6150423Z (pass) Edge Cases: Config Handling (Tests 42-46) > Test 46: Config overrides (applyOverrides) - override values take precedence > all overrides can be applied together [1.00ms]
2026-01-21T18:28:28.6153481Z (pass) Edge Cases: Config Handling (Tests 42-46) > Test 46: Config overrides (applyOverrides) - override values take precedence > schema_version is never overridden
2026-01-21T18:28:28.6154112Z
2026-01-21T18:28:28.6154356Z ##[endgroup]
2026-01-21T18:28:28.6154467Z
2026-01-21T18:28:28.6154729Z ##[group]src/**tests**/edge-cases/cwd.test.ts:
2026-01-21T18:28:28.6186472Z (pass) --cwd Flag Edge Cases > Test 1: Absolute vs relative path resolution > resolves absolute path correctly [1.00ms]
2026-01-21T18:28:28.6189362Z (pass) --cwd Flag Edge Cases > Test 1: Absolute vs relative path resolution > resolves relative path to absolute [1.00ms]
2026-01-21T18:28:28.6194372Z (pass) --cwd Flag Edge Cases > Test 1: Absolute vs relative path resolution > resolves parent relative path correctly
2026-01-21T18:28:28.6197416Z (pass) --cwd Flag Edge Cases > Test 1: Absolute vs relative path resolution > uses process.cwd() when no cwd option provided [1.00ms]
2026-01-21T18:28:28.6204094Z (pass) --cwd Flag Edge Cases > Test 1: Absolute vs relative path resolution > absolute and relative resolve to same canonical path
2026-01-21T18:28:28.6211268Z (pass) --cwd Flag Edge Cases > Test 2: --cwd pointing to subdirectory of repo > findRepoRoot finds root from nested subdirectory [1.00ms]
2026-01-21T18:28:28.6218113Z (pass) --cwd Flag Edge Cases > Test 2: --cwd pointing to subdirectory of repo > findRepoRoot finds root from immediate subdirectory [1.00ms]
2026-01-21T18:28:28.6224676Z (pass) --cwd Flag Edge Cases > Test 2: --cwd pointing to subdirectory of repo > .wreckit in repo root is used when running from subdirectory
2026-01-21T18:28:28.6232345Z (pass) --cwd Flag Edge Cases > Test 2: --cwd pointing to subdirectory of repo > resolveCwd with . from subdirectory still finds repo root [1.00ms]
2026-01-21T18:28:28.6236845Z (pass) --cwd Flag Edge Cases > Test 3: --cwd pointing outside any git repo > findRepoRoot throws RepoNotFoundError when no .git exists
2026-01-21T18:28:28.6260632Z (pass) --cwd Flag Edge Cases > Test 3: --cwd pointing outside any git repo > isGitRepo returns false for non-git directory [3.00ms]
2026-01-21T18:28:28.6264812Z (pass) --cwd Flag Edge Cases > Test 3: --cwd pointing outside any git repo > runOnboardingIfNeeded returns not-git-repo reason
2026-01-21T18:28:28.6268383Z (pass) --cwd Flag Edge Cases > Test 3: --cwd pointing outside any git repo > runOnboardingIfNeeded logs appropriate error for non-git repo [1.00ms]
2026-01-21T18:28:28.6273318Z (pass) --cwd Flag Edge Cases > Test 4: .wreckit without .git (mismatched root) > throws RepoNotFoundError with specific message
2026-01-21T18:28:28.6278102Z (pass) --cwd Flag Edge Cases > Test 4: .wreckit without .git (mismatched root) > error message includes the path where .wreckit was found [1.00ms]
2026-01-21T18:28:28.6284083Z (pass) --cwd Flag Edge Cases > Test 4: .wreckit without .git (mismatched root) > detects mismatch from nested subdirectory
2026-01-21T18:28:28.6291431Z (pass) --cwd Flag Edge Cases > Test 5: --cwd pointing above repo root > treats parent of repo as not a git repo [1.00ms]
2026-01-21T18:28:28.6311205Z (pass) --cwd Flag Edge Cases > Test 5: --cwd pointing above repo root > isGitRepo returns false for parent directory [2.00ms]
2026-01-21T18:28:28.6318238Z (pass) --cwd Flag Edge Cases > Test 5: --cwd pointing above repo root > runOnboardingIfNeeded fails when cwd is above repo [1.00ms]
2026-01-21T18:28:28.6320436Z (pass) --cwd Flag Edge Cases > Test 6: Non-existent --cwd > resolveCwd resolves non-existent path to absolute
2026-01-21T18:28:28.6323643Z (pass) --cwd Flag Edge Cases > Test 6: Non-existent --cwd > findRepoRoot throws when path does not exist
2026-01-21T18:28:28.6326864Z (pass) --cwd Flag Edge Cases > Test 6: Non-existent --cwd > runOnboardingIfNeeded handles non-existent cwd gracefully [1.00ms]
2026-01-21T18:28:28.6330911Z (pass) --cwd Flag Edge Cases > Test 6: Non-existent --cwd > no partial initialization occurs with non-existent cwd
2026-01-21T18:28:28.6336486Z (pass) --cwd Flag Edge Cases > Test 7: --cwd used with all subcommands > resolveCwd is consistent across invocations
2026-01-21T18:28:28.6351691Z (pass) --cwd Flag Edge Cases > Test 7: --cwd used with all subcommands > findRepoRoot works with resolved cwd [2.00ms]
2026-01-21T18:28:28.6357322Z (pass) --cwd Flag Edge Cases > Test 7: --cwd used with all subcommands > commands do not accidentally use process.cwd when --cwd is provided [1.00ms]
2026-01-21T18:28:28.6363924Z (pass) --cwd Flag Edge Cases > Test 7: --cwd used with all subcommands > cwd option is passed correctly through onboarding
2026-01-21T18:28:28.6371319Z (pass) --cwd Flag Edge Cases > Test 7: --cwd used with all subcommands > relative cwd from different working directory resolves correctly [1.00ms]
2026-01-21T18:28:28.6378201Z (pass) --cwd Flag Edge Cases > Test 7: --cwd used with all subcommands > absolute cwd works regardless of current working directory [1.00ms]
2026-01-21T18:28:28.6380258Z (pass) --cwd Flag Edge Cases > Edge cases for path normalization > handles trailing slashes
2026-01-21T18:28:28.6382620Z (pass) --cwd Flag Edge Cases > Edge cases for path normalization > handles double slashes
2026-01-21T18:28:28.6384878Z (pass) --cwd Flag Edge Cases > Edge cases for path normalization > handles . in path
2026-01-21T18:28:28.6389807Z (pass) --cwd Flag Edge Cases > Edge cases for path normalization > handles .. in path [1.00ms]
2026-01-21T18:28:28.6398612Z (pass) --cwd Flag Edge Cases > Integration: Full cwd resolution workflow > complete workflow from cwd option to repo root [1.00ms]
2026-01-21T18:28:28.6403398Z (pass) --cwd Flag Edge Cases > Integration: Full cwd resolution workflow > error handling workflow for invalid cwd
2026-01-21T18:28:28.6404138Z
2026-01-21T18:28:28.6404539Z ##[endgroup]
2026-01-21T18:28:28.6404713Z
2026-01-21T18:28:28.6405197Z ##[group]src/**tests**/edge-cases/concurrent.test.ts:
2026-01-21T18:28:28.8250634Z (pass) concurrent modification handling > concurrent writes > last write wins for simultaneous writes [183.00ms]
2026-01-21T18:28:28.8277519Z (pass) concurrent modification handling > concurrent writes > atomic writes prevent partial corruption [3.00ms]
2026-01-21T18:28:29.0035583Z (pass) concurrent modification handling > read during write > reads complete data even during concurrent writes [175.00ms]
2026-01-21T18:28:29.0051750Z (pass) concurrent modification handling > external modification detection > detects when item.json was modified externally [2.00ms]
2026-01-21T18:28:29.0160347Z (pass) file locking scenarios > handles rapid sequential updates [11.00ms]
2026-01-21T18:28:29.0160876Z
2026-01-21T18:28:29.0161335Z ##[endgroup]
2026-01-21T18:28:29.0161515Z
2026-01-21T18:28:29.0162021Z ##[group]src/**tests**/edge-cases/state-conflicts.test.ts:
2026-01-21T18:28:29.0206734Z (pass) State Conflict Resolution > 7.3 Item vs Artifacts Conflicts (69-74) > 69: Researched but research.md missing - should emit STATE_FILE_MISMATCH [2.00ms]
2026-01-21T18:28:29.0224249Z (pass) State Conflict Resolution > 7.3 Item vs Artifacts Conflicts (69-74) > 70: Raw but research.md exists - should detect upgrade opportunity [2.00ms]
2026-01-21T18:28:29.0243281Z (pass) State Conflict Resolution > 7.3 Item vs Artifacts Conflicts (69-74) > 71: Planned but plan.md missing - should emit STATE_FILE_MISMATCH [2.00ms]
2026-01-21T18:28:29.0269610Z (pass) State Conflict Resolution > 7.3 Item vs Artifacts Conflicts (69-74) > 72: Planned but prd.json missing - should emit STATE_FILE_MISMATCH [3.00ms]
2026-01-21T18:28:29.0288880Z (pass) State Conflict Resolution > 7.3 Item vs Artifacts Conflicts (69-74) > 73: Implementing but no pending stories - should flag as ready for PR [2.00ms]
2026-01-21T18:28:29.0308050Z (pass) State Conflict Resolution > 7.3 Item vs Artifacts Conflicts (69-74) > 74: Planned but prd has pending stories - should detect upgrade to implementing [2.00ms]
2026-01-21T18:28:29.0327451Z (pass) State Conflict Resolution > 7.3 Item vs Artifacts Conflicts (69-74) > 72b: Planned but prd.json invalid - should emit INVALID_PRD [2.00ms]
2026-01-21T18:28:29.0345661Z (pass) State Conflict Resolution > 7.4 PR State Mismatches (75-79) > 75: in_pr but pr_url missing - should emit STATE_FILE_MISMATCH [1.00ms]
2026-01-21T18:28:29.0418014Z (pass) State Conflict Resolution > 7.4 PR State Mismatches (75-79) > 76: in_pr with valid pr_url - no diagnostic [2.00ms]
2026-01-21T18:28:29.0419450Z (pass) State Conflict Resolution > 7.4 PR State Mismatches (75-79) > 77: done with pr_url - no diagnostic [2.00ms]
2026-01-21T18:28:29.0420693Z (pass) State Conflict Resolution > 7.4 PR State Mismatches (75-79) > 78: implementing with pr_url set - valid state [2.00ms]
2026-01-21T18:28:29.0433325Z (pass) State Conflict Resolution > 7.4 PR State Mismatches (75-79) > 79: raw with pr_url set - unusual but valid [3.00ms]
2026-01-21T18:28:29.0453184Z (pass) State Conflict Resolution > 7.5 Branch Tracking Conflicts (80-85) > 80: implementing with branch set - no diagnostic [2.00ms]
2026-01-21T18:28:29.0471677Z (pass) State Conflict Resolution > 7.5 Branch Tracking Conflicts (80-85) > 81: in_pr without branch - should emit diagnostic [2.00ms]
2026-01-21T18:28:29.0485520Z (pass) State Conflict Resolution > 7.5 Branch Tracking Conflicts (80-85) > 82: raw with branch set - valid state [1.00ms]
2026-01-21T18:28:29.0503547Z (pass) State Conflict Resolution > 7.5 Branch Tracking Conflicts (80-85) > 83: Implementing but branch missing - should have valid state with artifacts [2.00ms]
2026-01-21T18:28:29.0521411Z (pass) State Conflict Resolution > 7.5 Branch Tracking Conflicts (80-85) > 84: in_pr with all artifacts present - valid state [2.00ms]
2026-01-21T18:28:29.0540453Z (pass) State Conflict Resolution > 7.5 Branch Tracking Conflicts (80-85) > 85: done with all artifacts - valid state [2.00ms]
2026-01-21T18:28:29.0560101Z (pass) State Conflict Resolution > 7.6 Metadata Sync Conflicts (86-89) > 86: PR exists but item.pr_url missing - should emit STATE_FILE_MISMATCH for in_pr [2.00ms]
2026-01-21T18:28:29.0589032Z (pass) State Conflict Resolution > 7.6 Metadata Sync Conflicts (86-89) > 87: Branch inferred when missing - implementing state with null branch [3.00ms]
2026-01-21T18:28:29.0608774Z (pass) State Conflict Resolution > 7.6 Metadata Sync Conflicts (86-89) > 88: item.branch set but different from expected - valid state [2.00ms]
2026-01-21T18:28:29.0627776Z (pass) State Conflict Resolution > 7.6 Metadata Sync Conflicts (86-89) > 89: All stories done, implementing, no PR - should emit diagnostic about ready for PR [2.00ms]
2026-01-21T18:28:29.0643254Z (pass) State Conflict Resolution > Edge Cases - Invalid Artifact Combinations > planned state with only plan.md (no prd.json) - should emit diagnostic [1.00ms]
2026-01-21T18:28:29.0659912Z (pass) State Conflict Resolution > Edge Cases - Invalid Artifact Combinations > planned state with only prd.json (no plan.md) - should emit diagnostic [2.00ms]
2026-01-21T18:28:29.0678230Z (pass) State Conflict Resolution > Edge Cases - Invalid Artifact Combinations > implementing state with invalid prd.json - should emit INVALID_PRD [2.00ms]
2026-01-21T18:28:29.0693985Z (pass) State Conflict Resolution > Edge Cases - Invalid Artifact Combinations > researched state with valid research.md - no diagnostic [1.00ms]
2026-01-21T18:28:29.0708428Z (pass) State Conflict Resolution > Edge Cases - Invalid Artifact Combinations > raw state with no artifacts - no diagnostic [2.00ms]
2026-01-21T18:28:29.0751104Z (pass) State Conflict Resolution > Multiple Items with Different States > handles multiple items with varying artifact completeness [4.00ms]
2026-01-21T18:28:29.0771292Z (pass) State Conflict Resolution > Multiple Items with Different States > validates all items in items folder [2.00ms]
2026-01-21T18:28:29.0789866Z (pass) State Conflict Resolution > PRD Story Status Validation > implementing with mixed story statuses - no diagnostic [2.00ms]
2026-01-21T18:28:29.0808602Z (pass) State Conflict Resolution > PRD Story Status Validation > implementing with empty stories array - should emit diagnostic [2.00ms]
2026-01-21T18:28:29.0809483Z
2026-01-21T18:28:29.0809760Z ##[endgroup]
2026-01-21T18:28:29.0809867Z
2026-01-21T18:28:29.0810151Z ##[group]src/**tests**/edge-cases/item-states.test.ts:
2026-01-21T18:28:29.0857594Z (pass) Edge Cases: Item States & Artifacts (Tests 47-50) > Test 47: Item missing expected files > planned state without research.md does not crash during validation [3.00ms]
2026-01-21T18:28:29.0873666Z (pass) Edge Cases: Item States & Artifacts (Tests 47-50) > Test 47: Item missing expected files > planned state without plan.md does not crash [1.00ms]
2026-01-21T18:28:29.0899508Z (pass) Edge Cases: Item States & Artifacts (Tests 47-50) > Test 47: Item missing expected files > planned state without prd.json does not crash [3.00ms]
2026-01-21T18:28:29.0914902Z (pass) Edge Cases: Item States & Artifacts (Tests 47-50) > Test 47: Item missing expected files > implementing state with all artifacts missing still builds context [1.00ms]
2026-01-21T18:28:29.0935949Z (pass) Edge Cases: Item States & Artifacts (Tests 47-50) > Test 48: Empty PRD or no stories > prd.json with empty user_stories array does not cause errors [2.00ms]
2026-01-21T18:28:29.0956757Z (pass) Edge Cases: Item States & Artifacts (Tests 47-50) > Test 48: Empty PRD or no stories > implementing state with empty stories array works correctly [2.00ms]
2026-01-21T18:28:29.0963756Z (pass) Edge Cases: Item States & Artifacts (Tests 47-50) > Test 48: Empty PRD or no stories > getNextPhase works with empty PRD [1.00ms]
2026-01-21T18:28:29.0986567Z (pass) Edge Cases: Item States & Artifacts (Tests 47-50) > Test 49: All story statuses > handles stories with 'pending' status [2.00ms]
2026-01-21T18:28:29.1007869Z (pass) Edge Cases: Item States & Artifacts (Tests 47-50) > Test 49: All story statuses > handles stories with 'done' status [3.00ms]
2026-01-21T18:28:29.1028872Z (pass) Edge Cases: Item States & Artifacts (Tests 47-50) > Test 49: All story statuses > handles mixed story statuses [2.00ms]
2026-01-21T18:28:29.1035143Z (pass) Edge Cases: Item States & Artifacts (Tests 47-50) > Test 50: State transitions > raw state allows research phase
2026-01-21T18:28:29.1041985Z (pass) Edge Cases: Item States & Artifacts (Tests 47-50) > Test 50: State transitions > researched state allows plan phase [1.00ms]
2026-01-21T18:28:29.1054702Z (pass) Edge Cases: Item States & Artifacts (Tests 47-50) > Test 50: State transitions > planned state allows implement phase [1.00ms]
2026-01-21T18:28:29.1062179Z (pass) Edge Cases: Item States & Artifacts (Tests 47-50) > Test 50: State transitions > implementing state allows pr phase [1.00ms]
2026-01-21T18:28:29.1068596Z (pass) Edge Cases: Item States & Artifacts (Tests 47-50) > Test 50: State transitions > in_pr state allows complete phase [1.00ms]
2026-01-21T18:28:29.1075093Z (pass) Edge Cases: Item States & Artifacts (Tests 47-50) > Test 50: State transitions > done state returns null
2026-01-21T18:28:29.1084274Z (pass) Edge Cases: Config Overrides (Tests 51-65) > Test 51-55: Config loading > loads config from .wreckit/config.json [1.00ms]
2026-01-21T18:28:29.1092027Z (pass) Edge Cases: Config Overrides (Tests 51-65) > Test 51-55: Config loading > uses defaults when config.json missing [1.00ms]
2026-01-21T18:28:29.1098239Z (pass) Edge Cases: Config Overrides (Tests 51-65) > Test 51-55: Config loading > mergeWithDefaults fills missing fields [1.00ms]
2026-01-21T18:28:29.1106741Z (pass) Edge Cases: Config Overrides (Tests 51-65) > Test 56-60: Override precedence > override wins over config for baseBranch
2026-01-21T18:28:29.1115406Z (pass) Edge Cases: Config Overrides (Tests 51-65) > Test 56-60: Override precedence > override wins over config for branchPrefix [1.00ms]
2026-01-21T18:28:29.1124228Z (pass) Edge Cases: Config Overrides (Tests 51-65) > Test 56-60: Override precedence > multiple overrides all win over config [1.00ms]
2026-01-21T18:28:29.1131704Z (pass) Edge Cases: Config Overrides (Tests 51-65) > Test 56-60: Override precedence > overrides work with missing config.json (defaults + overrides) [1.00ms]
2026-01-21T18:28:29.1138263Z (pass) Edge Cases: Config Overrides (Tests 51-65) > Test 56-60: Override precedence > applyOverrides maintains non-overridden values from config [1.00ms]
2026-01-21T18:28:29.1146476Z (pass) Edge Cases: Config Overrides (Tests 51-65) > Test 56-60: Override precedence > partial overrides preserve other config values
2026-01-21T18:28:29.1147873Z (pass) Edge Cases: Flag Combinations & Interactions (Tests 66-68) > Test 66: Global flags propagate into subcommands > optsWithGlobals returns global flags in subcommand context [1.00ms]
2026-01-21T18:28:29.1149325Z (pass) Edge Cases: Flag Combinations & Interactions (Tests 66-68) > Test 66: Global flags propagate into subcommands > global flags structure matches expected interface
2026-01-21T18:28:29.1150690Z (pass) Edge Cases: Flag Combinations & Interactions (Tests 66-68) > Test 66: Global flags propagate into subcommands > cwd flag value is preserved through global options
2026-01-21T18:28:29.1151818Z (pass) Edge Cases: Flag Combinations & Interactions (Tests 66-68) > Test 67: Conflicting flags: --quiet --debug > both flags can be set simultaneously
2026-01-21T18:28:29.1153108Z (pass) Edge Cases: Flag Combinations & Interactions (Tests 66-68) > Test 67: Conflicting flags: --quiet --debug > debug logs should be printed even when quiet is set (debug takes precedence)
2026-01-21T18:28:29.1154220Z (pass) Edge Cases: Flag Combinations & Interactions (Tests 66-68) > Test 67: Conflicting flags: --quiet --debug > log level behavior with conflicting flags
2026-01-21T18:28:29.1155194Z (pass) Edge Cases: Flag Combinations & Interactions (Tests 66-68) > Test 68: Conflicting flags: --no-tui --tui-debug > both flags can be set simultaneously
2026-01-21T18:28:29.1156408Z (pass) Edge Cases: Flag Combinations & Interactions (Tests 66-68) > Test 68: Conflicting flags: --no-tui --tui-debug > no runtime error when both flags are set
2026-01-21T18:28:29.1157479Z (pass) Edge Cases: Flag Combinations & Interactions (Tests 66-68) > Test 68: Conflicting flags: --no-tui --tui-debug > tui-debug is effectively disabled when no-tui is set
2026-01-21T18:28:29.1158790Z (pass) Edge Cases: Flag Combinations & Interactions (Tests 66-68) > Test 68: Conflicting flags: --no-tui --tui-debug > tui-debug works when tui is enabled
2026-01-21T18:28:29.1161029Z (pass) Edge Cases: Flag Combinations & Interactions (Tests 66-68) > Test 68: Conflicting flags: --no-tui --tui-debug > all tui flag combinations are handled without errors
2026-01-21T18:28:29.1161648Z
2026-01-21T18:28:29.1161892Z ##[endgroup]
2026-01-21T18:28:29.1161996Z
2026-01-21T18:28:29.1162226Z ##[group]src/**tests**/git/quality.test.ts:
2026-01-21T18:28:29.1177126Z (pass) git/quality > runPrePushQualityGates > returns success when no checks are configured [1.00ms]
2026-01-21T18:28:29.1180681Z (pass) git/quality > runPrePushQualityGates > returns success with skip info when no commands configured
2026-01-21T18:28:29.1183267Z (pass) git/quality > runPrePushQualityGates > skips execution in dryRun mode
2026-01-21T18:28:29.1187995Z (pass) git/quality > scanForSecrets > detects private keys [1.00ms]
2026-01-21T18:28:29.1190326Z (pass) git/quality > scanForSecrets > detects AWS access keys
2026-01-21T18:28:29.1193563Z (pass) git/quality > scanForSecrets > detects GitHub personal access tokens
2026-01-21T18:28:29.1195956Z (pass) git/quality > scanForSecrets > detects GitHub PAT new format
2026-01-21T18:28:29.1198561Z (pass) git/quality > scanForSecrets > detects Slack tokens [1.00ms]
2026-01-21T18:28:29.1200967Z (pass) git/quality > scanForSecrets > detects passwords in assignments
2026-01-21T18:28:29.1203736Z (pass) git/quality > scanForSecrets > detects API keys in assignments
2026-01-21T18:28:29.1206310Z (pass) git/quality > scanForSecrets > does not flag removed lines
2026-01-21T18:28:29.1217100Z (pass) git/quality > scanForSecrets > does not flag diff metadata lines [2.00ms]
2026-01-21T18:28:29.1219159Z (pass) git/quality > scanForSecrets > returns found: false when no secrets are present
2026-01-21T18:28:29.1221414Z (pass) git/quality > scanForSecrets > handles empty diff
2026-01-21T18:28:29.1223640Z (pass) git/quality > scanForSecrets > detects bearer tokens
2026-01-21T18:28:29.1226310Z (pass) git/quality > scanForSecrets > includes line numbers in results
2026-01-21T18:28:29.1229156Z (pass) git/quality > scanForSecrets > truncates long lines [1.00ms]
2026-01-21T18:28:29.1229661Z
2026-01-21T18:28:29.1230039Z ##[endgroup]
2026-01-21T18:28:29.1230217Z
2026-01-21T18:28:29.1230621Z ##[group]src/**tests**/git/index.test.ts:
2026-01-21T18:28:29.1251846Z (pass) git/index > checkPrMergeability > returns mergeable: true when PR is mergeable [1.00ms]
2026-01-21T18:28:29.1254893Z (pass) git/index > checkPrMergeability > returns mergeable: false when PR has conflicts
2026-01-21T18:28:29.1258780Z (pass) git/index > checkPrMergeability > returns determined: false when GitHub hasn't calculated mergeability yet [1.00ms]
2026-01-21T18:28:29.1261756Z (pass) git/index > checkPrMergeability > returns determined: false when gh command fails
2026-01-21T18:28:29.1265435Z (pass) git/index > checkPrMergeability > returns determined: false when JSON parsing fails
2026-01-21T18:28:29.1268583Z (pass) git/index > checkPrMergeability > returns success in dryRun mode [1.00ms]
2026-01-21T18:28:29.1273644Z (pass) git/index > checkMergeConflicts > returns no conflicts in dryRun mode
2026-01-21T18:28:29.1277400Z (pass) git/index > checkMergeConflicts > returns correct result structure [1.00ms]
2026-01-21T18:28:29.1283542Z (pass) git/index > getPrDetails > returns merged PR details with all fields
2026-01-21T18:28:29.1287017Z (pass) git/index > getPrDetails > returns not merged when PR state is not MERGED [1.00ms]
2026-01-21T18:28:29.1290939Z (pass) git/index > getPrDetails > returns checksPassed=false when some checks failed
2026-01-21T18:28:29.1294029Z (pass) git/index > getPrDetails > returns checksPassed=null when no checks present
2026-01-21T18:28:29.1297927Z (pass) git/index > getPrDetails > distinguishes PR not found from gh command failure (Gap 3) [1.00ms]
2026-01-21T18:28:29.1300551Z (pass) git/index > getPrDetails > detects gh command failures (auth issues)
2026-01-21T18:28:29.1304152Z (pass) git/index > getPrDetails > returns dry-run stub data
2026-01-21T18:28:29.1307644Z (pass) git/index > getPrDetails > validates PR merged to correct branch (Gap 1) [1.00ms]
2026-01-21T18:28:29.1308251Z
2026-01-21T18:28:29.1308528Z ##[endgroup]
2026-01-21T18:28:29.1308642Z
2026-01-21T18:28:29.1308889Z ##[group]src/**tests**/domain/resolveId.test.ts:
2026-01-21T18:28:29.1339583Z (pass) resolveId > resolves numeric ID to full ID [2.00ms]
2026-01-21T18:28:29.1348258Z (pass) resolveId > throws for invalid numeric ID [1.00ms]
2026-01-21T18:28:29.1353312Z (pass) resolveId > throws for non-numeric ID
2026-01-21T18:28:29.1374397Z (pass) buildIdMap > builds map with sequential short IDs [2.00ms]
2026-01-21T18:28:29.1374995Z
2026-01-21T18:28:29.1375559Z ##[endgroup]
2026-01-21T18:28:29.1375960Z
2026-01-21T18:28:29.1376088Z 23 tests failed:
2026-01-21T18:28:29.1376595Z (fail) git functions > isGitRepo > returns false outside git repo [12.00ms]
2026-01-21T18:28:29.1377440Z (fail) git functions > getCurrentBranch > returns current branch name [12.00ms]
2026-01-21T18:28:29.1378327Z (fail) git functions > branchExists > returns false for non-existing branch [12.00ms]
2026-01-21T18:28:29.1379244Z (fail) git functions > hasUncommittedChanges > returns false when no changes [12.00ms]
2026-01-21T18:28:29.1379725Z (fail) git functions > runGitCommand > handles dryRun [13.00ms]
2026-01-21T18:28:29.1380135Z (fail) git functions > createOrUpdatePr > handles dryRun [13.00ms]
2026-01-21T18:28:29.1380594Z (fail) git functions > isPrMerged > returns false when PR not found [12.00ms]
2026-01-21T18:28:29.1381230Z (fail) remote validation (Gap 6: No Remote Validation) > getRemoteUrl > returns null when no remote is configured [14.00ms]
2026-01-21T18:28:29.1382009Z (fail) remote validation (Gap 6: No Remote Validation) > getRemoteUrl > returns null when remote does not exist [15.00ms]
2026-01-21T18:28:29.1382723Z (fail) remote validation (Gap 6: No Remote Validation) > getRemoteUrl > returns HTTPS remote URL [15.00ms]
2026-01-21T18:28:29.1383374Z (fail) remote validation (Gap 6: No Remote Validation) > getRemoteUrl > returns SSH remote URL [16.00ms]
2026-01-21T18:28:29.1384025Z (fail) remote validation (Gap 6: No Remote Validation) > getRemoteUrl > returns Git protocol URL [15.00ms]
2026-01-21T18:28:29.1384689Z (fail) remote validation (Gap 6: No Remote Validation) > getRemoteUrl > handles URLs with .git suffix [15.00ms]
2026-01-21T18:28:29.1385381Z (fail) remote validation (Gap 6: No Remote Validation) > getRemoteUrl > handles URLs without .git suffix [15.00ms]
2026-01-21T18:28:29.1386353Z (fail) remote validation (Gap 6: No Remote Validation) > getRemoteUrl > returns push URL if different from fetch URL [18.00ms]
2026-01-21T18:28:29.1387161Z (fail) remote validation (Gap 6: No Remote Validation) > validateRemoteUrl > passes when no patterns are configured [15.00ms]
2026-01-21T18:28:29.1387975Z (fail) remote validation (Gap 6: No Remote Validation) > validateRemoteUrl > passes when URL matches allowed pattern [15.00ms]
2026-01-21T18:28:29.1388831Z (fail) remote validation (Gap 6: No Remote Validation) > validateRemoteUrl > fails when URL does not match any allowed pattern [15.00ms]
2026-01-21T18:28:29.1389708Z (fail) remote validation (Gap 6: No Remote Validation) > validateRemoteUrl > fails when remote points to different organization [15.00ms]
2026-01-21T18:28:29.1390559Z (fail) remote validation (Gap 6: No Remote Validation) > validateRemoteUrl > fails when remote points to different host [15.00ms]
2026-01-21T18:28:29.1391371Z (fail) remote validation (Gap 6: No Remote Validation) > validateRemoteUrl > fails when exact repository match differs [16.00ms]
2026-01-21T18:28:29.1392199Z (fail) remote validation (Gap 6: No Remote Validation) > validateRemoteUrl > returns actual URL even when validation fails [15.00ms]
2026-01-21T18:28:29.1393150Z (fail) remote validation (Gap 6: No Remote Validation) > validateRemoteUrl > returns valid result with null actual URL when remote does not exist [13.00ms]
2026-01-21T18:28:29.1393719Z
2026-01-21T18:28:29.1393961Z 826 pass
2026-01-21T18:28:29.1394122Z 23 fail
2026-01-21T18:28:29.1394279Z 2010 expect() calls
2026-01-21T18:28:29.1394591Z Ran 849 tests across 44 files. [10.63s]
2026-01-21T18:28:29.1508851Z ##[error]Process completed with exit code 1.
2026-01-21T18:28:29.1612914Z Post job cleanup.
2026-01-21T18:28:29.2377695Z [command]/usr/bin/git version
2026-01-21T18:28:29.2412202Z git version 2.52.0
2026-01-21T18:28:29.2481189Z Temporarily overriding HOME='/home/runner/work/\_temp/cf1e6acf-c43c-4da9-b5e0-32c9881d072d' before making global git config changes
2026-01-21T18:28:29.2482585Z Adding repository directory to the temporary git global config as a safe directory
2026-01-21T18:28:29.2487243Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/wreckit/wreckit
2026-01-21T18:28:29.2516076Z Removing SSH command configuration
2026-01-21T18:28:29.2522479Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
2026-01-21T18:28:29.2556062Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
2026-01-21T18:28:29.2816092Z Removing HTTP extra header
2026-01-21T18:28:29.2820570Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
2026-01-21T18:28:29.2854470Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
2026-01-21T18:28:29.3088670Z Removing includeIf entries pointing to credentials config files
2026-01-21T18:28:29.3089596Z [command]/usr/bin/git config --local --name-only --get-regexp ^includeIf\.gitdir:
2026-01-21T18:28:29.3110716Z includeif.gitdir:/home/runner/work/wreckit/wreckit/.git.path
2026-01-21T18:28:29.3111979Z includeif.gitdir:/home/runner/work/wreckit/wreckit/.git/worktrees/_.path
2026-01-21T18:28:29.3115233Z includeif.gitdir:/github/workspace/.git.path
2026-01-21T18:28:29.3116508Z includeif.gitdir:/github/workspace/.git/worktrees/_.path
2026-01-21T18:28:29.3121630Z [command]/usr/bin/git config --local --get-all includeif.gitdir:/home/runner/work/wreckit/wreckit/.git.path
2026-01-21T18:28:29.3142062Z /home/runner/work/\_temp/git-credentials-dc287f16-5c1a-479c-8f2b-fae9df0e3c4d.config
2026-01-21T18:28:29.3152591Z [command]/usr/bin/git config --local --unset includeif.gitdir:/home/runner/work/wreckit/wreckit/.git.path /home/runner/work/\_temp/git-credentials-dc287f16-5c1a-479c-8f2b-fae9df0e3c4d.config
2026-01-21T18:28:29.3186196Z [command]/usr/bin/git config --local --get-all includeif.gitdir:/home/runner/work/wreckit/wreckit/.git/worktrees/_.path
2026-01-21T18:28:29.3208285Z /home/runner/work/\_temp/git-credentials-dc287f16-5c1a-479c-8f2b-fae9df0e3c4d.config
2026-01-21T18:28:29.3217368Z [command]/usr/bin/git config --local --unset includeif.gitdir:/home/runner/work/wreckit/wreckit/.git/worktrees/_.path /home/runner/work/\_temp/git-credentials-dc287f16-5c1a-479c-8f2b-fae9df0e3c4d.config
2026-01-21T18:28:29.3248763Z [command]/usr/bin/git config --local --get-all includeif.gitdir:/github/workspace/.git.path
2026-01-21T18:28:29.3270146Z /github/runner_temp/git-credentials-dc287f16-5c1a-479c-8f2b-fae9df0e3c4d.config
2026-01-21T18:28:29.3279783Z [command]/usr/bin/git config --local --unset includeif.gitdir:/github/workspace/.git.path /github/runner_temp/git-credentials-dc287f16-5c1a-479c-8f2b-fae9df0e3c4d.config
2026-01-21T18:28:29.3310403Z [command]/usr/bin/git config --local --get-all includeif.gitdir:/github/workspace/.git/worktrees/_.path
2026-01-21T18:28:29.3332081Z /github/runner_temp/git-credentials-dc287f16-5c1a-479c-8f2b-fae9df0e3c4d.config
2026-01-21T18:28:29.3341325Z [command]/usr/bin/git config --local --unset includeif.gitdir:/github/workspace/.git/worktrees/_.path /github/runner_temp/git-credentials-dc287f16-5c1a-479c-8f2b-fae9df0e3c4d.config
2026-01-21T18:28:29.3374726Z [command]/usr/bin/git submodule foreach --recursive git config --local --show-origin --name-only --get-regexp remote.origin.url
2026-01-21T18:28:29.3602693Z Removing credentials config '/home/runner/work/\_temp/git-credentials-dc287f16-5c1a-479c-8f2b-fae9df0e3c4d.config'
2026-01-21T18:28:29.3742839Z Cleaning up orphan processes
