import { describe, it, expect, beforeEach } from "bun:test";
import {
  registerOverridePackages,
  type PackageImportFn,
} from "../src/lib/register-override-packages";
import type { InstanceOverrides } from "@brains/app";
import { getPackage, hasPackage, registerPackage } from "@brains/app";

/**
 * Regression guard for the bug where the published `@rizom/brain`
 * CLI silently ignored `@-prefixed` package refs in brain.yaml.
 *
 * The bug: `packages/brain-cli/scripts/entrypoint.ts` used to call
 * `resolve(definition, env, overrides)` directly, skipping the
 * dynamic-import step that populates the package registry with
 * `site.package` and plugin config refs. Instances like
 * `apps/mylittlephoney` with `site.package: "@brains/site-mylittlephoney"`
 * silently fell back to the brain definition's default site because
 * `resolveSitePackage()` couldn't find their site in an empty registry.
 *
 * These tests exercise the shared `registerOverridePackages` helper
 * with a stub import function — the real dynamic import path is
 * exercised by the mylittlephoney smoke test after publish.
 */

const SITE_REF = "@test-scope/site-fixture";
const PLUGIN_REF = "@test-scope/plugin-fixture";

const fakeSite = Symbol("fake-site-package");
const fakePlugin = Symbol("fake-plugin-package");

function clearRegistryEntries(refs: string[]): void {
  for (const ref of refs) {
    // registerPackage overwrites, so we register with undefined to
    // reset between tests. The registry has no `unregister` API today.
    registerPackage(ref, undefined);
  }
}

describe("registerOverridePackages", () => {
  beforeEach(() => {
    clearRegistryEntries([SITE_REF, PLUGIN_REF]);
  });

  it("registers the site.package from brain.yaml in the package registry", async () => {
    const overrides: InstanceOverrides = {
      site: { package: SITE_REF },
    };
    const importFn: PackageImportFn = async (ref) => {
      if (ref === SITE_REF) return { default: fakeSite };
      throw new Error(`unexpected ref: ${ref}`);
    };

    await registerOverridePackages(overrides, importFn);

    expect(hasPackage(SITE_REF)).toBe(true);
    expect(getPackage(SITE_REF)).toBe(fakeSite);
  });

  it("registers site.theme package refs from brain.yaml", async () => {
    const overrides: InstanceOverrides = {
      site: { theme: PLUGIN_REF },
    };
    const importFn: PackageImportFn = async (ref) => {
      if (ref === PLUGIN_REF) return { default: fakePlugin };
      throw new Error(`unexpected ref: ${ref}`);
    };

    await registerOverridePackages(overrides, importFn);

    expect(hasPackage(PLUGIN_REF)).toBe(true);
    expect(getPackage(PLUGIN_REF)).toBe(fakePlugin);
  });

  it("registers @-prefixed plugin config values", async () => {
    const overrides: InstanceOverrides = {
      plugins: {
        "some-plugin": { extra: PLUGIN_REF },
      },
    };
    const importFn: PackageImportFn = async (ref) => {
      if (ref === PLUGIN_REF) return { default: fakePlugin };
      throw new Error(`unexpected ref: ${ref}`);
    };

    await registerOverridePackages(overrides, importFn);

    expect(hasPackage(PLUGIN_REF)).toBe(true);
    expect(getPackage(PLUGIN_REF)).toBe(fakePlugin);
  });

  it("registers both site.package and plugin refs in one pass", async () => {
    const overrides: InstanceOverrides = {
      site: { package: SITE_REF },
      plugins: {
        "some-plugin": { extra: PLUGIN_REF },
      },
    };
    const importFn: PackageImportFn = async (ref) => {
      if (ref === SITE_REF) return { default: fakeSite };
      if (ref === PLUGIN_REF) return { default: fakePlugin };
      throw new Error(`unexpected ref: ${ref}`);
    };

    await registerOverridePackages(overrides, importFn);

    expect(getPackage(SITE_REF)).toBe(fakeSite);
    expect(getPackage(PLUGIN_REF)).toBe(fakePlugin);
  });

  it("is a no-op when overrides contain no @-prefixed refs", async () => {
    const overrides: InstanceOverrides = {
      logLevel: "info",
      plugins: {
        "some-plugin": { disabled: true },
      },
    };
    let calls = 0;
    const importFn: PackageImportFn = async () => {
      calls += 1;
      return { default: null };
    };

    await registerOverridePackages(overrides, importFn);

    expect(calls).toBe(0);
  });

  it("swallows import errors and continues with remaining refs", async () => {
    const overrides: InstanceOverrides = {
      site: { package: SITE_REF },
      plugins: {
        "some-plugin": { extra: PLUGIN_REF },
      },
    };
    // First ref fails, second succeeds.
    const importFn: PackageImportFn = async (ref) => {
      if (ref === SITE_REF) throw new Error("boom");
      if (ref === PLUGIN_REF) return { default: fakePlugin };
      throw new Error(`unexpected ref: ${ref}`);
    };

    await registerOverridePackages(overrides, importFn);

    // First ref should NOT be registered.
    expect(hasPackage(SITE_REF)).toBe(true); // registered as undefined by beforeEach
    expect(getPackage(SITE_REF)).toBeUndefined();
    // Second ref SHOULD be registered despite the first failing.
    expect(getPackage(PLUGIN_REF)).toBe(fakePlugin);
  });
});
