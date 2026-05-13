# v1.1.0 Release Notes

`deterministic-deps` v1.1.0 adds new deterministic checks for GitHub Actions runners and Rust
toolchain files, hardens credential redaction, and restricts remote-validation token forwarding.

- Marketplace: <https://github.com/marketplace/actions/deterministic-deps>
- Release: <https://github.com/Ozark-Security-Labs/deterministic-deps/releases/tag/v1.1.0>

## Highlights

- Added `github-actions/versioned-runner` to flag floating GitHub-hosted runner labels:
  `ubuntu-latest`, `windows-latest`, and `macos-latest`.
- Added `rust/toolchain-version` to flag floating Rust channels in `rust-toolchain.toml` and
  legacy `rust-toolchain` files.
- Redacted credential-bearing dependency strings from findings, annotations, Markdown reports,
  SARIF results, summaries, and suggestion text.
- Suppressed SARIF fixes and patch hunks when replacement text contains credential material.
- Added `remote-token-policy`, defaulting to trusted-host `auto`, so `GITHUB_TOKEN` is sent only to
  trusted HTTPS GitHub API hosts during opt-in remote validation. Use `never` for fully
  unauthenticated remote validation.
- Updated this repository's workflows and examples to use versioned hosted runner labels while
  preserving static-by-default scanner behavior.

## Issues Closed

- #69: Versioned GitHub Actions runner labels.
- #70: Deterministic Rust toolchain files.
- #77: Redact credentials from user-visible findings.
- #78: Restrict remote-validation token forwarding to trusted GitHub API hosts.

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
- Patch output is intentionally narrow and only includes high-confidence exact-line replacements
  that are not credential-bearing.
- Parser coverage focuses on common dependency declaration shapes for v1.

## Release Blockers

No open blocker issues are required for this advisory-mode v1 release after the release checklist
and `v1 tag smoke` workflow pass.
