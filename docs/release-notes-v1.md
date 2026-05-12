# v1.0.0 Release Notes

`deterministic-deps` v1.0.0 is the first stable Marketplace-ready release of the packaged GitHub
Action.

- Marketplace: <https://github.com/marketplace/actions/deterministic-deps>
- Release: <https://github.com/Ozark-Security-Labs/deterministic-deps/releases/tag/v1.0.0>

## Highlights

- Advisory mode by default, with enforce mode available when projects are ready to fail CI.
- Static dependency determinism checks for GitHub Actions, container files, devcontainers,
  Terraform/OpenTofu, Node.js, Python, Go, Rust, JVM, and Ruby.
- Markdown reports, SARIF reports for GitHub code scanning, severity count outputs, and optional
  patch output for conservative safe exact-line remediation suggestions.
- Parser-backed checks for common YAML, JSON, TOML, HCL, XML, Gradle, and package manifest formats.
- `.deterministic-deps.yml` configuration for rule toggles, severity overrides, allowlists,
  include/exclude patterns, ecosystem options, and editor validation through the published JSON
  Schema.
- Opt-in remote validation for pinned GitHub.com and GitHub Enterprise Server commit refs with
  bounded timeout and retry behavior.
- Release validation for stale `dist/`, formatting, tests, type checking, CodeQL, audit checks, and
  packaged action smoke tests before moving the floating `v1` tag.

## Outputs

- `finding-count`
- `high-count`
- `medium-count`
- `low-count`
- `report-path`
- `sarif-path`
- `patch-path`

## Known Limits

- Static analysis is the default; package registries, dependency graph APIs, and source repositories
  are not resolved.
- Remote validation is opt in and limited to immutable GitHub commit refs.
- Container image digest existence is not checked against registries.
- Patch output is intentionally narrow and only includes high-confidence exact-line replacements.
- Parser coverage focuses on common dependency declaration shapes for v1.

## Release Blockers

No open blocker issues are required for a v1 advisory-mode release after the release checklist and
`v1 tag smoke` workflow pass.
