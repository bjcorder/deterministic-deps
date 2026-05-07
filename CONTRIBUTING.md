# Contributing

Thanks for helping make dependency declarations more deterministic.

## Contributor License Agreement

Non-trivial contributions require agreement to the [Contributor License Agreement](CLA.md) before
they can be merged. The CLA lets contributors keep ownership of their work while granting the
project steward the rights needed to maintain the project, distribute it under open source licenses,
and offer commercial licenses for proprietary embedding.

If your employer or client may own your contribution, get written permission before submitting it.
Maintainers may request an entity agreement or other authorization for company-owned work.

Until an automated CLA check is configured, maintainers may ask contributors to acknowledge the CLA
in a pull request comment. Signed CLA records may contain personal information and should not be
committed to this repository.

## Development

```bash
npm ci
npm run all
```

Rules live in `src/rules/`, scanner/reporting code lives under `src/`, and tests live in
`__tests__/`.

## Pull Requests

- Keep rules conservative and explain remediation clearly.
- Add fixtures or unit tests for every new rule and false-positive fix.
- Run `npm run bundle` after source changes and commit `dist/`.
- Update docs when public behavior changes.

## Rule Fixtures

Rule behavior is covered by fixture cases under `__tests__/fixtures/<ecosystem>/<scenario>/`.
Each fixture directory contains dependency declaration files plus an `expected-findings.json` file
with normalized finding fields. Add `config.json` when a scenario needs rule toggles, severity
overrides, allowlists, or ecosystem policy options.

Report rendering is covered by reviewed golden files under `__tests__/goldens/`.

## Design Principles

- Static analysis only in v1.
- Prefer clear findings over clever inference.
- Make advisory adoption easy, then let users opt into enforcement.
