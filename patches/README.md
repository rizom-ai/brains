# Release-tooling policy patch

`@changesets/assemble-release-plan@7.0.0` intentionally changed peer-dependent bumps. This repository retains its reviewed Changesets 2 policy: a minor or major peer release causes a major dependent bump unless the existing `onlyUpdatePeerDependentsWhenOutOfRange` option excludes it. Patch releases retain their normal range-based behavior.

The version-pinned Bun patch restores only that predicate; it is not a vulnerability suppression or a runtime dependency patch. Both the repository planner and the actual Node CLI must load the patched package. Any tooling upgrade must reassess/rebase this patch, run the peer-policy controls in `scripts/release-lane.test.ts`, and validate a clean frozen installation.

Prerelease history is migrated separately by `packages/build-tools/src/prerelease-history.ts`. Checks are read-only. A version operation validates existing history, exclusively moves consumed Markdown into `.changeset/pre/`, and atomically commits the new `pre.json` shape last. Failures roll back moved files without overwriting existing data. The transition accepts the repository's current legacy state only to perform this one-time data migration; it does not restore the removed Changesets config API.

Core/site queues remain separate. Stable exit remains one coordinated core operation, with the site version operation deferred. Local fixture tests do not establish publication, registry authentication, live runtime behavior, or deployment safety.
