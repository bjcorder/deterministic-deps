# Contributing

Thanks for helping make dependency declarations more deterministic.

## Development

```bash
npm ci
npm run all
```

Rules live in `src/rules.ts`, scanner/reporting code lives under `src/`, and tests live in `__tests__/`.

## Pull Requests

- Keep rules conservative and explain remediation clearly.
- Add fixtures or unit tests for every new rule and false-positive fix.
- Run `npm run bundle` after source changes and commit `dist/`.
- Update docs when public behavior changes.

## Design Principles

- Static analysis only in v1.
- Prefer clear findings over clever inference.
- Make advisory adoption easy, then let users opt into enforcement.
