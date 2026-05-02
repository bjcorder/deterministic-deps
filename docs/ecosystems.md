# Ecosystem Notes

The action uses conservative static checks. It does not resolve remote refs, inspect package registries, or verify that a digest exists.

## SHA and Digest Native Ecosystems

GitHub Actions, Docker images, Terraform git modules, and git-based package dependencies can usually be pinned to immutable commits or content digests. These are high-signal checks and most violations are high severity.

## Lockfile Native Ecosystems

npm, Yarn, pnpm, Poetry, uv, Pipenv, Go, Rust, Bundler, Maven, and Gradle often rely on lockfiles or checksum files for deterministic resolution. For these ecosystems, the action checks for committed lock/integrity files and rejects common floating declarations.

## Parser Coverage

GitHub Actions workflows, Compose files, and devcontainer JSON files are parsed before rules are evaluated so comments and unrelated text are ignored. Terraform/OpenTofu checks are block-aware for module sources and provider constraints.

## Known Limits

- The scanner intentionally avoids network calls.
- It does not parse every legal grammar branch for every package manager.
- It may flag library repositories that intentionally omit lockfiles. Use `allowlist` or rule configuration for those cases.
- It treats Maven and Gradle dynamic versions as non-deterministic but does not yet require a specific verification metadata format.

These limits keep v1 predictable while leaving room for deeper ecosystem-specific parsers later.
