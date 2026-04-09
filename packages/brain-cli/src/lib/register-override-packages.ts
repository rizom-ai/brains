import type { InstanceOverrides } from "@brains/app";
import {
  collectOverridePackageRefs,
  hasPackage,
  registerPackage,
} from "@brains/app";

/**
 * Import function signature used to resolve `@-prefixed` package
 * references at runtime. Defaults to the native dynamic `import()`,
 * overridable for tests.
 */
export type PackageImportFn = (ref: string) => Promise<{ default: unknown }>;

/**
 * Walk the brain.yaml overrides for `@scope/name` package references
 * (`site.package`, plugin config values) and register each one in the
 * package registry so `resolve()` can look them up.
 *
 * The dev runner in `shell/app/src/runner.ts` does the same thing;
 * the published `@rizom/brain` entrypoint used to skip this step
 * entirely, which meant brain.yaml overrides like `site.package:
 * "@brains/site-mylittlephoney"` silently fell back to the brain
 * definition's default site. This function is the shared
 * implementation wired into both paths.
 *
 * Errors importing a referenced package are logged to stderr and
 * skipped — the caller proceeds with whatever did resolve. This
 * matches the dev runner's behavior.
 */
export async function registerOverridePackages(
  overrides: InstanceOverrides,
  importFn: PackageImportFn = (ref) => import(ref),
): Promise<void> {
  const refs = collectOverridePackageRefs(overrides);

  for (const ref of refs) {
    if (hasPackage(ref)) {
      continue;
    }

    try {
      const mod = await importFn(ref);
      registerPackage(ref, mod.default);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `❌ brain.yaml: failed to import package "${ref}": ${message}`,
      );
    }
  }
}
