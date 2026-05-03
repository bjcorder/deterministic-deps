# Rule Catalog

Each finding includes a stable rule id, ecosystem, severity, file, line, message, and remediation.

Some findings also include structured remediation suggestions. Safe exact-line suggestions appear in Markdown reports, SARIF `fixes`, and optional patch output. Suggestions are conservative and are only emitted when the deterministic replacement is already present in the scanned source.

Rule ids, ecosystems, default severities, descriptions, and evaluators are registered in code. Tests validate this catalog against the documented rule ids so configuration controls such as `rules`, `severity`, and `allowlist` stay aligned with the scanner.

## GitHub Actions

| Rule                           | Severity | Behavior                                                                       |
| ------------------------------ | -------- | ------------------------------------------------------------------------------ |
| `github-actions/sha-pin`       | high     | External `uses:` references must include a full 40-character commit SHA.       |
| `github-actions/full-sha`      | high     | Short SHAs are flagged because they are not explicit enough for policy review. |
| `github-actions/docker-digest` | high     | `docker://` action references must include an `@sha256:` digest.               |

Local `./` and `../` actions are allowed.

## Containers

| Rule                      | Severity    | Behavior                                                                                                                                          |
| ------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `containers/image-digest` | medium/high | Dockerfile, Compose, and devcontainer image references should use `name:tag@sha256:<digest>`. `latest` and untagged references are high severity. |

## Terraform and OpenTofu

| Rule                       | Severity | Behavior                                                                  |
| -------------------------- | -------- | ------------------------------------------------------------------------- |
| `terraform/git-module-sha` | high     | Git module sources must use `?ref=<40-character commit SHA>`.             |
| `terraform/provider-lock`  | medium   | Non-exact provider constraints require a committed `.terraform.lock.hcl`. |

## Node.js

| Rule                          | Severity | Behavior                                                                                                                            |
| ----------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `node/lockfile-required`      | high     | `package.json` dependencies require a package manager lockfile.                                                                     |
| `node/lockfile-coverage`      | medium   | Registry dependencies require npm, Yarn, or pnpm lockfile entries with integrity metadata.                                          |
| `node/non-deterministic-spec` | medium   | Ranges, tags, branch refs, and unpinned git specs are flagged. Exact semver, workspace/file links, and git commit SHAs are allowed. |

## Python

| Rule                             | Severity | Behavior                                                                                 |
| -------------------------------- | -------- | ---------------------------------------------------------------------------------------- |
| `python/hash-pinned-requirement` | medium   | `requirements*.txt` entries should use exact `==` pins with `--hash=` entries.           |
| `python/git-sha`                 | high     | Git dependencies in requirements, `pyproject.toml`, and `Pipfile` must pin a commit SHA. |
| `python/lockfile-required`       | high     | `pyproject.toml` and `Pipfile` require `poetry.lock`, `uv.lock`, or `Pipfile.lock`.      |

## Go

| Rule                 | Severity | Behavior                                                                         |
| -------------------- | -------- | -------------------------------------------------------------------------------- |
| `go/sum-required`    | high     | `go.mod` requires `go.sum`.                                                      |
| `go/git-replace-sha` | medium   | Git-like `replace` directives must use immutable pseudo-versions or commit refs. |

## Rust

| Rule                     | Severity | Behavior                                                                                |
| ------------------------ | -------- | --------------------------------------------------------------------------------------- |
| `rust/lockfile-required` | high     | `Cargo.toml` requires `Cargo.lock` for deterministic application/workspace builds.      |
| `rust/git-rev-sha`       | high     | Git dependencies in dependency tables must include `rev = "<40-character commit SHA>"`. |

The Rust git revision rule can include a safe patch suggestion when a one-line dependency table already has a full commit SHA in the git URL, such as a `?rev=` query, but lacks the explicit Cargo `rev` field.

## JVM

| Rule                  | Severity | Behavior                                                                                                                                                                                                                                                                        |
| --------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `jvm/dynamic-version` | medium   | Maven dependency, parent, plugin, and version-property declarations reject `SNAPSHOT`, `latest.*`, `+`, and range versions. Gradle Groovy/Kotlin dependency and plugin declarations are parser-aware and may be satisfied by committed Gradle locking or verification metadata. |

## Ruby

| Rule                     | Severity | Behavior                                                              |
| ------------------------ | -------- | --------------------------------------------------------------------- |
| `ruby/lockfile-required` | high     | `Gemfile` requires `Gemfile.lock`.                                    |
| `ruby/git-ref-sha`       | high     | Gemfile git dependencies must use `ref: "<40-character commit SHA>"`. |

## Remote Validation

Remote validation rules run only when `remote-validation` is enabled.

| Rule                      | Severity | Behavior                                                                                           |
| ------------------------- | -------- | -------------------------------------------------------------------------------------------------- |
| `remote/github-ref`       | high     | A pinned GitHub commit SHA used by an action or GitHub-hosted git dependency could not be found.   |
| `remote/validation-error` | low      | Remote validation could not complete because of timeout, rate limit, authorization, or API errors. |
