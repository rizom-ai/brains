import type { InstanceOverrides } from "./instance-overrides";
import { collectOverridePackageRefs } from "./override-package-refs";
import { hasPackage, registerPackage } from "./package-registry";

/**
 * Import function signature used to resolve `@-prefixed` package
 * references at runtime. Defaults to the native dynamic `import()`,
 * overridable for tests.
 */
export type PackageImportFn = (
  ref: string,
) => Promise<{ default?: unknown; plugin?: unknown }>;

/**
 * Walk the brain.yaml overrides for `@scope/name` package references
 * (`site.package`, plugin config values, external plugin packages)
 * and register each one in the package registry so `resolve()` can
 * look them up.
 *
 * Errors importing a referenced package are logged to stderr and
 * skipped — the caller proceeds with whatever did resolve.
 */
export async function registerOverridePackages(
  overrides: InstanceOverrides,
  importFn: PackageImportFn = (ref) => import(ref),
): Promise<void> {
  const refs = collectOverridePackageRefs(overrides);

  await Promise.all(
    refs.map(async (ref) => {
      if (hasPackage(ref)) return;

      try {
        const mod = await importFn(ref);
        registerPackage(ref, mod.default ?? mod);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          `❌ brain.yaml: failed to import package "${ref}": ${message}`,
        );
      }
    }),
  );
}
