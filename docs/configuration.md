# Configuration

The action reads `.deterministic-deps.yml` by default. Use the `config` input to point to another file.

```yaml
mode: advisory
severity-threshold: low

include:
  - '**/package.json'
  - '**/requirements*.txt'

exclude:
  - vendor/**
  - examples/**

rules:
  node/non-deterministic-spec: true
  rust/lockfile-required: false

severity:
  containers/image-digest: high

allowlist:
  - file: examples/Dockerfile
    ruleId: containers/image-digest
  - ecosystem: python
    ruleId: python/hash-pinned-requirement
```

## Modes

`advisory` reports findings, emits annotations, writes a Markdown report, and writes SARIF when enabled. It does not fail the workflow.

`enforce` performs the same reporting but fails if at least one finding meets or exceeds `severity-threshold`.

## Globs

`include` and `exclude` accept standard glob patterns relative to the scan root. Inputs passed in the workflow override config-file include/exclude values.

Default excludes skip common dependency, build, cache, and vendor directories.

## Allowlist

Allowlist entries can match by file glob, rule id, ecosystem, and line. All provided fields must match the finding.

Allowlist entries are intended for documented exceptions. Prefer fixing dependency declarations when possible.
