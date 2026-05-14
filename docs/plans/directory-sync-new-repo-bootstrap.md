# Plan: directory-sync new-repo bootstrap recovery

## Status

Proposed.

## Problem

`directory-sync` can leave a fresh local content repo in a broken git state during first-run bootstrap.

Observed local repro:

- app startup succeeds far enough to initialize plugins
- `directory-sync` fails with:
  - `fatal: You are on a branch yet to be born`
- the local repo under `brain-data/.git/HEAD` ends up as:
  - `ref: refs/heads/.invalid`

Once that happens, normal git commands against the content repo fail (`status`, `log`, branch resolution), and the operator has to delete the repo and start over.

This is not an OAuth/auth issue. In the repro case, local env + Bitwarden resolution was already working. The failure is specifically in new-repo bootstrap / recovery behavior inside `directory-sync`.

## Goal

Make fresh local content repos bootstrap cleanly and make broken placeholder HEAD states recover automatically.

`directory-sync` should never leave a local repo with `HEAD -> refs/heads/.invalid`.

## Scope

In scope:

- first-run bootstrap of a missing or empty local content repo
- clone failure fallback behavior for empty/new remotes
- recovery when a local repo already has invalid HEAD state
- regression coverage for these cases

Out of scope:

- changing CI env loading behavior
- changing app-local varlock guidance except where needed for repro docs
- changing auth/OAuth flows

## Repro summary

From a fresh local app with `directory-sync` enabled:

1. start the app locally
2. `directory-sync` begins initializing git
3. startup logs show:
   - `fatal: You are on a branch yet to be born`
4. inspect `.git/HEAD` in the content repo
5. see:

```txt
ref: refs/heads/.invalid
```

After that, the repo behaves as broken/unborn.

## Likely code paths

Relevant code paths to inspect first:

- `plugins/directory-sync/src/lib/git-repository.ts`
  - clone vs local-init fallback
- `plugins/directory-sync/src/lib/git-init.ts`
  - overall init flow
- `plugins/directory-sync/src/lib/git-branch.ts`
  - checkout / local-branch creation / initial commit behavior
- `plugins/directory-sync/src/lib/git-sync.ts`
  - initialization entry point

Current risk area:

- clone failure falls back to `git.init()` + `addRemote()`
- subsequent branch checkout/creation logic may not correctly handle an unborn repo, an empty remote, or a repo left with placeholder HEAD state
- recovery path may assume a valid branch or valid HEAD already exists

## Requirements

1. Fresh bootstrap must succeed when the local content repo does not exist.
2. Fresh bootstrap must succeed when the remote exists but is empty/new.
3. If local `.git/HEAD` is invalid or points at `.invalid`, init should repair or reclone instead of failing.
4. Branch setup must land on a valid branch (`main` by default, or configured branch).
5. Recovery must not require manual deletion by the operator.
6. Existing CI behavior should remain unchanged.

## Proposed approach

### 1. Make invalid HEAD an explicit recovery case

Before normal checkout logic, detect whether the repo is in one of these states:

- missing `.git/HEAD`
- unreadable `.git/HEAD`
- `HEAD` points to `refs/heads/.invalid`
- HEAD resolves to no valid branch in a way that indicates placeholder/broken bootstrap state

On detection, run a repair path instead of proceeding with normal checkout.

### 2. Split bootstrap states more explicitly

Handle these cases distinctly:

- no local repo + clone succeeds
- no local repo + clone fails because remote is empty/new
- local repo exists but has no commits yet
- local repo exists but HEAD is invalid/broken

Today these paths appear too collapsed around `clone -> fallback init -> checkout branch`.

### 3. Normalize branch creation for unborn repos

When the repo is local-init only and the target branch does not yet exist:

- create/check out the configured branch explicitly
- create an initial commit if needed
- ensure HEAD points at the configured branch before returning

Do not rely on incidental git defaults or library behavior when the repo is empty.

### 4. Add a repair-or-reclone strategy

For clearly broken bootstrap state, prefer deterministic recovery over trying to continue:

- either repair HEAD in place and continue bootstrap, or
- if the repo is disposable/uninitialized enough, remove broken git metadata and re-bootstrap cleanly

The main requirement is that startup self-heals.

## Test plan

Add regression tests covering at least:

1. **Missing local repo, non-empty remote**
   - clone/bootstrap succeeds
   - valid branch checked out

2. **Missing local repo, empty remote**
   - fallback local init succeeds
   - initial commit created if needed
   - HEAD points to configured branch

3. **Existing local repo with `HEAD -> refs/heads/.invalid`**
   - init repairs/reclones automatically
   - startup continues successfully

4. **Configured non-default branch**
   - branch other than `main` still bootstraps correctly

5. **No manual operator cleanup required**
   - repeated init after broken bootstrap recovers in-process

## Verification

This plan is done when:

- first startup no longer fails with `yet to be born` for new repos
- local content repos never end up with `HEAD -> refs/heads/.invalid`
- broken bootstrap state is recovered automatically
- regression tests cover empty/new repo bootstrap and invalid HEAD recovery

## Notes

A separate local DX fix already exists at the app layer: local varlock commands should use `--path ./` so `.env` and `.env.schema` are both visible. That fix is not the cause of this bug and should not be conflated with the git bootstrap issue.
