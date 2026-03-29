# Plan: Entity History via Git

## Context

Entities change over time but there's no way to see previous versions. Git already tracks every change — directory-sync commits on every entity create/update/delete. The history exists, it's just not accessible through the brain's tools.

## Design

A `system_history` tool that reads git log for a specific entity file. No new storage — just a read interface to what git already tracks.

### Tool

```
system_history {
  entityType: "post",
  id: "my-post",
  limit: 10           // optional, default 10
}
→ [
    { sha: "abc123", date: "2026-03-28T14:30:00Z", message: "Auto-sync: ...", summary: "+3 -1 lines" },
    { sha: "def456", date: "2026-03-27T10:00:00Z", message: "Auto-sync: ...", summary: "+15 -0 lines" },
  ]

system_history {
  entityType: "post",
  id: "my-post",
  sha: "def456"       // get content at specific version
}
→ { content: "---\ntitle: My Post\n---\nOriginal content..." }
```

### Implementation

The tool calls git commands on the brain-data directory:

- **List history**: `git log --format=... -- {entityType}/{id}.md`
- **Get version**: `git show {sha}:{entityType}/{id}.md`
- **Diff**: `git diff {sha1} {sha2} -- {entityType}/{id}.md`

Uses the existing `GitSync` class (which wraps `simple-git`) or calls git directly.

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

1. Add `system_history` tool to system tools
2. List mode: git log for entity file, return commit list
3. Version mode: git show for entity at specific commit
4. Handle: entity not found, git not configured, file never committed
5. Tests

### Phase 2: Diff and restore (optional)

1. Add diff mode: compare two versions
2. "Revert" is just the agent calling system_update with old content — no special tool needed
3. Tests

## Files affected

| Phase | Files | Nature                    |
| ----- | ----- | ------------------------- |
| 1     | ~2    | System tool, git commands |
| 2     | ~1    | Diff mode addition        |

## Verification

1. "Show me the history of post my-post" → returns commit list with dates
2. "What did this post look like 3 versions ago?" → returns old content
3. Works without git configured (returns "no history available")
4. No new data storage — reads from existing git repo
