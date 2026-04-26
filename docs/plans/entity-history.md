# Plan: Entity History Follow-on

Last updated: 2026-04-26

## Status

The core history feature has landed.

Current behavior:

- `directory-sync_history` lists git commit history for an entity.
- Passing `sha` returns the entity content at that version.
- The tool lives in directory-sync because `GitSync` owns repository access and file-path resolution.
- The agent can use the old content with `system_update` if the user asks to restore it.

## Remaining optional work

### Diff mode

Add a diff view only if users/operators need it often enough.

Possible shape:

```text
directory-sync_history {
  entityType: "post",
  id: "my-post",
  sha: "abc123",
  compareTo: "def456"
}
```

Implementation would add `diff(sha1, sha2, filePath)` to `IGitSync` / `GitSync` and expose that through the existing history tool.

### Restore UX

No dedicated restore tool is planned right now. Restore can remain an agent workflow:

1. call `directory-sync_history` with `sha`
2. review the old content with the user when appropriate
3. call `system_update` with that content

Only add a specialized restore helper if this workflow proves too clumsy.

## Non-goals

- New history storage outside git.
- A parallel system-level history tool.
- A custom version-control model for entities.

## Done when

One of these is true:

1. diff mode ships, or
2. we decide list/version history is enough and delete this follow-on plan.
