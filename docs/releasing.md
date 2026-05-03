# Releasing

This repository publishes a packaged JavaScript action. The bundled `dist/index.js` is part of the release artifact and must match `src/`.

## Release Checklist

1. Run `npm ci`.
2. Run `npm run all`.
3. Run `npm run format`.
4. Confirm `git diff --exit-code dist package-lock.json` is clean.
5. Confirm `git diff --check` is clean.
6. Update `CHANGELOG.md` with the semantic version being released.
7. Confirm `action.yml`, `README.md`, and `docs/` describe the same supported inputs, outputs,
   ecosystems, and v1 limits.
8. Dogfood the bundled action against this repository and expect zero findings.
9. Merge the release-prep PR.

## Tagging v1

After the release-prep PR is merged:

1. Check out the validated release commit on `main`.
2. Create a semantic version tag such as `v1.0.0`.
3. Push the semantic version tag.
4. Run the `v1 tag smoke` workflow against the semantic version tag.
5. Move or create the major tag, such as `v1`, after the smoke test passes.

Do not create or move `v1` before the semantic tag smoke test passes.

## v1 Tag Smoke Test

Before creating or moving the floating `v1` major tag, validate the exact semantic tag that
Marketplace users will receive. The smoke test checks out the candidate tag and runs the packaged
action through GitHub Actions from that checkout, so it validates the committed `dist/` artifact
without requiring any code changes after the tag exists.

1. Create and push the semantic version tag:

   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

2. Run the `v1 tag smoke` workflow from the Actions tab with `action-ref` set to the semantic tag,
   for example `v1.0.0`.

   With the GitHub CLI:

   ```bash
   gh workflow run v1-tag-smoke.yml --ref main -f action-ref=v1.0.0
   gh run watch
   ```

3. Confirm the workflow passes. It verifies:
   - Advisory mode outputs: `finding-count`, severity counts, `report-path`, `sarif-path`, and an
     empty `patch-path`.
   - Enforce mode failure behavior with post-step validation still running.
   - SARIF enabled behavior by checking that a SARIF report path exists.
   - SARIF disabled behavior by checking that `sarif-path` is empty and no SARIF file is written.
   - Optional patch output behavior by checking that `patch-path` exists and is non-empty.

4. After the smoke test passes, create or move the `v1` tag to the validated semantic tag:

   ```bash
   git tag -f v1 v1.0.0
   git push origin refs/tags/v1 --force
   ```

Do not move `v1` before the semantic tag smoke test passes.

## Release Notes Checklist

The `CHANGELOG.md` entry for a v1 release should identify:

- Supported ecosystems.
- Advisory and enforce modes.
- Markdown, SARIF, count, and optional patch outputs.
- Static-by-default behavior and the opt-in scope of remote validation.
- Conservative remediation suggestions and known v1 limits.

## Versioning

Use semantic versioning:

- Patch: bug fixes and false-positive reductions.
- Minor: new rules, new ecosystems, new outputs, or new config options.
- Major: behavior changes that can fail workflows differently in enforce mode.

Major version tags should remain stable entrypoints for users while patch tags provide exact release provenance.
