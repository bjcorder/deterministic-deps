# deterministic-deps

[![CI](https://github.com/bjcorder/deterministic-deps/actions/workflows/ci.yml/badge.svg)](https://github.com/bjcorder/deterministic-deps/actions/workflows/ci.yml)

`deterministic-deps` is a GitHub Action that scans dependency declaration files and reports references that are not deterministic. It is language-agnostic, static-only, and focused on SHA pinning, container digests, exact versions with committed lockfiles, and ecosystem-native integrity files.

The default mode is advisory: the action reports findings without failing CI. Switch to enforce mode when you are ready to block non-deterministic declarations.

## Quick Start

```yaml
name: deterministic deps

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
      - uses: actions/checkout@v4
      - uses: bjcorder/deterministic-deps@v1
        with:
          mode: advisory
```

To fail CI when findings are present:

```yaml
- uses: bjcorder/deterministic-deps@v1
  with:
    mode: enforce
    severity-threshold: medium
```

For maximum supply-chain determinism, pin this action by commit SHA instead of a moving tag.

## Inputs

| Input                | Default                   | Description                                                                           |
| -------------------- | ------------------------- | ------------------------------------------------------------------------------------- |
| `mode`               | `advisory`                | Use `advisory` to report only, or `enforce` to fail when findings meet the threshold. |
| `path`               | `.`                       | Repository path to scan.                                                              |
| `config`             | `.deterministic-deps.yml` | Optional config file path, relative to `path`.                                        |
| `include`            | supported files           | Newline or comma-separated glob patterns to include.                                  |
| `exclude`            | dependency/build dirs     | Newline or comma-separated glob patterns to exclude.                                  |
| `severity-threshold` | `low`                     | Minimum severity that fails the action in `enforce` mode.                             |
| `sarif`              | `true`                    | Write a SARIF report in addition to Markdown.                                         |

## Outputs

| Output          | Description                             |
| --------------- | --------------------------------------- |
| `finding-count` | Total number of findings.               |
| `high-count`    | Number of high severity findings.       |
| `medium-count`  | Number of medium severity findings.     |
| `low-count`     | Number of low severity findings.        |
| `report-path`   | Path to the Markdown report.            |
| `sarif-path`    | Path to the SARIF report, when enabled. |

## Supported Ecosystems

The v1 scanner covers GitHub Actions, Dockerfiles, Docker Compose, devcontainers, Terraform/OpenTofu, npm/Yarn/pnpm, Python requirements and project files, Go modules, Rust Cargo manifests, Maven, Gradle, and Ruby Bundler.

See [docs/rules.md](docs/rules.md), [docs/ecosystems.md](docs/ecosystems.md), and [docs/configuration.md](docs/configuration.md) for the full rule and configuration model.

## Local Development

```bash
npm install
npm run all
```

The packaged action entrypoint is committed at `dist/index.js`. Run `npm run bundle` after source changes and verify that `dist/` is up to date before releasing.
