# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

- Added a manual `v1 tag smoke` workflow and release documentation for validating semantic version
  tags before moving the floating `v1` tag.
- Enriched SARIF output with rule descriptions, documentation links, default severity metadata, and
  stable partial fingerprints for code scanning alerts.
- Added warning diagnostics for invalid direct action inputs while preserving config/default
  fallback behavior.
- Added a machine-readable JSON Schema for `.deterministic-deps.yml` with tests that keep schema
  values aligned with parser expectations.

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
