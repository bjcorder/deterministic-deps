# AGENTS.md

Guidance for coding agents working in this repository.

## Project Overview

`deterministic-deps` is a packaged TypeScript GitHub Action. It statically scans dependency declaration files and reports non-deterministic references such as floating GitHub Action refs, container images without digests, missing lockfiles, unpinned git dependencies, and dynamic dependency versions.

The action is advisory by default and can be configured to fail CI in enforce mode.

## Repository Layout

- `action.yml`: GitHub Action metadata. Keep inputs, outputs, and `runs.using: node24` in sync with implementation and docs.
- `src/`: TypeScript source.
  - `main.ts`: Action entrypoint and GitHub Actions I/O.
  - `scanner.ts`: File discovery and scan orchestration.
  - `rules.ts`: Rule evaluation.
  - `config.ts`: Config loading and validation.
  - `report.ts`: Markdown and SARIF report rendering.
  - `types.ts`: Shared public/internal types.
- `dist/`: Bundled action output committed for GitHub Action consumers.
- `__tests__/`: Jest tests.
  - `fixtures/`: Fixture-based rule matrix.
  - `goldens/`: Reviewed report output goldens.
- `docs/`: User-facing rule, configuration, ecosystem, and release docs.
- `.github/workflows/`: CI, CodeQL, and release validation workflows.

## Development Commands

Use `npm.cmd` on Windows PowerShell if `npm` is blocked by execution policy.

```bash
npm ci
npm run lint
npm test
npm run build
npm run bundle
npm run format
npm run all
```

`npm run all` is the primary pre-PR check. It runs lint, tests, typecheck, and bundle.

For dependency audit:

```bash
npm audit
```

In sandboxed environments this may require network approval.

## Bundled Action Contract

This is a JavaScript action, so `dist/index.js` must be committed whenever source changes affect runtime behavior. Run:

```bash
npm run bundle
```

The bundle command uses `ncc` and then `scripts/trim-dist.js` to normalize generated trailing whitespace.

Do not hand-edit generated `dist/` files except for an emergency, and explain any such edit clearly.

## Testing Expectations

Add or update tests for every behavior change.

Rule behavior should normally be covered with fixtures:

- Put fixture repositories under `__tests__/fixtures/<ecosystem>/<scenario>/`.
- Each fixture directory must include `expected-findings.json`.
- Add `config.json` when testing rule disables, severity overrides, allowlists, or ecosystem options.
- Keep expected findings normalized to stable fields: `ruleId`, `ecosystem`, `file`, `line`, and `severity`.

Report rendering is covered by exact golden files in `__tests__/goldens/`.

Markdown goldens are intentionally ignored by Prettier so they can match renderer output exactly.

## Rule Design Principles

- Keep v1 static by default. Do not add network calls unless an issue explicitly asks for opt-in remote validation.
- Prefer conservative findings over clever inference.
- Keep rule IDs stable once documented.
- Findings should include clear remediation text.
- Avoid noisy false positives in comments, examples, unrelated strings, and generated/vendor directories.
- Use parser-backed checks where practical. Regex checks are acceptable for loose formats, but add fixtures for edge cases.
- Preserve advisory mode as the default; enforce mode should only fail based on configured severity thresholds.

## Configuration Behavior

Config is loaded from `.deterministic-deps.yml` by default.

Important config features:

- `mode`
- `severity-threshold`
- `include` / `exclude`
- `rules`
- `severity`
- `allowlist`
- `ecosystems`

Malformed YAML should fail clearly. Invalid individual fields should warn and fall back to defaults or other valid config entries.

## Supply Chain Policy

This project should model the behavior it recommends:

- Pin npm dependency versions exactly in `package.json`.
- Commit `package-lock.json`.
- Pin external GitHub Actions in workflows to full commit SHAs.
- Prefer container image digests in examples when concrete images are used.
- Keep static analysis offline unless a feature explicitly introduces opt-in network validation.

## Documentation Updates

Update docs when public behavior changes:

- `README.md` for user-facing quick start, inputs/outputs, or common workflows.
- `docs/rules.md` for rule IDs, severity, and behavior.
- `docs/configuration.md` for config schema.
- `docs/ecosystems.md` for ecosystem support and known limits.
- `CHANGELOG.md` for notable changes.

## PR Readiness

Before opening or updating a PR, run:

```bash
npm run all
npm run format
git diff --check
```

Dogfood the bundled action when scanner behavior changes:

```powershell
$env:GITHUB_WORKSPACE=(Get-Location).Path
$summary=Join-Path (Get-Location).Path 'deterministic-deps-report\summary.md'
New-Item -ItemType Directory -Force deterministic-deps-report | Out-Null
New-Item -ItemType File -Force $summary | Out-Null
$env:GITHUB_STEP_SUMMARY=$summary
node dist/index.js
```

Expected dogfood result for this repo should normally be zero findings.

## Git Notes

- Prefer feature branches named `feat/<short-topic>`.
- Commit messages should follow Conventional Commit style, for example `feat: ...`, `fix: ...`, `test: ...`, or `docs: ...`.
- Do not mix unrelated feature work into an existing PR branch.
- Do not rewrite or revert user changes unless explicitly asked.
