# Public Release Cleanup Plan

## Status

Paused until the public plugin feature work is complete.

## Goal

Publish `rizom-ai/brains` as a clean public repo without exposing private history or private repo-only content.

## Locked constraints

- keep the current private repo as the long-term archive
- stage the public release at `rizom-ai/brains-temp`
- switch to the public URL only through the final double-rename
- keep `apps/rizom-ai`, `apps/rizom-work`, and `apps/rizom-foundation` in scope for the public monorepo
- keep `apps/yeehaa.io` and `apps/mylittlephoney` out of the public monorepo because they are already extracted
- do not resume this plan until the public plugin work is done

## Open work

### 1. Create and verify the archive snapshot

Before the public cutover:

- create a local mirror backup
- push a remote archive branch
- verify the archive reflects the cleaned post-audit state

### 2. Stage the public repo at `brains-temp`

From a fresh working clone of the cleaned tree:

- create the orphan commit
- push it to `rizom-ai/brains-temp`
- tag `v0.1.0`
- verify the GitHub file tree and rendered docs

### 3. Run release-gate verification on the staged public repo

Required checks on a fresh clone of the staged repo:

- `gitleaks detect --source . --no-git`
- `bun install`
- `bun run lint`
- `bun run typecheck`
- `bun test`
- `bun run build`

### 4. Run the published-package smoke test on a clean machine

Follow the documented install path literally on a machine that has never seen the repo.

Minimum gate:

```bash
bun add -g @rizom/brain
brain init mybrain
cd mybrain
brain start
```

If the README path fails, fix that before the public rename.

### 5. Do the double-rename and harden the public repo

After the staged repo and published package both pass:

- rename current `rizom-ai/brains` to the private archive name
- rename `rizom-ai/brains-temp` to `rizom-ai/brains`
- enable branch protection
- enable secret scanning / push protection / Dependabot
- verify the public URL in an incognito session

### 6. Post-launch cleanup

After the rename:

- rotate sensitive credentials as cheap insurance
- decide whether future development happens directly in public or via a private-to-public sync path
- announce only after the repo settings and docs are in the desired state

## Success criteria

- the public repo exists at `rizom-ai/brains`
- the private archive still exists with full history
- the public tree is gitleaks-clean
- the public repo builds and tests from a fresh clone
- the published `@rizom/brain` quickstart works on a clean machine
- public repo security settings are enabled
- `v0.1.0` points at the initial public commit
