# Rule Catalog

Each finding includes a stable rule id, ecosystem, severity, file, line, message, and remediation.

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
| `node/lockfile-coverage`      | medium   | Registry dependencies require npm, Yarn, or pnpm lockfile entries with integrity metadata.                                           |
| `node/non-deterministic-spec` | medium   | Ranges, tags, branch refs, and unpinned git specs are flagged. Exact semver, workspace/file links, and git commit SHAs are allowed. |

## Python

| Rule                             | Severity | Behavior                                                                            |
| -------------------------------- | -------- | ----------------------------------------------------------------------------------- |
| `python/hash-pinned-requirement` | medium   | `requirements*.txt` entries should use exact `==` pins with `--hash=` entries.      |
| `python/git-sha`                 | high     | Git dependencies must pin a commit SHA.                                             |
| `python/lockfile-required`       | high     | `pyproject.toml` and `Pipfile` require `poetry.lock`, `uv.lock`, or `Pipfile.lock`. |

## Go

| Rule                 | Severity | Behavior                                        |
| -------------------- | -------- | ----------------------------------------------- |
| `go/sum-required`    | high     | `go.mod` requires `go.sum`.                     |
| `go/git-replace-sha` | medium   | Git-like replacement directives must not float. |

## Rust

| Rule                     | Severity | Behavior                                                                           |
| ------------------------ | -------- | ---------------------------------------------------------------------------------- |
| `rust/lockfile-required` | high     | `Cargo.toml` requires `Cargo.lock` for deterministic application/workspace builds. |
| `rust/git-rev-sha`       | high     | Git dependencies must include `rev = "<40-character commit SHA>"`.                 |

## JVM

| Rule                  | Severity | Behavior                                                                              |
| --------------------- | -------- | ------------------------------------------------------------------------------------- |
| `jvm/dynamic-version` | medium   | Maven and Gradle declarations reject `SNAPSHOT`, `latest.*`, `+`, and range versions. |

## Ruby

| Rule                     | Severity | Behavior                                                      |
| ------------------------ | -------- | ------------------------------------------------------------- |
| `ruby/lockfile-required` | high     | `Gemfile` requires `Gemfile.lock`.                            |
| `ruby/git-ref-sha`       | high     | Git dependencies must use `ref: "<40-character commit SHA>"`. |
