# Contributing

`brains` is in **maintainer-only development mode**. Here's what that means and what you can do.

## TL;DR

| You want to...              | Do this                                                                                                               |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Report a bug                | [Open an issue](https://github.com/rizom-ai/brains/issues/new?template=bug_report.md)                                 |
| Suggest a feature           | [Open an issue](https://github.com/rizom-ai/brains/issues/new?template=feature_request.md) — read first, queued, slow |
| Fix a typo or broken link   | Open a small PR; will be reviewed                                                                                     |
| Build a substantial feature | Don't open a PR. Fork instead.                                                                                        |
| Report a security issue     | See [SECURITY.md](SECURITY.md) — **email, do not file an issue**                                                      |
| Build a third-party plugin  | Publish it as your own npm package; see [Plugin System](../plugin-system.md)                                          |

## Why maintainer-only

This is a solo-maintained project. Accepting and reviewing community PRs takes more time than I have right now, and a half-reviewed PR is worse than no PR. Keeping the codebase small and consistent is more important to me at this stage than maximizing contributor count.

This is **not permanent**. The triggers for opening up to community PRs:

- The plugin ecosystem visibly outgrows the maintainer's time
- A specific contributor demonstrates sustained quality and becomes a co-maintainer
- The project reaches `1.0` and the API surface stabilizes

When that happens, this document will be rewritten and the PR template will change.

## What I will respond to

- **Bug reports** with clear reproduction steps. These are the most valuable thing you can give me.
- **Small fixes** (typos, broken links, dead docs) as PRs.
- **Plugin questions** — how to use the plugin API, what hooks exist, etc.
- **Discussions of API design** in issue threads. I read everything.

## What I won't merge (right now)

- Large feature PRs from external contributors, even good ones. Open an issue and let me decide whether to build it or not.
- Refactors of internal services. The internals churn fast; an external refactor PR is almost guaranteed to conflict.
- New plugins added to the official set. Publish them as your own npm packages instead — that's what the plugin system is for.
- Style/lint cleanups across the codebase. The lint config is the source of truth; if it's not flagging something, it's fine.

## Response time

This is a side project for one person. Realistic expectations:

- **Bug reports**: triaged within ~1 week, fixed when I get to them
- **Feature requests**: read within ~1 week, may sit in the queue indefinitely
- **Small PRs**: reviewed within ~1 week
- **Security issues**: within 7 days (see [SECURITY.md](SECURITY.md))

If something is urgent, fork. The license is Apache-2.0; you have all the rights you need.

## Local development (for your own fork)

If you're forking to make changes:

```bash
git clone https://github.com/your-fork/brains.git
cd brains
bun install
bun run typecheck
bun test
```

Requirements:

- **Bun** ≥ 1.3.3 (package manager and runtime)
- A POSIX-ish OS (macOS, Linux; Windows via WSL)

The full pre-commit hook runs workspace check, deps check, secret scan, prettier, lint, typecheck, and the full test suite. You can replicate it with `bun run lint && bun run typecheck && bun test`.

## Code conventions (for accepted PRs and your fork)

- TypeScript strict mode
- Zod for runtime validation
- No `as` casts unless commented why
- No `eslint-disable` comments
- New code has tests
- New user-visible changes have a [changeset](https://github.com/changesets/changesets) (`bunx changeset`)
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`)

These are enforced by the pre-commit hook and CI. If your PR isn't following them, the build will tell you.

## Building a plugin

If you want to extend `brains` without contributing upstream, the plugin system is the right path. See:

- [Plugin System](../plugin-system.md) — architecture and lifecycle
- [Plugin Development Patterns](../plugin-development-patterns.md) — common patterns
- [Plugin Quick Reference](../plugin-quick-reference.md) — API cheat sheet
- [`plugins/examples/`](../../plugins/examples/) — minimal working examples

Publish your plugin as `@your-org/brain-plugin-cool-thing` on npm and reference it in `brain.yaml`. Your plugin doesn't need to be in this repository to work with `brains`.

## Questions

For "how do I do X" questions: open an issue with the `question` label. I'd rather answer it once in public than ten times in private.

Thank you for understanding the maintainer-only model. It's the difference between this project shipping and not shipping.
