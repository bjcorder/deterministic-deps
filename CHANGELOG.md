# Changelog

All notable changes to this project will be documented in this file.

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
- Added open-source project documentation and CI scaffolding.
