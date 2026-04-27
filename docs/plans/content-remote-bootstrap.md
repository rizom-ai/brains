# Content Remote Bootstrap Plan

## Problem

Test apps and docs brains need a reproducible way to use git-backed `directory-sync` content without relying on stale local `/tmp/*.git` state.

Current behavior is split:

- `seedContentPath` can copy local seed content into empty `brain-data`
- git sync can pull/push a content remote
- if `brain-data/.git` has a remote, seed copy is skipped

That means a fresh empty bare remote plus a local git checkout can result in no seeded content unless something populated the remote first.

## Ownership decision

Primary owner: `plugins/directory-sync`.

Why:

- it owns git-backed content sync
- it owns seed content behavior
- it already understands `seedContentPath`, `gitUrl`, initial sync, import/export
- content remote bootstrap is part of the directory-sync contract, not app/site logic

Secondary owner: `packages/brain-cli` may later expose a command wrapper.

Non-owner: `shell/app`; app boot should not grow git/seed-specific behavior.

## Desired behavior

When `directory-sync` is configured with both:

- `seedContentPath`
- `git.gitUrl` or `git.repo`

there should be a reproducible bootstrap path for a missing/empty content remote.

For local file remotes, first-class support should be enough for test apps and local docs brains:

```yaml
plugins:
  directory-sync:
    seedContentPath: ../../eval-content
    initialSync: true
    autoSync: true
    git:
      gitUrl: file:///tmp/relay-docs-test-content.git
```

Expected fresh behavior:

1. ensure bare remote exists if `gitUrl` is a local `file://` bare path and bootstrap is enabled
2. if remote has no `main`, seed it from `seedContentPath`
3. clone/pull content into `brain-data`
4. import content into entities
5. later runs pull from the populated remote

## Config shape

Add a small explicit config under `directory-sync.git`:

```yaml
plugins:
  directory-sync:
    seedContentPath: ../../eval-content
    git:
      gitUrl: file:///tmp/relay-docs-test-content.git
      bootstrapFromSeed: true
```

Default should be `true`, but bootstrap only applies to local `file://` remotes. Hosted/non-file remotes are left alone by this bootstrap path.

Open question: whether `bootstrapFromSeed` should support non-file remotes. Initial answer: no. Start with local `file://` bare remotes only.

## Implementation sketch

In `plugins/directory-sync`:

- add config field: `git.bootstrapFromSeed?: boolean`
- add helper near git sync code:
  - parse `file://` git URL
  - create bare remote if missing
  - check whether `refs/heads/main` exists
  - if missing:
    - create temp worktree
    - copy `seedContentPath`
    - commit
    - push `main`
- call helper before `gitSync.pull()` during initial sync setup

Guardrails:

- only run when `bootstrapFromSeed: true`
- only act on local `file://` remotes
- leave hosted/non-file remotes alone
- fail loudly if a local file remote needs bootstrap and `seedContentPath` is missing
- do not overwrite non-empty remotes

## Test app standard

Rover and Relay test apps should use the same pattern:

```yaml
plugins:
  directory-sync:
    seedContentPath: ../../eval-content
    autoSync: true
    initialSync: true
    git:
      repo: rizom-ai/<model>-test-content
      gitUrl: file:///tmp/<model>-<preset>-test-content.git
```

Each preset gets its own remote to avoid cross-preset contamination. `bootstrapFromSeed` defaults to true; only set `bootstrapFromSeed: false` when a local file remote should not be seeded from `seedContentPath`.

Test apps that render Preact/TSX site output must also include a local `tsconfig.json` next to `brain.yaml`:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "preact"
  }
}
```

Without this app-local config, Bun can resolve the wrong JSX runtime from the app cwd and SSR may emit empty HTML.

## CLI follow-up

A later CLI command can wrap the same directory-sync helper, for example:

```bash
brain content:bootstrap
```

But the implementation should live in `plugins/directory-sync`, not CLI-only code.

## Validation

Unit tests in `plugins/directory-sync`:

- creates missing local bare remote
- seeds empty local bare remote from `seedContentPath`
- does nothing when remote already has `main`
- fails when `bootstrapFromSeed: true` and `seedContentPath` missing
- leaves non-file remotes alone

Manual checks:

- reset Rover test app + remote, start preset, content appears
- reset Relay docs test app + remote, start preset, `brain-data/doc/*.md` appears
- rebuild Relay docs preview and inspect `/docs`
