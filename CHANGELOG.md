# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

- Fixed Rust git dependency scanning so per-package dependency subtables and Cargo patch/replace override sections cannot bypass the `rust/git-rev-sha` rule.

## 1.1.0 - 2026-05-13

- Added a GitHub Actions runner-label rule that flags floating hosted labels such as
  `ubuntu-latest`, `windows-latest`, and `macos-latest`.
- Added Rust toolchain file checks for floating `stable`, `beta`, and `nightly` channels.
- Redacted credential-bearing dependency strings from findings, reports, SARIF, and annotations.
- Restricted remote-validation `GITHUB_TOKEN` forwarding to trusted HTTPS GitHub API hosts, with
  `remote-token-policy: never` for fully unauthenticated remote validation.
- Reduced GitHub Actions token permissions for CI and CodeQL workflows.
- Added explicit vulnerability reporting links to the security policy.
- Documented intentional floating Dockerfile fixtures and the Scorecard test-fixture dismissal
  rationale.
- Removed vulnerable real package names from parser fixtures to reduce security alert noise.
- Polished post-release docs with canonical Marketplace, release, install, and schema links.
- Improved early v1 feedback intake and maintainer triage guidance for false positives,
  confusing findings, and setup friction.
- Upgraded `@actions/core` to 3.0.1 and verified the bundled Node 24 action output continues
  to run through the committed CommonJS `dist/index.js` artifact.
- Future versions of deterministic-deps are licensed under AGPL-3.0-only. Previous MIT-licensed
  releases remain available under their original terms.

## 1.0.0 - 2026-05-03

- Published the v1 GitHub Action interface for advisory and enforce modes.
- Set package and action metadata for the stable Marketplace `v1.0.0` release.
- Supported static dependency determinism checks for GitHub Actions, container files,
  Terraform/OpenTofu, Node.js, Python, Go, Rust, JVM, and Ruby.
- Added Markdown reports, SARIF reports for code scanning, count outputs, and optional patch output
  for conservative safe exact-line remediation suggestions.
- Added parser-backed checks for GitHub Actions workflows, Compose files, devcontainer JSON,
  Terraform/OpenTofu blocks, Node manifests and lockfiles, Python requirements/project files, Go
  modules, Rust manifests, Gemfiles, and Maven/Gradle files.
- Added `.deterministic-deps.yml` configuration with rule toggles, severity overrides, allowlists,
  include/exclude patterns, ecosystem options, and a machine-readable JSON Schema.
- Added diagnostics for malformed config, invalid config fields, and invalid direct action inputs
  with deterministic fallback behavior.
- Added opt-in remote validation for pinned GitHub commit refs with bounded timeout/retry behavior.
- Added GitHub Enterprise Server URL handling for opt-in remote validation through GitHub Actions
  `GITHUB_API_URL` and `GITHUB_SERVER_URL` environment variables.
- Added enriched SARIF metadata, rule documentation links, default severity metadata, and stable
  partial fingerprints for code scanning alerts.
- Added release validation workflows, including a manual `v1 tag smoke` workflow for validating a
  semantic version tag before moving the floating `v1` tag.
- Added release-readiness audit and whitespace checks to CI and release validation.
- Added scanner guardrail coverage for many dependency files and deeply nested default excludes.
- Documented v1 limits: static analysis by default, no package registry resolution, no container
  digest existence checks, no broad autofix, and remote validation limited to GitHub commit refs.

## 0.1.0

- Initial TypeScript GitHub Action implementation.
- Added advisory and enforce modes.
- Added static rules for GitHub Actions, containers, Terraform/OpenTofu, Node.js, Python, Go, Rust, JVM, and Ruby.
- Added parser-backed YAML and JSON checks for GitHub Actions, Compose, and devcontainer image references.
- Added block-aware Terraform module and provider checks.
- Added ecosystem-specific config options for lockfile and hash policies.
- Added config validation diagnostics for invalid fields and malformed YAML.
- Added a fixture-based rule test matrix and golden report tests.
- Added Markdown and SARIF report generation.
- Added structured remediation suggestions, SARIF fixes, and optional patch output for safe exact-line replacements.
- Added a rule registry with code metadata for documented rule ids and default severities.
- Added open-source project documentation and CI scaffolding.
