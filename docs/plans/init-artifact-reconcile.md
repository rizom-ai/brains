# Plan: brain init Artifact Reconciliation

Last updated: 2026-04-08

## Problem

`brain init` currently behaves like a one-shot fresh scaffold.

It always writes the conventional instance artifacts (`brain.yaml`, `README.md`, `.env.example`, `.gitignore`, `tsconfig.json`, `package.json`) and only adds deploy artifacts (`config/deploy.yml`, `.kamal/hooks/pre-deploy`, `.github/workflows/deploy.yml`) when `--deploy` is passed.

That causes two issues:

1. **Existing app directories drift** when new conventional artifacts are added later.
2. The CLI cannot be used to **repair / complete** an instance scaffold from its canonical source of truth: `brain.yaml`.

The desired invariant is broader than Kamal:

> For any instance directory with a valid `brain.yaml`, the CLI should be able to generate all missing conventional artifacts idempotently.

This applies to both base artifacts and deploy artifacts.

## Goal

Make `brain init` reconciliation-oriented:

- On a fresh directory: create the full scaffold as today.
- On an existing directory with `brain.yaml`: create only the missing conventional artifacts.
- With `--deploy`: also create missing deploy artifacts.
- Never overwrite existing files by default.

## Non-goals

- No interactive conflict resolution in this pass.
- No `--force` overwrite mode in this pass.
- No deep YAML schema migration or rewrite of existing `brain.yaml`.
- No attempt to backfill arbitrary user-custom files outside the conventional scaffold set.

## Canonical artifacts

### Base artifacts

- `brain.yaml`
- `README.md`
- `.env.example`
- `.gitignore`
- `tsconfig.json`
- `package.json` (part of the conventional lightweight instance package shape; provides the local execution boundary and dependency pinning)
- `.env` only when `apiKey` is provided

### Deploy artifacts

- `config/deploy.yml`
- `.kamal/hooks/pre-deploy`
- `.github/workflows/deploy.yml`

## Design

### 1. Treat `brain.yaml` as the canonical source of truth

If `brain.yaml` already exists, derive scaffold context from it instead of recomputing from CLI defaults.

Minimum fields to derive:

- `brain`
- `domain`

This ensures generated artifacts (README, deploy files, etc.) reflect the actual instance config.

### 2. Switch from unconditional writes to write-if-missing

Introduce a helper that:

- creates parent directories as needed
- writes the file only when it does not already exist
- preserves existing files untouched
- supports executable chmod for hooks

### 3. Keep artifact rendering centralized

Reuse the current render functions (`writeReadme`, `writeDeployYml`, etc.) or refactor them into content-returning helpers, but keep one canonical implementation per artifact.

### 4. Preserve current CLI surface

No new command required in this pass.

`brain init` should simply become idempotent:

- fresh dir → full scaffold
- existing dir → fill gaps
- `--deploy` → fill deploy gaps too

## Implementation outline

1. Add `readExistingBrainYaml(dir)` helper
   - lightweight parse for `brain:` and `domain:`
   - return `undefined` when file absent
2. Compute scaffold context from:
   - existing `brain.yaml` if present
   - otherwise CLI options/defaults
3. Add `writeIfMissing()` helper
4. Update scaffold flow:
   - only write `brain.yaml` when absent
   - always attempt to create the other conventional artifacts via `writeIfMissing`
   - only add deploy artifacts when `options.deploy`
5. Leave `.env` behavior unchanged except it should also be write-if-missing

## Test plan

### Existing tests to preserve

- fresh scaffold still creates all expected files
- `--deploy` still creates deploy artifacts
- generated config/deploy.yml remains model/domain-independent template

### New tests

1. **existing dir with only `brain.yaml`**
   - `scaffold()` creates missing base artifacts
   - does not overwrite `brain.yaml`
2. **existing dir with `brain.yaml` + existing README**
   - README remains unchanged
3. **existing dir with `brain.yaml`, `--deploy` true**
   - adds `config/deploy.yml`, pre-deploy hook, workflow
4. **existing dir without `--deploy`**
   - does not create deploy artifacts
5. **derives context from existing `brain.yaml`**
   - README and/or generated artifacts reflect existing `brain` / `domain`
6. **nested artifact directories are created**
   - `.kamal/hooks/pre-deploy`
   - `.github/workflows/deploy.yml`

## Follow-ups

- Add `--force` to regenerate / overwrite conventional artifacts intentionally.
- Parse `version:` from `brain.yaml` and feed deploy artifact derivation if/when deploy template starts using version-derived image tags.
- Add `--force` support for selectively regenerating individual artifacts once the reconcile flow has proven itself in real app directories.
