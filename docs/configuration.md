# Configuration

`deterministic-deps` reads `.deterministic-deps.yml` from the scan root by default. Action inputs override matching config values.

```yaml
mode: advisory
severity-threshold: low
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

## Validation

Malformed YAML fails the action with a clear parse error because the configured policy cannot be trusted. Invalid individual fields emit warnings and are ignored, so the action falls back to defaults or other valid config entries.

Examples that warn and fall back:

- `mode: report-only`
- `severity-threshold: urgent`
- `remote-validation: yes`
- `remote-timeout-ms: slow`
- `include: '**/*.tf'`
- `rules` or `ecosystems` values that are not booleans
- Unknown ecosystem names or option names

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

When `remote-validation: true`, the scanner validates pinned GitHub Action refs and GitHub-hosted git dependency commit refs against the GitHub commits API. Missing commits produce `remote/github-ref` findings. Rate limits, timeouts, and other network failures produce `remote/validation-error` findings with deterministic messages instead of stack traces.

Public GitHub commits can be checked without credentials. If `GITHUB_TOKEN` is available in the environment, it is sent to GitHub to support private repositories and higher rate limits. Enabling remote validation may disclose repository names and commit SHAs to GitHub and can add latency to CI runs.
