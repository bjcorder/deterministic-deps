# Rules

`deterministic-deps` emits normalized findings with a rule id, ecosystem, file, line, severity, message, and remediation. Rules are intentionally conservative: they flag declarations that are clearly floating or missing the lock/integrity files needed for reproducible resolution.

## GitHub Actions

| Rule                           | Severity | Behavior                                                                                                           |
| ------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------ |
| `github-actions/sha-pin`       | high     | External `uses:` references must include a full 40-character commit SHA. Branches and tags are considered mutable. |
| `github-actions/full-sha`      | high     | Short SHAs are rejected because they are not full immutable refs.                                                  |
| `github-actions/docker-digest` | high     | `docker://` action references must include an `@sha256:` digest.                                                   |

Local actions such as `./.github/actions/build` are allowed.

## Containers

| Rule                      | Severity    | Behavior                                                                                                                                                                           |
| ------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `containers/image-digest` | high/medium | `FROM` and Compose-style `image:` references must include an `@sha256:` digest. `latest` and untagged images are high severity; tagged images without digests are medium severity. |

## Terraform and OpenTofu

| Rule                       | Severity | Behavior                                                                                                        |
| -------------------------- | -------- | --------------------------------------------------------------------------------------------------------------- |
| `terraform/git-module-sha` | high     | Git module sources must use `?ref=<40-character commit SHA>`.                                                   |
| `terraform/provider-lock`  | medium   | Provider version constraints must be exact unless `.terraform.lock.hcl` is committed next to the configuration. |

## Node.js

| Rule                          | Severity | Behavior                                                                                                                                                 |
| ----------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node/lockfile-required`      | high     | `package.json` dependencies require `package-lock.json`, `npm-shrinkwrap.json`, `yarn.lock`, or `pnpm-lock.yaml`.                                        |
| `node/non-deterministic-spec` | medium   | Dependency specs using ranges, tags, or git refs without commit SHAs are flagged. Exact versions, workspace/file links, and git commit SHAs are allowed. |

## Python

| Rule                             | Severity | Behavior                                                                            |
| -------------------------------- | -------- | ----------------------------------------------------------------------------------- |
| `python/hash-pinned-requirement` | medium   | Requirements should use exact `==` pins with `--hash=` entries.                     |
| `python/git-sha`                 | high     | Git requirements must pin a full commit SHA.                                        |
| `python/lockfile-required`       | high     | `pyproject.toml` and `Pipfile` require `poetry.lock`, `uv.lock`, or `Pipfile.lock`. |

## Go, Rust, JVM, and Ruby

| Rule                     | Severity | Behavior                                                                                        |
| ------------------------ | -------- | ----------------------------------------------------------------------------------------------- |
| `go/sum-required`        | high     | `go.mod` requires `go.sum`.                                                                     |
| `go/git-replace-sha`     | medium   | Git-based `replace` directives must be immutable.                                               |
| `rust/lockfile-required` | high     | `Cargo.toml` requires `Cargo.lock` for deterministic application and workspace builds.          |
| `rust/git-rev-sha`       | high     | Rust git dependencies must include `rev = "<40-character commit SHA>"`.                         |
| `jvm/dynamic-version`    | medium   | Maven and Gradle dynamic versions such as `SNAPSHOT`, `latest.*`, `+`, and ranges are rejected. |
| `ruby/lockfile-required` | high     | `Gemfile` requires `Gemfile.lock`.                                                              |
| `ruby/git-ref-sha`       | high     | Ruby git dependencies must include `ref: "<40-character commit SHA>"`.                          |
