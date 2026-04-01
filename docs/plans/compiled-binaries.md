# Plan: Compiled Binaries

## Context

Alternative to npm packages: standalone executables via `bun build --compile`. No Bun or Node required on the target machine. Depends on npm packages plan being solved first — same bundle, different wrapper.

## Proof of concept results

| Target                | Binary size | Native deps         | Status                                                   |
| --------------------- | ----------- | ------------------- | -------------------------------------------------------- |
| CLI (`brain`)         | 101MB       | None                | Works — init, help, version, remote mode all pass        |
| Brain model (`rover`) | 108MB       | ~91 packages (50MB) | Starts, reads brain.yaml — fails on migration file paths |

## The path resolution problem

Compiled binaries run from an embedded filesystem (`/$bunfs/root/`). Code that resolves file paths relative to source (`import.meta.dir`) breaks because those paths don't exist on disk.

Affected:

- Drizzle migrations (`migrationsFolder`)
- Seed content (`seedContentPath`)
- Any `readFileSync` relative to source

Fix: resolve relative to the binary's location using `process.execPath` when running as compiled binary.

## Phases

### Phase A: CLI binary

No native deps, no path issues. Works today.

1. `bun build --compile packages/brain-cli/scripts/entrypoint.ts`
2. Cross-compile: linux-x64, darwin-arm64, darwin-x64
3. CI: build on release, attach to GitHub release
4. Users download, chmod +x, use

### Phase B: Path resolution

Fix file path resolution for compiled brain model binaries.

1. Create `getAppRoot()` utility
2. Update migration, seed content, and asset path resolution
3. `build-model.ts` copies sidecar files to predictable locations

### Phase C: Brain model binary

1. `bun build --compile` with native deps externalized
2. Install native deps into local `node_modules/`
3. Package as tarball: `rover-linux-x64.tar.gz` (~160MB)
4. CI: build on release

### Phase D: Docker from binary (optional)

```dockerfile
FROM debian:bookworm-slim
COPY rover-linux-x64/ /app/
CMD ["./rover"]
```

~160MB vs current ~500MB Docker image.
