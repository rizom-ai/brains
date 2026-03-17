# Fix: Seed Data Initialization Race Condition

## Problem

The `directory-sync` plugin's `copySeedContentIfNeeded` checks if `brain-data/` is empty before copying seed content. However, the `obsidian-vault` plugin creates `brain-data/_obsidian/{templates,fileClasses,bases}` directories on startup, which makes the directory non-empty before the seed copy runs.

Result: seed content (post, deck, etc.) is never copied on first boot.

## Additional Issue

The seed content files themselves have validation errors:

- `post/my-first-post.md` is missing required `excerpt` and `author` fields
- `deck/my-first-deck.md` uses `## Slide` headings instead of `---` slide separators

Both fixed in the same commit, but the root cause (init ordering) remains.

## Proposed Fix

Option A: **Exclude scaffold dirs from the emptiness check**

- `isBrainDataEmpty()` in `seed-content.ts` should ignore dirs like `_obsidian` that are created by other plugins
- Add a filter: `files.filter(f => !f.startsWith('_') && f !== '.git' && f !== '.gitkeep')`

Option B: **Run seed copy before plugin init**

- Move seed content copy to the app shell level, before any plugins initialize
- This guarantees seed content is in place before obsidian-vault or any other plugin runs

Option C: **Plugin dependency ordering**

- Ensure directory-sync's seed copy runs before obsidian-vault's scaffold
- Fragile, not recommended

## Recommendation

**Option A** is the simplest and least disruptive. Underscore-prefixed dirs are plugin scaffolding, not user content.
