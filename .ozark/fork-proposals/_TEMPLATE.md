# Fork proposal — `<dep-name>`

Canonical template. Copy this file as `.ozark/fork-proposals/<dep>.md` (replace `<dep>` with the upstream package name) and fill every field. Leave none blank.

A coding agent writing this proposal MUST NOT modify any manifest file (`package.json`, `Cargo.toml`, `go.mod`) or any lockfile. The proposal IS the agent's only change. The maintainer runs the fork-and-trim workflow (`Ozark-Security-Labs/.github/docs/fork-and-trim-workflow.md`) and opens any follow-up consumer PRs.

---

```yaml
dep:
  name: <upstream package name, e.g. `glob`>
  upstream_url: <github URL>
  version: <version under consideration>

consumer:
  repo: deterministic-deps
  trigger: <which file / feature triggered the need>

why:
  problem: <what is being solved>
  alternatives_tried: <stdlib options, existing osl-* forks, hand-rolled code — be honest>

surface_used:
  - <specific API / module / function the consumer needs>
  - <another, if any>

risk_notes:
  loc: <approx total LOC of upstream>
  network: <does it touch the network? where?>
  filesystem: <FS reads/writes outside the consumer's CWD?>
  exec: <build scripts, native bindings, proc-macros, postinstall hooks?>
  recent_cves: <links to upstream advisories from the last 24 months, if any>
  maintainer_activity: <last release date, open issue count, single-maintainer risk>
  license: <SPDX identifier, e.g. MIT / Apache-2.0>

proposed_fork:
  name: osl-<dep-name>
  notes: <anything that affects the fork name or shape>
```
