# Ecosystem Notes

The action uses conservative static checks by default. It does not resolve remote refs, inspect
package registries, or verify that container digests exist. Optional remote validation is limited to
checking pinned GitHub.com or GitHub Enterprise Server commit refs.

## SHA and Digest Native Ecosystems

GitHub Actions, Docker images, Terraform git modules, and git-based package dependencies can usually be pinned to immutable commits or content digests. These are high-signal checks and most violations are high severity.

## Lockfile Native Ecosystems

npm, Yarn, pnpm, Poetry, uv, Pipenv, Go, Rust, Bundler, Maven, and Gradle often rely on lockfiles or checksum files for deterministic resolution. For these ecosystems, the action checks for committed lock/integrity files and rejects common floating declarations.

## Parser Coverage

GitHub Actions workflows, Compose files, and devcontainer JSON files are parsed before rules are evaluated so comments and unrelated text are ignored. GitHub Actions parsing covers action references, reusable workflow references, runner labels, and simple matrix runner-label indirection. Terraform/OpenTofu checks are block-aware for module sources and provider constraints.

Rules are evaluated through a shared registry with per-rule metadata. Ecosystem parsers still share common helpers for YAML/JSON/TOML parsing, line lookup, SHA/digest detection, companion-file checks, severity overrides, and allowlists.

Node package manifests are parsed as JSON. The scanner evaluates `dependencies`, `devDependencies`, `peerDependencies`, `optionalDependencies`, string-valued `bundledDependencies`, `overrides`, `resolutions`, and `packageManager`. npm, Yarn, and pnpm lockfiles are parsed locally to confirm registry dependency coverage and integrity metadata. Git, GitHub shorthand, aliases, and URL/tarball specs are still checked for immutable commit or content-addressed references because a lockfile cannot make a floating source declaration safe for policy review.

Python requirements files are parsed into logical entries before evaluation, including line continuations, comments, options, hashes, editable installs, extras, direct references, and environment markers. `pyproject.toml` dependency arrays, Poetry dependency groups, and Pipfile package sections are parsed conservatively for lockfile requirements and git SHA checks.

Go module files are parsed by directive, including single-line and block `require`, `replace`, and `exclude` forms. Comments are ignored, and git replacements pass when they use a full commit reference or Go pseudo-version.

Rust manifests are parsed by dependency table, including package, workspace, build, dev, target dependency sections, per-package dependency subtables, and patch/replace override sections. Comments and unrelated strings are ignored, and git dependencies must include a full `rev` commit SHA rather than only a branch or tag. Rust toolchain files are scanned for floating channels; use exact versions or dated nightly channels for deterministic compiler selection.

Gemfiles are parsed as logical `gem` declarations, including grouped and multi-line declarations. Comments and unrelated strings are ignored, and git dependencies must use a full `ref` commit SHA rather than branch or tag options alone.

Maven `pom.xml` files are parsed for dependency, dependency management, parent, plugin, profile-scoped dependency, and referenced version-property declarations. XML comments and unrelated XML text are ignored. Maven wrapper distribution checksum metadata such as `.mvn/wrapper/maven-wrapper.properties` with `distributionSha256Sum` hardens the wrapper download, but it is not treated as dependency lock coverage for dynamic Maven versions.

Gradle Groovy and Kotlin build files are parsed for common dependency and plugin declarations while ignoring line comments, block comments, and unrelated strings. Dynamic Gradle versions are accepted when `gradle.lockfile`, files under `gradle/dependency-locks/`, or `gradle/verification-metadata.xml` are committed in the build file's project path. Set `ecosystems.jvm.allowDynamicVersionsWithGradleMetadata: false` to require fixed Gradle versions even when that metadata exists.

## Policy Options

Projects can tune lockfile and hash requirements with the `ecosystems` config block. This is intended for cases like library repositories that intentionally do not commit application lockfiles, or repositories that accept registry version ranges when a package manager lockfile is present.

Large repositories can also tune discovery with `include` and `exclude`. Default excludes prune
common generated and vendor directories before evaluation, but monorepos should add generated output
paths that are specific to their build system and can narrow `include` to the dependency ecosystems
they actively want to scan.

## Remediation Suggestions

Reports can include structured remediation suggestions for findings that have a precise replacement. SARIF includes fixes for safe exact-line replacements, and `patch: true` writes those safe replacements to a unified diff without editing source files.

The first supported safe patch is for one-line Cargo git dependencies that already contain a full commit SHA in the git URL but omit the explicit `rev` field. Other findings remain guidance-only unless the scanner can prove that a replacement is deterministic and scoped to one exact line.

## Remote Validation

Remote validation is opt in with `remote-validation: true`. When enabled, the scanner checks pinned GitHub Action SHAs and GitHub-hosted git dependency SHAs against the GitHub commits API. This distinguishes a syntactically immutable SHA from a SHA that GitHub can actually resolve.

Remote validation supports GitHub.com and GitHub Enterprise Server. The scanner uses `GITHUB_API_URL` when present, otherwise it uses `https://api.github.com` for GitHub.com and `<GITHUB_SERVER_URL>/api/v3` for GHES. Git dependency URL matching is limited to the configured `GITHUB_SERVER_URL` host, so remote validation does not attempt to validate refs from non-GitHub forges.

Remote validation does not clone repositories or resolve mutable tags. It uses bounded request timeouts and retries, validates at most 100 unique remote references per scan, reports missing refs as high-severity findings, and reports rate limits, authorization failures, timeouts, cap overflows, and transient API errors as low-severity validation errors. Public refs can be checked without credentials; by default, `GITHUB_TOKEN` is used only for trusted HTTPS GitHub API hosts. Set `remote-token-policy: never` to omit it for every remote-validation request.

## Known Limits

- The scanner avoids network calls unless `remote-validation` is enabled.
- It does not parse every legal grammar branch for every package manager.
- Remote validation checks GitHub.com and GitHub Enterprise Server commit refs only; non-GitHub forges and container registry digest validation are not implemented.
- Patch suggestions are intentionally limited to safe exact-line replacements and do not resolve newer refs or digests.
- It may flag library repositories that intentionally omit lockfiles. Use `allowlist` or rule configuration for those cases.
- Maven property resolution is limited to properties referenced directly from parsed version tags.

These limits keep v1 predictable while leaving room for deeper ecosystem-specific parsers later.
