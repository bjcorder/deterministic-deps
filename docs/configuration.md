# Configuration

`deterministic-deps` reads `.deterministic-deps.yml` from the scan root by default. Valid action inputs override matching config values.

A machine-readable JSON Schema is available at
[`docs/deterministic-deps.schema.json`](deterministic-deps.schema.json) for editor validation.

```yaml
mode: advisory
severity-threshold: low
patch: false
remote-validation: false
remote-timeout-ms: 5000
remote-retries: 1

include:
  - '**/package.json'
  - '**/Dockerfile'

exclude:
  - fixtures/**
  - vendor/**

rules:
  containers/image-digest: true
  python/hash-pinned-requirement: false

severity:
  node/non-deterministic-spec: low

allowlist:
  - file: legacy/**
    ruleId: containers/image-digest
  - file: tools/requirements.txt
    ecosystem: python
    line: 12

ecosystems:
  node:
    requireLockfile: true
    allowVersionRangesWithLockfile: false
  python:
    requireProjectLockfile: true
    requireRequirementHashes: true
  terraform:
    requireProviderLock: true
  go:
    requireGoSum: true
  jvm:
    allowDynamicVersionsWithGradleMetadata: true
  rust:
    requireLockfile: true
  ruby:
    requireLockfile: true
```

## Fields

| Field                | Description                                                               |
| -------------------- | ------------------------------------------------------------------------- |
| `mode`               | `advisory` or `enforce`.                                                  |
| `severity-threshold` | `low`, `medium`, or `high`; used only in enforce mode.                    |
| `patch`              | Write a unified diff with safe remediation suggestions.                   |
| `remote-validation`  | Opt in to remote validation of immutable GitHub commit refs.              |
| `remote-timeout-ms`  | Per-request remote validation timeout in milliseconds.                    |
| `remote-retries`     | Retry count for transient remote validation failures.                     |
| `include`            | Glob patterns to scan.                                                    |
| `exclude`            | Glob patterns to skip in addition to built-in vendor/build ignores.       |
| `rules`              | Map of rule id to `true` or `false`.                                      |
| `severity`           | Map of rule id to severity override.                                      |
| `allowlist`          | Finding suppressions by file glob, rule id, ecosystem, and optional line. |
| `ecosystems`         | Ecosystem-specific policy options for lockfile and hash requirements.     |

Allowlist entries should be narrow and temporary. Prefer fixing declarations or adding lockfiles when practical.

## Large Repositories

Default discovery scans supported dependency declaration files and skips common generated or vendor
directories, including `.git`, `node_modules`, `vendor`, `dist`, `build`, `target`, `.terraform`,
virtualenvs, and `__pycache__`.

For monorepos, narrow `include` to the ecosystems or package roots you want to evaluate, and add
repository-specific generated paths to `exclude`. Prefer anchored patterns for known workspace
layouts, such as:

```yaml
include:
  - services/**/package.json
  - infrastructure/**/*.tf

exclude:
  - services/**/fixtures/**
  - tools/generated/**
```

## Validation

Malformed YAML fails the action with a clear parse error because the configured policy cannot be trusted. Invalid individual fields emit warnings and are ignored, so the action falls back to defaults or other valid config entries.

Examples that warn and fall back:

- `mode: report-only`
- `severity-threshold: urgent`
- `patch: maybe`
- `remote-validation: yes`
- `remote-timeout-ms: slow`
- `include: '**/*.tf'`
- `rules` or `ecosystems` values that are not booleans
- Unknown ecosystem names or option names

Direct action inputs follow the same warning-and-fallback model. Invalid explicit inputs do not fail
the action by default; they emit GitHub Actions warnings and fall back to the matching config value
when available, otherwise to the action default.

Accepted direct input values:

| Input                                 | Accepted values                             |
| ------------------------------------- | ------------------------------------------- |
| `mode`                                | `advisory` or `enforce`                     |
| `severity-threshold`                  | `low`, `medium`, or `high`                  |
| `sarif`, `patch`, `remote-validation` | `true` or `false`                           |
| `remote-timeout-ms`, `remote-retries` | Non-negative integers such as `0` or `5000` |

## Editor Schema Usage

Editors that support YAML schemas can validate `.deterministic-deps.yml` as you type.

To associate the schema from the file itself, add this comment at the top:

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/Ozark-Security-Labs/deterministic-deps/main/docs/deterministic-deps.schema.json
```

For VS Code, you can also add a workspace setting:

```json
{
  "yaml.schemas": {
    "https://raw.githubusercontent.com/Ozark-Security-Labs/deterministic-deps/main/docs/deterministic-deps.schema.json": ".deterministic-deps.yml"
  }
}
```

The schema is for editor feedback and drift checks only. Runtime validation remains local to the
action and continues to warn and fall back for invalid individual fields.

## Ecosystem Options

| Option                                                  | Default | Description                                                                                                                                                                         |
| ------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ecosystems.node.requireLockfile`                       | `true`  | Require npm, Yarn, or pnpm lockfiles when `package.json` declares dependencies.                                                                                                     |
| `ecosystems.node.allowVersionRangesWithLockfile`        | `false` | Allow registry version ranges such as `^1.2.3` only when npm, Yarn, or pnpm lockfile coverage with integrity metadata is committed. Git and URL specs still require immutable refs. |
| `ecosystems.python.requireProjectLockfile`              | `true`  | Require `poetry.lock`, `uv.lock`, or `Pipfile.lock` for Python project files.                                                                                                       |
| `ecosystems.python.requireRequirementHashes`            | `true`  | Require logical `requirements*.txt` entries to use exact pins with `--hash=` values. Line continuations are evaluated as one entry.                                                 |
| `ecosystems.terraform.requireProviderLock`              | `true`  | Require exact provider versions or `.terraform.lock.hcl` for provider constraints.                                                                                                  |
| `ecosystems.go.requireGoSum`                            | `true`  | Require `go.sum` next to `go.mod`.                                                                                                                                                  |
| `ecosystems.jvm.allowDynamicVersionsWithGradleMetadata` | `true`  | Allow Gradle dynamic versions when `gradle.lockfile`, `gradle/dependency-locks/`, or `gradle/verification-metadata.xml` is committed in the project path.                           |
| `ecosystems.rust.requireLockfile`                       | `true`  | Require `Cargo.lock` next to `Cargo.toml`.                                                                                                                                          |
| `ecosystems.ruby.requireLockfile`                       | `true`  | Require `Gemfile.lock` next to `Gemfile`.                                                                                                                                           |

## Remote Validation

Remote validation is disabled by default. Static checks still reject mutable refs and accept values that look like full commit SHAs or digests without making network calls.

When `remote-validation: true`, the scanner validates pinned GitHub Action refs and GitHub-hosted git dependency commit refs against the GitHub commits API. Missing commits produce `remote/github-ref` findings. Rate limits, timeouts, authorization failures, and other network failures produce `remote/validation-error` findings with deterministic messages instead of stack traces.

Remote validation supports GitHub.com and GitHub Enterprise Server. In GitHub Actions, the scanner uses `GITHUB_API_URL` for commit API requests and `GITHUB_SERVER_URL` to identify Git dependency URLs hosted by the current GitHub server. Outside GitHub Actions, it defaults to `https://api.github.com` and `https://github.com`; for GHES, set `GITHUB_SERVER_URL` and optionally `GITHUB_API_URL`.

Public commits can be checked without credentials. If `GITHUB_TOKEN` is available in the environment, it is sent to the configured GitHub server to support private repositories and higher rate limits. Enabling remote validation may disclose repository names and commit SHAs to the configured GitHub server and can add latency to CI runs.

## Patch Output

Patch output is disabled by default. Set `patch: true` or the `patch` action input to write `deterministic-deps-report/suggestions.patch` and expose its path as `patch-path`.

Patch output never mutates repository files. It only includes suggestions marked safe for exact line replacement, and it skips a suggestion if the current file line no longer matches the finding metadata. Unsupported findings still appear in Markdown and SARIF reports without a patch hunk.
Credential-bearing replacement lines are also skipped so patch files do not preserve committed secrets.
