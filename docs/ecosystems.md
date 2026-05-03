# Ecosystem Notes

The action uses conservative static checks. It does not resolve remote refs, inspect package registries, or verify that a digest exists.

## SHA and Digest Native Ecosystems

GitHub Actions, Docker images, Terraform git modules, and git-based package dependencies can usually be pinned to immutable commits or content digests. These are high-signal checks and most violations are high severity.

## Lockfile Native Ecosystems

npm, Yarn, pnpm, Poetry, uv, Pipenv, Go, Rust, Bundler, Maven, and Gradle often rely on lockfiles or checksum files for deterministic resolution. For these ecosystems, the action checks for committed lock/integrity files and rejects common floating declarations.

## Parser Coverage

GitHub Actions workflows, Compose files, and devcontainer JSON files are parsed before rules are evaluated so comments and unrelated text are ignored. Terraform/OpenTofu checks are block-aware for module sources and provider constraints.

Node package manifests are parsed as JSON. The scanner evaluates `dependencies`, `devDependencies`, `peerDependencies`, `optionalDependencies`, string-valued `bundledDependencies`, `overrides`, `resolutions`, and `packageManager`. npm, Yarn, and pnpm lockfiles are parsed locally to confirm registry dependency coverage and integrity metadata. Git, GitHub shorthand, aliases, and URL/tarball specs are still checked for immutable commit or content-addressed references because a lockfile cannot make a floating source declaration safe for policy review.

Python requirements files are parsed into logical entries before evaluation, including line continuations, comments, options, hashes, editable installs, extras, direct references, and environment markers. `pyproject.toml` dependency arrays, Poetry dependency groups, and Pipfile package sections are parsed conservatively for lockfile requirements and git SHA checks.

Go module files are parsed by directive, including single-line and block `require`, `replace`, and `exclude` forms. Comments are ignored, and git replacements pass when they use a full commit reference or Go pseudo-version.

Rust manifests are parsed by dependency table, including package, workspace, build, dev, and target dependency sections. Comments and unrelated strings are ignored, and git dependencies must include a full `rev` commit SHA rather than only a branch or tag.

Gemfiles are parsed as logical `gem` declarations, including grouped and multi-line declarations. Comments and unrelated strings are ignored, and git dependencies must use a full `ref` commit SHA rather than branch or tag options alone.

## Policy Options

Projects can tune lockfile and hash requirements with the `ecosystems` config block. This is intended for cases like library repositories that intentionally do not commit application lockfiles, or repositories that accept registry version ranges when a package manager lockfile is present.

## Known Limits

- The scanner intentionally avoids network calls.
- It does not parse every legal grammar branch for every package manager.
- It may flag library repositories that intentionally omit lockfiles. Use `allowlist` or rule configuration for those cases.
- It treats Maven and Gradle dynamic versions as non-deterministic but does not yet require a specific verification metadata format.

These limits keep v1 predictable while leaving room for deeper ecosystem-specific parsers later.
