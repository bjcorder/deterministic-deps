# deterministic-deps report

Total findings: 2

High: 1
Medium: 1
Low: 0

| Severity | Rule | Ecosystem | Location | Message | Remediation |
| --- | --- | --- | --- | --- | --- |
| high | github-actions/sha-pin | github-actions | .github/workflows/ci.yml:7 | Action 'actions/checkout@v4' is pinned to 'v4', not a full commit SHA. | Replace branch, tag, or short SHA refs with a full 40-character commit SHA. |
| medium | containers/image-digest | containers | Dockerfile:1 | Container image 'node:20' is not pinned by digest. | Use an immutable image reference such as name:tag@sha256:<digest>. |
