# Git-Sync Merge Conflict Fix Plan

## Goal

Git-sync should always work automatically without any user intervention. When conflicts occur, they should be resolved silently and deterministically.

## User Experience

- **Two people edit the same file simultaneously**: Last save wins, just like Google Docs
- **No error messages**: System handles everything silently
- **No manual intervention**: Ever
- **Continuous operation**: Sync never stops working

## Solution: Two Simple Changes

### 1. Automatic Conflict Resolution

Change pull operations to automatically resolve conflicts using "remote wins" strategy:

```typescript
await this.git.pull("origin", this.branch, {
  "--no-rebase": null,
  "--strategy=recursive": null,
  "-X": "theirs", // Remote version wins on conflicts
});
```

**What this means:**

- When the same line is edited by multiple people, the remote (last pushed) version wins
- Non-conflicting changes are merged normally
- Pull always succeeds, never fails due to conflicts

### 2. Safety Check for Conflict Markers

Add validation in commit() to prevent committing conflict markers:

```typescript
async commit(message?: string): Promise<void> {
  const files = await this.git.diff(["--name-only"]);

  for (const file of files) {
    const content = await fs.readFile(file, 'utf-8');
    if (content.includes('<<<<<<<') || content.includes('=======') || content.includes('>>>>>>>')) {
      // Don't commit, clean up instead
      await this.git.checkout(["--theirs", file]);
      await this.git.add([file]);
    }
  }

  await this.git.add(["-A"]);
  await this.git.commit(message);
}
```

**What this means:**

- If conflict markers somehow appear, they're detected and cleaned up
- Files with conflicts are automatically resolved to remote version
- Prevents the current bug of committing broken files

## Why This Works

1. **Deterministic**: Same result every time (remote wins)
2. **Simple**: No complex state management or recovery logic
3. **Continuous**: System never stops, always moves forward
4. **Safe**: Can't corrupt files with conflict markers

## Implementation Details

### Files to Modify

- `/plugins/git-sync/src/lib/git-sync.ts`
  - Update `pull()` method
  - Update `commit()` method

### Testing

```bash
# Terminal 1: Create conflicting change
echo "content1" > test.txt
git add . && git commit -m "change1" && git push

# Terminal 2: Create conflict
echo "content2" > test.txt
git add . && git commit -m "change2"
# Run sync - should auto-resolve to "content1" (remote)
```

## No Need For

- ❌ Merge state detection
- ❌ Abort strategies
- ❌ Retry logic
- ❌ Conflict notifications
- ❌ Manual resolution UI
- ❌ Backup strategies
- ❌ Configuration options

## Success Criteria

- Zero instances of committed conflict markers
- Sync never requires manual intervention
- Silent operation (no user-visible errors)
- Continuous operation even with concurrent edits

## Timeline

- Implementation: 2 hours
- Testing: 1 hour
- Deployment: Immediate

That's it. Keep it simple.
