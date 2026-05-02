# Releasing

This repository publishes a packaged JavaScript action. The bundled `dist/index.js` is part of the release artifact and must match `src/`.

## Release Checklist

1. Run `npm ci`.
2. Run `npm run all`.
3. Confirm `git diff --exit-code dist package-lock.json` is clean.
4. Update `CHANGELOG.md`.
5. Create a semantic version tag such as `v1.0.0`.
6. Move or create the major tag, such as `v1`, after validating the release.

## Versioning

Use semantic versioning:

- Patch: bug fixes and false-positive reductions.
- Minor: new rules, new ecosystems, new outputs, or new config options.
- Major: behavior changes that can fail workflows differently in enforce mode.

Major version tags should remain stable entrypoints for users while patch tags provide exact release provenance.
