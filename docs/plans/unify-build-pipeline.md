# Plan: Unify Build Pipeline

## Status

Proposed. `shell/app/scripts/build-model.ts` and `packages/brain-cli/scripts/build.ts` both exist and continue to duplicate build responsibilities.

## Context

There are two parallel build pipelines for shipping brain artifacts:

- **`shell/app/scripts/build-model.ts`** — produces a per-model
  Bun bundle for the docker model image. Called from
  `.github/workflows/publish-images.yml` for each entry in the
  matrix (`[rover]` today).
- **`packages/brain-cli/scripts/build.ts`** — produces the
  multi-model `@rizom/brain` umbrella bundle plus library exports.
  Called from `prepublishOnly` when `npm publish` runs in
  `.github/workflows/release.yml`.

Both scripts do nearly the same shape of work. The immediate
trigger for documenting this is the alpha publish unblocking
work where the hydration compile step had to be added to
`build.ts` even though `publish-images.yml` had its
own copy of the same step.

## Current overlap

| Step                  | `build-model.ts` (docker)                          | `build.ts` (npm)                          |
| --------------------- | -------------------------------------------------- | ----------------------------------------- |
| Hydration compile     | ✗ (CI step in `publish-images.yml`)                | ✓ (inline in script)                      |
| Bundle externals      | same list                                          | same list                                 |
| `Bun.build` call      | one entrypoint, target=bun, format=esm, minify     | one CLI entrypoint + N library entries    |
| Migrations copy       | 3 sources → `dist/migrations/`                     | same 3 sources → `dist/migrations/`       |
| Seed-content copy     | one model → `dist/seed-content/`                   | all models → `dist/seed-content/<model>/` |
| Entrypoint generation | per-model via `generateModelEntrypoint`            | static `entrypoint.ts` (multi-model)      |
| Docker context        | assembles `brains/<model>/docker-context/`         | n/a                                       |
| Library exports       | n/a                                                | one bundle per entry in `src/entries/`    |
| `dist/.brain.yaml`    | per-model, copied from `brains/<model>/brain.yaml` | n/a                                       |
| Shebang prepend       | n/a                                                | yes (`brain.js` is executable)            |

## Proposed shape

Extract a small set of shared helpers in `shell/app/src/build/`:

```
shell/app/src/build/
├── compile-hydration.ts   # invokes scripts/compile-hydration.ts, fail-fast
├── bundle.ts              # Bun.build wrapper with shared externals + report
├── copy-migrations.ts     # the 3-source list, copies to <outdir>/migrations
├── copy-seed-content.ts   # one or all models → <outdir>/seed-content
└── shared-externals.ts    # the list, exported once
```

Each helper is a pure function with explicit inputs:

```ts
// shell/app/src/build/bundle.ts
export interface BundleOptions {
  entrypoint: string;
  outdir: string;
  naming: string; // e.g. "brain.js" or "site.js"
  sourcemap: "none" | "linked" | "external";
}

export async function bundleBrain(opts: BundleOptions): Promise<void>;
```

```ts
// shell/app/src/build/copy-migrations.ts
export function copyMigrations(monorepoRoot: string, outdir: string): void;
```

```ts
// shell/app/src/build/copy-seed-content.ts
export function copySeedContent(opts: {
  monorepoRoot: string;
  outdir: string;
  model?: string; // omit to copy all models
}): void;
```

`compile-hydration.ts` becomes a thin wrapper around the existing
root-level `scripts/compile-hydration.ts` so both scripts call it
the same way:

```ts
// shell/app/src/build/compile-hydration.ts
import { spawnSync } from "child_process";
import { join } from "path";

export function compileHydration(monorepoRoot: string): void {
  const result = spawnSync(
    "bun",
    [join(monorepoRoot, "scripts", "compile-hydration.ts")],
    { cwd: monorepoRoot, stdio: "inherit" },
  );
  if (result.status !== 0) {
    throw new Error("Hydration compile failed");
  }
}
```

## What each consumer becomes

### `packages/brain-cli/scripts/build.ts`

```ts
import {
  compileHydration,
  bundleBrain,
  copyMigrations,
  copySeedContent,
} from "@brains/app/build";

const monorepoRoot = findMonorepoRoot();
const outdir = join(import.meta.dir, "..", "dist");

compileHydration(monorepoRoot);

await Promise.all([
  bundleBrain({
    entrypoint: join(import.meta.dir, "entrypoint.ts"),
    outdir,
    naming: "brain.js",
    sourcemap: "none",
  }).then(() => prependShebang(join(outdir, "brain.js"))),
  ...libraryEntries.map((entry) =>
    bundleBrain({
      entrypoint: entry.source,
      outdir,
      naming: `${entry.name}.js`,
      sourcemap: "linked",
    }).then(() => copyDtsContract(entry, outdir)),
  ),
]);

copyMigrations(monorepoRoot, outdir);
copySeedContent({ monorepoRoot, outdir });
```

### `shell/app/scripts/build-model.ts`

```ts
import {
  compileHydration,
  bundleBrain,
  copyMigrations,
  copySeedContent,
} from "../src/build";

const monorepoRoot = findMonorepoRoot();
const outdir = join(brainModelDir, "dist");

compileHydration(monorepoRoot);

const entrypointPath = generatePerModelEntrypoint(brainPackage, sitePackages);
try {
  await bundleBrain({
    entrypoint: entrypointPath,
    outdir,
    naming: ".model-entrypoint.js",
    sourcemap: "external",
  });
} finally {
  unlinkSync(entrypointPath);
}

copyMigrations(monorepoRoot, outdir);
copySeedContent({ monorepoRoot, outdir, model: modelName });
assembleDockerContext({ brainModelDir, monorepoRoot });
```

Each script keeps its own discovery, entrypoint generation, and
post-processing — the helpers cover only the parts that are byte-
identical between the two.

## Drop the redundant CI step

Once both scripts call `compileHydration()` themselves,
`publish-images.yml` no longer needs its explicit
`Compile hydration scripts` step. Delete it. The model build
becomes self-contained the same way the npm build is.

## Non-goals

- **Single bundle producing both outputs.** The npm package and
  the docker image have different shapes (multi-model vs per-model,
  library exports vs none). Keep them as separate scripts that
  share helpers, not a single mega-script with `--mode=docker`
  branches.
- **Changing unrelated task orchestration.** The helpers are for
  the publish/CI path that bypasses turbo, not a replacement for
  general turbo task wiring.
- **Generalizing to other consumers.** Only build-model.ts and
  build.ts use the helpers initially. Adding new consumers
  (desktop app build, hosted rover build) is the trigger for
  expanding the helper surface, not preemptive design.

## Effort

- Extract the 5 helpers from existing code: ~30 min
- Update `build.ts` to use them: ~15 min
- Update `build-model.ts` to use them: ~30 min
- Drop the redundant CI step from `publish-images.yml`: ~5 min
- Smoke test both pipelines: ~30 min
- Update affected docs (build pipeline references): ~15 min

**Total: ~2 hours.**

## When

Triggered by either:

- A third consumer needing the same build steps (desktop app
  per `desktop-app.md`, hosted rover / app-repo deploy flows),
  OR
- The next time someone has to debug a divergence between the
  two pipelines (e.g. CI fails on one but not the other, or
  the docker image has different bundling characteristics from
  the npm package).

If neither happens, refactor stays deferred. The duplication is
real but still limited in scope — two scripts, one occasional
sync needed.

## Open checklist

- [ ] Extract `shell/app/src/build/` helpers
- [ ] Update `packages/brain-cli/scripts/build.ts` to use them
- [ ] Update `shell/app/scripts/build-model.ts` to use them
- [ ] Drop redundant compile-hydration step from `publish-images.yml`
- [ ] Smoke test docker build (`bun shell/app/scripts/build-model.ts rover`)
- [ ] Smoke test npm build (`cd packages/brain-cli && bun scripts/build.ts`)
- [ ] Update any docs referencing the old per-script flow

## Related

- the published `@rizom/brain` library subpaths (`/plugins`, `/entities`, `/services`, `/interfaces`, `/templates`, `/site`, `/themes`, `/deploy`) — defined in `build.ts`
- `docs/plans/desktop-app.md` — potential third consumer
- hosted rover / app-repo deploy flows — potential fourth consumer
