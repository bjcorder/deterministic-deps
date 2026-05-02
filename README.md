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

## Outputs

| Output          | Description                     |
| --------------- | ------------------------------- |
| `finding-count` | Total findings.                 |
| `high-count`    | High severity findings.         |
| `medium-count`  | Medium severity findings.       |
| `low-count`     | Low severity findings.          |
| `report-path`   | Markdown report path.           |
| `sarif-path`    | SARIF report path when enabled. |

## Supported Ecosystems

V1 scans GitHub Actions, Docker and Compose files, devcontainers, Terraform/OpenTofu, npm/Yarn/pnpm, Python, Go, Rust, Maven/Gradle, and Ruby. See [docs/ecosystems.md](docs/ecosystems.md) and [docs/rules.md](docs/rules.md) for the rule catalog.

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

This action performs static analysis only. It does not fetch package registries, clone dependency sources, or rewrite dependency declarations. Please report vulnerabilities according to [SECURITY.md](SECURITY.md).
