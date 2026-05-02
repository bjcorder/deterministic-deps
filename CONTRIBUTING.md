# Contributing

Thanks for helping improve `deterministic-deps`.

## Development

```bash
npm install
npm run all
```

Rule changes should include unit tests with both passing and failing examples. Keep rules conservative and remediation messages actionable.

## Pull Requests

- Describe the rule or behavior change.
- Include tests for new findings and non-findings.
- Run `npm run all`.
- Rebuild `dist/index.js` with `npm run bundle` when source changes.

## Rule Philosophy

Prefer checks that can be explained from the file contents alone. Avoid network lookups, registry-specific heuristics, and autofix behavior unless the project explicitly adopts them later.
