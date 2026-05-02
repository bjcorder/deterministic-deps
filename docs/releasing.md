# Releasing

1. Create a branch and make source changes.
2. Run `npm run all`.
3. Confirm `dist/index.js` is updated and committed.
4. Merge through a pull request.
5. Create a semver tag such as `v1.0.0`.
6. Move the major tag, such as `v1`, to the same commit.
7. Publish a GitHub release and optionally publish the action to GitHub Marketplace.

Consumers can reference `bjcorder/deterministic-deps@v1`, but commit-SHA pinning gives the strongest supply-chain guarantees.
