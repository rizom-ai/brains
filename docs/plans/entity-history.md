# Plan: Entity History via Git

## Context

Entities change over time but there's no way to see previous versions. Git already tracks every change — directory-sync commits on every entity create/update/delete. The history exists, it's just not accessible through the brain's tools.

## Design

A `directory-sync_history` tool in the directory-sync plugin. No new storage — just a read interface to what git already tracks.

### Why directory-sync, not system tools?

- `GitSync` class already has `simple-git` and knows the data directory
- `IGitSync` interface is the clean seam to add `log()` and `show()`
- Same pattern as existing `directory-sync_sync` and `directory-sync_status`
- No new cross-plugin dependencies — system tools don't know about git
- The agent doesn't care about tool namespace — it calls whatever tool answers the question

### Tool

```
directory-sync_history {
  entityType: "post",
  id: "my-post",
  limit: 10           // optional, default 10
}
→ [
    { sha: "abc123", date: "2026-03-28T14:30:00Z", message: "Auto-sync: ...", summary: "+3 -1 lines" },
    { sha: "def456", date: "2026-03-27T10:00:00Z", message: "Auto-sync: ...", summary: "+15 -0 lines" },
  ]

directory-sync_history {
  entityType: "post",
  id: "my-post",
  sha: "def456"       // get content at specific version
}
→ { content: "---\ntitle: My Post\n---\nOriginal content..." }
```

### Implementation

Add methods to `IGitSync` / `GitSync`:

- **`log(filePath, limit)`**: `git log --format=... -- {filePath}` → commit list
- **`show(sha, filePath)`**: `git show {sha}:{filePath}` → file content at version
- **`diff(sha1, sha2, filePath)`** (Phase 2): `git diff {sha1} {sha2} -- {filePath}` → diff output

The tool resolves `entityType + id` to a file path (`{entityType}/{id}.md`) and delegates to GitSync.

### What the agent can do

- "Show me the history of this post" → list of changes with dates
- "What did this note look like yesterday?" → content at a previous commit
- "What changed in this post?" → diff between versions
- "Revert this post to the previous version" → get old content, call system_update

### Prerequisites

- Directory-sync with git configured (most brains have this)
- If git is not configured, the tool returns "no history available"

## Steps

### Phase 1: History tool

1. Add `log(filePath, limit)` and `show(sha, filePath)` to `IGitSync` interface and `GitSync` class
2. Add `directory-sync_history` tool in `plugins/directory-sync/src/tools/`
3. List mode: resolve entity path, call `gitSync.log()`, return commit list
4. Version mode: call `gitSync.show()`, return content at commit
5. Handle: entity not found, git not configured (no gitSync instance), file never committed
6. Unit tests for GitSync.log() and GitSync.show()
7. Unit tests for the tool handler (mock IGitSync)

### Phase 2: Diff and restore (optional)

1. Add `diff(sha1, sha2, filePath)` to `IGitSync` / `GitSync`
2. Extend tool with diff mode: `sha` + `compareTo` params
3. "Revert" is just the agent calling system_update with old content — no special tool needed
4. Tests

## Files affected

| Phase | Files | Nature                                                 |
| ----- | ----- | ------------------------------------------------------ |
| 1     | ~4    | IGitSync interface, GitSync class, history tool, tests |
| 2     | ~2    | GitSync diff method, tool diff mode                    |

## Verification

1. "Show me the history of post my-post" → returns commit list with dates
2. "What did this post look like 3 versions ago?" → returns old content
3. Works without git configured (returns "no history available")
4. No new data storage — reads from existing git repo
5. Existing directory-sync tests still pass
6. `bun run typecheck` clean, `bun run lint` clean
