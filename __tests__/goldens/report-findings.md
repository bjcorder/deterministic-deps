# deterministic-deps report

Total findings: 3

High: 2
Medium: 1
Low: 0

| Severity | Rule | Ecosystem | Location | Message | Remediation |
| --- | --- | --- | --- | --- | --- |
| high | github-actions/sha-pin | github-actions | .github/workflows/ci.yml:7 | Action 'actions/checkout@v4' is pinned to 'v4', not a full commit SHA. | Replace branch, tag, or short SHA refs with a full 40-character commit SHA. |
| medium | containers/image-digest | containers | Dockerfile:1 | Container image 'node:20' is not pinned by digest. | Use an immutable image reference such as name:tag@sha256:<digest>. |
| high | rust/git-rev-sha | rust | Cargo.toml:2 | Rust git dependency 'demo = { git = "https://github.com/acme/demo.git?rev=0123456789abcdef0123456789abcdef01234567" }' does not pin a rev commit SHA. | Add rev = "<40-character commit SHA>" to git dependencies. |

## Suggestions

- Cargo.toml:2 Add explicit Cargo rev '0123456789abcdef0123456789abcdef01234567' from the existing git URL. (confidence: high; safe patch: yes)
  - Replace line 2 with: `demo = { git = "https://github.com/acme/demo.git?rev=0123456789abcdef0123456789abcdef01234567", rev = "0123456789abcdef0123456789abcdef01234567" }`
