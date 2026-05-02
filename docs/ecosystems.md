# Ecosystems

This action is static-only. It does not call registries, resolve package metadata, or rewrite files. Each ecosystem rule checks declarations and nearby lock/integrity files that can be evaluated from the repository contents.

## Supported Files

| Ecosystem          | Files                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------- |
| GitHub Actions     | `.github/workflows/*.yml`, `.github/workflows/*.yaml`, root `action.yml`, root `action.yaml` |
| Containers         | `Dockerfile`, `Dockerfile.*`, Compose YAML, `.devcontainer/devcontainer.json`                |
| Terraform/OpenTofu | `*.tf`, `.terraform.lock.hcl`                                                                |
| Node.js            | `package.json`, npm/Yarn/pnpm lockfiles                                                      |
| Python             | `requirements*.txt`, `pyproject.toml`, `Pipfile`, Poetry/uv/Pipenv lockfiles                 |
| Go                 | `go.mod`, `go.sum`                                                                           |
| Rust               | `Cargo.toml`, `Cargo.lock`                                                                   |
| JVM                | `pom.xml`, `build.gradle`, `build.gradle.kts`                                                |
| Ruby               | `Gemfile`, `Gemfile.lock`                                                                    |

## Design Notes

Broad language support means the action should avoid ecosystem-specific network resolution in v1. The rules favor clear, explainable checks over speculative interpretation.

Some package managers support deterministic installs through lockfiles rather than SHA pins in every declaration. In those ecosystems, missing lockfiles are treated as high-signal findings.
