# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Read this first

`AGENTS.md` in the repo root is the authoritative contract for AI coding agents working here. Read it before making changes. Key non-negotiables that live there: the bundled-action contract (`dist/index.js` must be regenerated and committed when source affects runtime), v1 stays static-by-default (no network calls outside explicit opt-in remote validation), rule IDs are stable once documented, runtime dependencies come exclusively from `Ozark-Security-Labs/osl-*` forks (file a `.ozark/fork-proposals/<dep>.md` instead of editing `package.json`), and `npm run all` + `npm run format` + `git diff --check` is the pre-PR gate.

This file adds the architectural big picture that AGENTS.md does not cover.

## What this project is

A packaged TypeScript GitHub Action that statically scans dependency declarations across 9 ecosystems (GitHub Actions, containers, Terraform/OpenTofu, Node, Python, Go, Rust, JVM, Ruby) and flags non-deterministic references: floating action refs, container images without digests, missing lockfiles, unpinned git deps, dynamic version ranges. Runs in **advisory** mode by default, or **enforce** mode where findings at/above a configured severity threshold fail CI.

## Architecture

Entry point is `src/main.ts`. The flow is:

```
action inputs (action.yml)
        │
        ▼
src/config.ts  ── loads optional .deterministic-deps.yml, normalizes
        │       inputs, returns Config + ConfigDiagnostic[]
        │       (cascading precedence: action.yml defaults < YAML file < inputs)
        ▼
src/scanner.ts ── glob-based file discovery, orchestrates rule evaluation
        │
        ▼
src/rules/index.ts ── single registry of ecosystem rule handlers
        │             (checkNode, checkPython, checkTerraform, …)
        │             each returns Finding[]; per-rule severity overrides
        │             applied after rule execution
        ▼
src/remote.ts  ── (optional, async, isolated) GitHub API validation of
        │       pinned SHAs; respects GITHUB_TOKEN policy, dedupes, caches
        ▼
src/redaction.ts ── sanitizeFinding() strips credentials from messages,
        │           remediations, and suggestion text — runs LAST so
        │           nothing leaks into reports
        ▼
src/report.ts  ── renders markdown (job summary), SARIF, and unified-diff
                  patch; writes outputs and step summary
```

Supporting modules: `src/types.ts` (Finding, Config, ScanOptions, ScanResult, Severity, AllowlistEntry, RemoteTokenPolicy) and `src/constants.ts` (default globs, SHA/digest regexes, severity ordering).

## Non-obvious patterns

- **Diagnostics bubble, they don't throw.** Config parsing, input normalization, and remote validation all collect a `ConfigDiagnostic[]` rather than failing. `main.ts` surfaces them via `core.warning()`. When adding new config knobs, follow this pattern — return diagnostics for fallbacks, don't crash.
- **Cascading config precedence is explicit.** action.yml defaults < `.deterministic-deps.yml` < action inputs. Each layer can override the previous; users see _why_ a fallback occurred via diagnostics.
- **Allowlist matching is line-aware.** `AllowlistEntry` can scope by file, line, ruleId, and ecosystem — broad or surgical. Check `shouldKeepFinding()` before adding new suppression mechanisms.
- **Remote validation is isolated.** It runs _after_ static analysis, not inside rule handlers. Static checks stay fast and offline; remote findings are merged at the end. Do not blend network calls into rule handlers.
- **Redaction is the final pass.** Any new field that may contain a URL or token must flow through `sanitizeFinding()` in `redaction.ts`. Add a `redaction.test.ts` case for new fields.

## Common commands

Full pre-PR gate (AGENTS.md mandates this before opening a PR):

```bash
npm run all          # lint + test + tsc --noEmit + ncc bundle
npm run format       # prettier --check
git diff --check     # trailing whitespace
```

Individual:

```bash
npm ci               # install (pinned via package-lock.json)
npm run lint
npm run format:write
npm test             # jest --coverage --runInBand
npm run build        # tsc --noEmit (type-check only; tsc never emits)
npm run bundle       # ncc → dist/index.js + scripts/trim-dist.js cleanup
npm run audit        # npm audit --audit-level=high
```

Single test (no script wrapper exists; use Jest CLI passthrough):

```bash
npm test -- __tests__/config.test.ts
npm test -- --testNamePattern="severity threshold"
```

## The dist/ guardrail

`dist/index.js` is committed because GitHub Actions runs the action directly from the repo without `npm install`. CI enforces this via the `dist` job in `.github/workflows/ci.yml`, which runs `npm run bundle` then `git diff --exit-code -- dist/index.js dist/index.js.map dist/licenses.txt`. If you touch anything under `src/`, run `npm run bundle` and commit the updated `dist/` artifacts in the same change. Do not hand-edit `dist/`.

## Dogfood (Linux/bash)

AGENTS.md has a PowerShell dogfood snippet. Equivalent on Linux/macOS:

```bash
mkdir -p deterministic-deps-report
: > deterministic-deps-report/summary.md
GITHUB_WORKSPACE="$PWD" \
GITHUB_STEP_SUMMARY="$PWD/deterministic-deps-report/summary.md" \
  node dist/index.js
```

Expected result on a clean main: zero findings. If you change scanner behavior, run this against the repo itself before opening a PR.

## Tests

- `__tests__/fixtures/<ecosystem>/<scenario>/` — each fixture has manifest files + `expected-findings.json` (and optional `config.json`). New rule behavior normally lands as a fixture, not a hand-written test.
- `__tests__/goldens/` — exact report output goldens (markdown, SARIF). Markdown goldens are intentionally Prettier-ignored to match renderer output byte-for-byte.
- `__tests__/scanner.test.ts` mocks global `fetch` for remote-validation tests; preserve that pattern when adding remote-path tests.

## Tech & runtime constraints

TypeScript 6 with `strict: true`, `isolatedModules: true`, `target: ES2022`. Node `>=24` (action runs on `node24`). Package manager pinned to `npm@11.12.1`. Prettier: 100 cols, no semicolons, single quotes, no trailing commas. License: AGPL-3.0-only.

Runtime deps in `package.json` are git-URL entries pinned to full commit SHAs of `Ozark-Security-Labs/osl-*` forks, not registry installs. See `AGENTS.md` `## Dependency policy` for the full rule and the fork-proposal procedure.
