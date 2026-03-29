# Plan: Deprecate Matrix Interface

## Context

The Matrix interface (`interfaces/matrix/`) is unmaintained, unused, and pulls in heavy native dependencies (`@matrix-org/matrix-sdk-crypto-nodejs` — requires a downloaded native binary in the Docker build). No brain instance uses it in production. The Chat SDK migration will provide a proper chat interface.

## Scope

Remove Matrix entirely — not just from presets, but from the codebase. The code won't be reused; Chat SDK replaces it.

## Steps

### 1. Remove from brain models

| File                         | Change                                                                                 |
| ---------------------------- | -------------------------------------------------------------------------------------- |
| `brains/rover/src/index.ts`  | Remove `MatrixInterface` import, capability entry, preset entries, `evalDisable` entry |
| `brains/ranger/src/index.ts` | Same                                                                                   |
| `brains/relay/src/index.ts`  | Same                                                                                   |
| `brains/rover/package.json`  | Remove `@brains/matrix` dependency                                                     |
| `brains/ranger/package.json` | Remove `@brains/matrix` dependency                                                     |
| `brains/relay/package.json`  | Remove `@brains/matrix` dependency                                                     |
| `brains/rover/.env.schema`   | Remove `MATRIX_*` variables                                                            |
| `brains/ranger/.env.schema`  | Same                                                                                   |
| `brains/relay/.env.schema`   | Same                                                                                   |
| `brains/ranger/README.md`    | Remove matrix references                                                               |
| `brains/relay/README.md`     | Same                                                                                   |

### 2. Remove from Docker build

| File                                    | Change                                        |
| --------------------------------------- | --------------------------------------------- |
| `deploy/docker/package.prod.json`       | Remove `@matrix-org/matrix-sdk-crypto-nodejs` |
| `deploy/docker/Dockerfile.prod`         | Delete Layer 4 (native binary download)       |
| `deploy/docker/.env.production.example` | Remove `MATRIX_*` variables                   |
| `deploy/README.md`                      | Remove matrix references                      |

### 3. Remove from apps

| File                                                     | Change                      |
| -------------------------------------------------------- | --------------------------- |
| `apps/professional-brain/brain.yaml`                     | Remove matrix config        |
| `apps/professional-brain/.env.example`                   | Remove `MATRIX_*` variables |
| `apps/professional-brain/deploy/brain.yaml`              | Remove matrix config        |
| `apps/professional-brain/deploy/.env.production.example` | Remove `MATRIX_*` variables |
| `apps/collective-brain/brain.yaml`                       | Same                        |
| `apps/collective-brain/.env.example`                     | Same                        |
| `apps/collective-brain/deploy/brain.yaml`                | Same                        |
| `apps/collective-brain/deploy/.env.production.example`   | Same                        |
| `apps/team-brain/brain.yaml`                             | Same                        |
| `apps/team-brain/.env.example`                           | Same                        |
| `apps/team-brain/deploy/brain.yaml`                      | Same                        |
| `apps/team-brain/deploy/.env.production.example`         | Same                        |

### 4. Remove from shell/app

| File                               | Change                                                       |
| ---------------------------------- | ------------------------------------------------------------ |
| `shell/app/package.json`           | Remove `@brains/matrix` dependency                           |
| `shell/app/scripts/build-model.ts` | Remove `@matrix-org/matrix-sdk-crypto-nodejs` from externals |
| `shell/app/scripts/build.ts`       | Remove `@matrix-org/matrix-sdk-crypto-nodejs` from externals |
| `shell/app/README.md`              | Remove matrix references                                     |

### 5. Update tests

| File                                           | Change                                                   |
| ---------------------------------------------- | -------------------------------------------------------- |
| `shell/app/test/instance-overrides.test.ts`    | Replace "matrix" in test fixtures with another interface |
| `shell/app/test/override-package-refs.test.ts` | Remove matrix reference                                  |

### 6. Update docs

| File                               | Change                                        |
| ---------------------------------- | --------------------------------------------- |
| `docs/development-workflow.md`     | Remove matrix references                      |
| `docs/brain-model.md`              | Remove matrix references                      |
| `docs/deployment.md`               | Remove matrix references                      |
| `docs/plans/chat-interface-sdk.md` | Update — matrix is deleted, not "deprecating" |

### 7. Delete the package

```
rm -rf interfaces/matrix/
```

## Verification

1. `bun install` — no matrix packages in lockfile
2. `bun run typecheck` — clean
3. `bun test` — all tests pass
4. `bun run lint` — clean
5. Docker build succeeds without Layer 4
6. No `MATRIX_*` env vars in any `.env*` file
7. No `matrix` or `MatrixInterface` references in brain models
8. `interfaces/matrix/` directory does not exist
9. `grep -r "matrix" --include="*.ts" --include="*.yaml" --include="*.md"` returns only chat-sdk plan and historical references
