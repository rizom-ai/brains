# Release-tooling policy patch

`@changesets/assemble-release-plan@7.0.0` intentionally changed peer-dependent bumps. This repository retains its reviewed Changesets 2 policy: a minor or major peer release causes a major dependent bump unless the existing `onlyUpdatePeerDependentsWhenOutOfRange` option excludes it. Patch releases retain their normal range-based behavior.

The version-pinned Bun patch restores only that predicate; it is not a vulnerability suppression or a runtime dependency patch. Both the repository planner and the actual Node CLI must load the patched package. Any tooling upgrade must reassess/rebase this patch, run the peer-policy controls in `scripts/release-lane.test.ts`, and validate a clean frozen installation.

Prerelease history is migrated separately by `packages/build-tools/src/prerelease-history.ts`. Checks are read-only. A version operation validates existing history, exclusively moves consumed Markdown into `.changeset/pre/`, and atomically commits the new `pre.json` shape last. Failures roll back moved files without overwriting existing data. The transition accepts the repository's current legacy state only to perform this one-time data migration; it does not restore the removed Changesets config API.

Core/site queues remain separate. Stable exit remains one coordinated core operation, with the site version operation deferred. Local fixture tests do not establish publication, registry authentication, live runtime behavior, or deployment safety.

# Matrix adapter direct-room patch

`@beeper/chat-adapter-matrix@0.2.0` has no `isDM`, which the Chat SDK asks synchronously to route a message to its direct-message handlers, and it does not record a room it joins from an invite marked `is_direct` in the bot's `m.direct` account data, as Matrix clients do. Together they made every direct message from a person reach the brain as an unmentioned room message, which the routing policy ignores.

The version-pinned Bun patch adds both, and one hook: joining a direct invite records the room under the inviter in `m.direct` and in an in-memory set, so a message that arrives before the account data syncs back is already known, and `isDM` answers from that set and the cached `m.direct`. `inviteAutoJoin.accept` decides each invite in place of the fixed inviter allowlist, so `@brains/chat` can accept a trusted peer's bot without a restart. The lockfile and the version-keyed patch hold the adapter at 0.2.0. An upgrade must rebase or drop this patch and keep the direct-message tests in `interfaces/chat/test/matrix.test.ts` and a live direct message against a homeserver passing.
