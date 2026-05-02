# Configuration

`deterministic-deps` reads `.deterministic-deps.yml` from the scan root by default. Action inputs override matching config values.

```yaml
mode: advisory
severity-threshold: low

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
```

## Fields

| Field                | Description                                                               |
| -------------------- | ------------------------------------------------------------------------- |
| `mode`               | `advisory` or `enforce`.                                                  |
| `severity-threshold` | `low`, `medium`, or `high`; used only in enforce mode.                    |
| `include`            | Glob patterns to scan.                                                    |
| `exclude`            | Glob patterns to skip in addition to built-in vendor/build ignores.       |
| `rules`              | Map of rule id to `true` or `false`.                                      |
| `severity`           | Map of rule id to severity override.                                      |
| `allowlist`          | Finding suppressions by file glob, rule id, ecosystem, and optional line. |

Allowlist entries should be narrow and temporary. Prefer fixing declarations or adding lockfiles when practical.
