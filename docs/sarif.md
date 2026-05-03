# SARIF and Code Scanning

`deterministic-deps` writes a Markdown report and, by default, a SARIF report under `deterministic-deps-report/` in the scan root.

| Output        | Default path                                         | Notes                                                                |
| ------------- | ---------------------------------------------------- | -------------------------------------------------------------------- |
| `report-path` | `deterministic-deps-report/report.md`                | Always written. Also summarized in the GitHub Actions job summary.   |
| `sarif-path`  | `deterministic-deps-report/deterministic-deps.sarif` | Written when `sarif: true`. Empty when SARIF generation is disabled. |

Set `sarif: false` to skip SARIF generation. In that case, `sarif-path` is an empty string and any upload step should be guarded.

SARIF rule metadata includes the rule description, default severity, ecosystem, and a `helpUri`
that links to the relevant section of `docs/rules.md`. Results also include stable
`partialFingerprints` derived from local finding fields so unchanged findings deduplicate more
reliably in GitHub code scanning across repeated scans.

## Permissions

Use GitHub's `github/codeql-action/upload-sarif` action to upload the generated SARIF to code scanning. The workflow needs:

```yaml
permissions:
  contents: read
  security-events: write
```

`security-events: write` is required for SARIF upload. `contents: read` lets the workflow check out the repository and lets code scanning associate results with source files. For private or internal repositories, GitHub may also require code scanning or GitHub Code Security features to be enabled for the repository.

## Advisory Mode

Advisory mode never fails the action, so SARIF upload can run as a normal follow-up step.

```yaml
name: dependency determinism

on:
  pull_request:
  push:
    branches: [main]

jobs:
  deterministic-deps:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      security-events: write
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd
      - id: deterministic-deps
        uses: bjcorder/deterministic-deps@<full-commit-sha>
        with:
          mode: advisory
          sarif: true
      - uses: github/codeql-action/upload-sarif@e46ed2cbd01164d986452f91f178727624ae40d7
        if: always() && steps.deterministic-deps.outputs.sarif-path != ''
        with:
          sarif_file: ${{ steps.deterministic-deps.outputs.sarif-path }}
          category: deterministic-deps
```

## Enforce Mode

In enforce mode, the action fails when findings meet or exceed `severity-threshold`. To preserve SARIF upload, run the action with `continue-on-error: true`, upload with `if: always()`, and then fail the job if the action's outcome was `failure`.

```yaml
name: dependency determinism

on:
  pull_request:
  push:
    branches: [main]

jobs:
  deterministic-deps:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      security-events: write
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd
      - id: deterministic-deps
        uses: bjcorder/deterministic-deps@<full-commit-sha>
        continue-on-error: true
        with:
          mode: enforce
          severity-threshold: medium
          sarif: true
      - uses: github/codeql-action/upload-sarif@e46ed2cbd01164d986452f91f178727624ae40d7
        if: always() && steps.deterministic-deps.outputs.sarif-path != ''
        with:
          sarif_file: ${{ steps.deterministic-deps.outputs.sarif-path }}
          category: deterministic-deps
      - name: Fail when deterministic-deps failed
        if: steps.deterministic-deps.outcome == 'failure'
        run: exit 1
```

## Pinning

The examples above pin external actions to full commit SHAs. Replace `<full-commit-sha>` with the immutable commit for the version of `bjcorder/deterministic-deps` you want to run. Tags are convenient for quick experiments, but this project recommends commit SHA pinning for workflows you enforce.

## Private Repositories

Public repositories on GitHub.com can upload code scanning SARIF. For private and internal repositories, GitHub code scanning availability depends on your account, organization, and repository security settings. If upload fails with a message that GitHub Code Security or GitHub Advanced Security must be enabled, enable the appropriate code security features or keep the SARIF as a workflow artifact/report instead of uploading it.
