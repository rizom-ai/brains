# Changesets

This directory is used by [Changesets](https://github.com/changesets/changesets) to manage versioning and changelogs.

## Workflow

1. Make your changes
2. Run `bun changeset` to create a changeset describing what changed
3. Commit the changeset file with your code
4. When merged to main, the release workflow creates a "Version Packages" PR
5. Merging that PR publishes to npm and creates a GitHub release
