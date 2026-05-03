# deterministic-deps

`deterministic-deps` is a GitHub Action that reports dependency declarations that can drift over time. It is language-agnostic, works by static analysis only, and favors SHA, digest, hash, exact-version, and lockfile based determinism.

The default mode is advisory: the action emits annotations, writes a Markdown report, and produces SARIF without failing CI. Switch to enforce mode when your project is ready to block non-deterministic declarations.

## Quick Start

```yaml
name: dependency determinism

on:
  pull_request:
  push:
    branches: [main]

jobs:
  deterministic-deps:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      security-events: write
    steps:
      - uses: actions/checkout@<full-commit-sha>
      - uses: bjcorder/deterministic-deps@v1
        with:
          mode: advisory
```

To fail builds once findings are actionable:

```yaml
- uses: bjcorder/deterministic-deps@v1
  with:
    mode: enforce
    severity-threshold: medium
```

## Code Scanning SARIF Upload

The action writes SARIF by default and exposes the generated path as `sarif-path`. Upload it with GitHub code scanning in advisory mode:

```yaml
name: dependency determinism

on:
  pull_request:
  push:
    branches: [main]

jobs:
  deterministic-deps:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      security-events: write
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd
      - id: deterministic-deps
        uses: bjcorder/deterministic-deps@v1
        with:
          mode: advisory
          sarif: true
      - uses: github/codeql-action/upload-sarif@e46ed2cbd01164d986452f91f178727624ae40d7
        if: always() && steps.deterministic-deps.outputs.sarif-path != ''
        with:
          sarif_file: ${{ steps.deterministic-deps.outputs.sarif-path }}
          category: deterministic-deps
```

In enforce mode, keep the scan step non-blocking long enough to upload the SARIF, then fail the job afterward if the action found threshold-matching findings:

```yaml
name: dependency determinism

on:
  pull_request:
  push:
    branches: [main]

jobs:
  deterministic-deps:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      security-events: write
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd
      - id: deterministic-deps
        uses: bjcorder/deterministic-deps@v1
        continue-on-error: true
        with:
          mode: enforce
          severity-threshold: medium
          sarif: true
      - uses: github/codeql-action/upload-sarif@e46ed2cbd01164d986452f91f178727624ae40d7
        if: always() && steps.deterministic-deps.outputs.sarif-path != ''
        with:
          sarif_file: ${{ steps.deterministic-deps.outputs.sarif-path }}
          category: deterministic-deps
      - name: Fail when deterministic-deps failed
        if: steps.deterministic-deps.outcome == 'failure'
        run: exit 1
```

The Marketplace entrypoint is `bjcorder/deterministic-deps@v1`. For workflows that enforce policy,
pin to the full commit SHA for the validated release behind `v1`. See
[docs/sarif.md](docs/sarif.md) for permissions, private repository notes, SARIF upload, and report
path details.

## Inputs

| Input                | Default                    | Description                                                                     |
| -------------------- | -------------------------- | ------------------------------------------------------------------------------- |
| `mode`               | `advisory`                 | Use `advisory` to report only or `enforce` to fail at the configured threshold. |
| `path`               | `.`                        | Repository path to scan.                                                        |
| `config`             | `.deterministic-deps.yml`  | Optional YAML config path, relative to `path`.                                  |
| `include`            | supported dependency files | Newline or comma-separated glob patterns.                                       |
| `exclude`            | common vendor/build dirs   | Newline or comma-separated glob patterns.                                       |
| `severity-threshold` | `low`                      | Minimum severity that fails the action in enforce mode.                         |
| `sarif`              | `true`                     | Write a SARIF report for code scanning upload.                                  |
| `patch`              | `false`                    | Write a unified diff with safe remediation suggestions.                         |
| `remote-validation`  | `false`                    | Opt in to remote validation of immutable GitHub commit references.              |
| `remote-timeout-ms`  | `5000`                     | Per-request timeout for remote validation.                                      |
| `remote-retries`     | `1`                        | Retry count for transient remote validation failures.                           |

Invalid direct inputs emit GitHub Actions warnings and fall back deterministically to the matching
config value when one exists, or to the default above. Accepted values are `advisory` or `enforce`
for `mode`; `low`, `medium`, or `high` for `severity-threshold`; `true` or `false` for boolean
inputs; and non-negative integers for remote timeout and retry inputs.

## Outputs

| Output          | Description                     |
| --------------- | ------------------------------- |
| `finding-count` | Total findings.                 |
| `high-count`    | High severity findings.         |
| `medium-count`  | Medium severity findings.       |
| `low-count`     | Low severity findings.          |
| `report-path`   | Markdown report path.           |
| `sarif-path`    | SARIF report path when enabled. |
| `patch-path`    | Patch report path when enabled. |

## Supported Ecosystems

V1 scans GitHub Actions, Docker and Compose files, devcontainers, Terraform/OpenTofu, npm/Yarn/pnpm, Python, Go, Rust, Maven/Gradle, and Ruby. See [docs/ecosystems.md](docs/ecosystems.md) and [docs/rules.md](docs/rules.md) for the rule catalog.

## Remote Validation

By default, the action is fully offline and only checks whether immutable refs are syntactically pinned. Set `remote-validation: true` to make GitHub API requests that confirm pinned GitHub Action SHAs and GitHub-hosted git dependency SHAs exist.

Remote validation may reveal repository names and commit SHAs to GitHub, can be affected by API rate limits, and may be slower than static analysis. Public refs can be validated without credentials; when `GITHUB_TOKEN` is present, the action sends it to GitHub for higher rate limits and private repository access.

## Remediation Suggestions

Findings may include structured suggestions when the scanner can point to a precise replacement. Markdown reports show these suggestions, SARIF includes `fixes` for safe exact-line replacements, and `patch: true` writes a unified diff to `deterministic-deps-report/suggestions.patch` without modifying source files.

Suggestions are intentionally conservative. The action does not resolve latest SHAs, tags, versions, or digests automatically, so most findings remain guidance-only until a deterministic replacement is already present in the source.

## Configuration

```yaml
mode: advisory
severity-threshold: low

exclude:
  - fixtures/**

rules:
  containers/image-digest: true
  node/non-deterministic-spec: true

severity:
  python/hash-pinned-requirement: low

allowlist:
  - file: legacy/Dockerfile
    ruleId: containers/image-digest
```

See [docs/configuration.md](docs/configuration.md) for the full schema.

## Local Development

```bash
npm ci
npm run all
```

The bundled `dist/index.js` is committed so the action can run directly from repository refs. Run `npm run bundle` after source changes and commit the updated `dist/` output.

## Security

This action performs static analysis by default. It does not fetch package registries, clone dependency sources, or rewrite dependency declarations. Remote validation is explicit opt-in and limited to checking immutable GitHub commit refs. Please report vulnerabilities according to [SECURITY.md](SECURITY.md).
