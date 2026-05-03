# Contributing

Thanks for helping make dependency declarations more deterministic.

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
