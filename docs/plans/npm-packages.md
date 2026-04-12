# Plan: `@rizom/brain`

## Goal

Ship and support `@rizom/brain` as the real operator path for standalone brains.

## Open work

### 1. Carry the package from alpha to stable

The remaining release work is not "can we publish at all?" It is getting from the current alpha path to a stable `v0.1.0` release without drift between the published package and the intended operator experience.

### 2. Keep the published scaffold contract aligned

The published package, docs, and examples must keep matching the actual standalone instance shape.

That includes:

- `brain init` scaffold output
- `brain init --deploy` generated deploy assets
- local `package.json`-based instance shape
- local `src/site.ts` / `src/theme.css` authoring conventions
- published-path deploy/bootstrap docs

### 3. Keep bundled coverage correct

The runtime bundle must continue to include everything needed for supported checked-in and scaffolded app definitions.

That includes:

- supported in-tree brain models
- built-in site/theme package refs used by supported app configs
- any runtime assets needed for published-path boot

### 4. Verify the clean-machine install path

The most important remaining proof is still the full clean-machine path:

```bash
bun add -g @rizom/brain
brain init mybrain
cd mybrain
brain start
```

This needs to be treated as a release gate, not an informal spot check.

### 5. Coordinate with adjacent package work

Two related tracks still depend on this package staying correct:

- `docs/plans/external-plugin-api.md`
- `docs/plans/public-release-cleanup.md`

## Non-goals

- Node.js/npm runtime support
- splitting the framework into many separately published internal packages
- reviving old packageless instance conventions

## Verification

This plan is done when all of these are true:

1. the published package boots the standard standalone scaffold on a clean machine
2. generated deploy scaffolds match the documented operator path
3. supported built-in brain/site/theme references resolve correctly from the published bundle
4. docs/examples match the actual published behavior
5. stable release staging for `v0.1.0` is complete
