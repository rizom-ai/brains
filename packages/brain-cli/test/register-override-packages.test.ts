import { describe, it, expect } from "bun:test";
import {
  registerOverridePackages,
  getPackage,
  hasPackage,
  registerPackage,
  type InstanceOverrides,
  type PackageImportFn,
} from "@brains/app";

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

const fakeSite = Symbol("fake-site-package");
const fakePlugin = Symbol("fake-plugin-package");

let refCounter = 0;

function createRef(name: string): string {
  refCounter += 1;
  return `@test-scope/${name}-${refCounter}`;
}

describe("registerOverridePackages", () => {
  it("registers the site.package from brain.yaml in the package registry", async () => {
    const siteRef = createRef("site-fixture");
    const overrides: InstanceOverrides = {
      site: { package: siteRef },
    };
    const importFn: PackageImportFn = async (ref) => {
      if (ref === siteRef) return { default: fakeSite };
      throw new Error(`unexpected ref: ${ref}`);
    };

    await registerOverridePackages(overrides, importFn);

    expect(hasPackage(siteRef)).toBe(true);
    expect(getPackage(siteRef)).toBe(fakeSite);
  });

  it("registers site.theme package refs from brain.yaml", async () => {
    const themeRef = createRef("plugin-fixture");
    const overrides: InstanceOverrides = {
      site: { theme: themeRef },
    };
    const importFn: PackageImportFn = async (ref) => {
      if (ref === themeRef) return { default: fakePlugin };
      throw new Error(`unexpected ref: ${ref}`);
    };

    await registerOverridePackages(overrides, importFn);

    expect(hasPackage(themeRef)).toBe(true);
    expect(getPackage(themeRef)).toBe(fakePlugin);
  });

  it("registers @-prefixed plugin config values", async () => {
    const pluginRef = createRef("plugin-fixture");
    const overrides: InstanceOverrides = {
      plugins: {
        "some-plugin": { extra: pluginRef },
      },
    };
    const importFn: PackageImportFn = async (ref) => {
      if (ref === pluginRef) return { default: fakePlugin };
      throw new Error(`unexpected ref: ${ref}`);
    };

    await registerOverridePackages(overrides, importFn);

    expect(hasPackage(pluginRef)).toBe(true);
    expect(getPackage(pluginRef)).toBe(fakePlugin);
  });

  it("registers external plugin package declarations with named plugin exports", async () => {
    const pluginRef = createRef("external-plugin-fixture");
    const pluginFactory = (): never => {
      throw new Error("not called by registration");
    };
    const overrides: InstanceOverrides = {
      plugins: {
        calendar: {
          package: pluginRef,
          config: { timezone: "UTC" },
        },
      },
    };
    const importFn: PackageImportFn = async (ref) => {
      if (ref === pluginRef) return { plugin: pluginFactory };
      throw new Error(`unexpected ref: ${ref}`);
    };

    await registerOverridePackages(overrides, importFn);

    expect(hasPackage(pluginRef)).toBe(true);
    expect(getPackage(pluginRef)).toEqual({ plugin: pluginFactory });
  });

  it("registers both site.package and plugin refs in one pass", async () => {
    const siteRef = createRef("site-fixture");
    const pluginRef = createRef("plugin-fixture");
    const overrides: InstanceOverrides = {
      site: { package: siteRef },
      plugins: {
        "some-plugin": { extra: pluginRef },
      },
    };
    const importFn: PackageImportFn = async (ref) => {
      if (ref === siteRef) return { default: fakeSite };
      if (ref === pluginRef) return { default: fakePlugin };
      throw new Error(`unexpected ref: ${ref}`);
    };

    await registerOverridePackages(overrides, importFn);

    expect(getPackage(siteRef)).toBe(fakeSite);
    expect(getPackage(pluginRef)).toBe(fakePlugin);
  });

  it("skips dynamic import for refs already registered in the package registry", async () => {
    const siteRef = createRef("site-fixture");
    const themeRef = createRef("plugin-fixture");
    const overrides: InstanceOverrides = {
      site: { package: siteRef, theme: themeRef },
    };
    registerPackage(siteRef, fakeSite);
    registerPackage(themeRef, fakePlugin);

    let calls = 0;
    const importFn: PackageImportFn = async (ref) => {
      calls += 1;
      throw new Error(`should not import pre-registered ref: ${ref}`);
    };

    await registerOverridePackages(overrides, importFn);

    expect(calls).toBe(0);
    expect(getPackage(siteRef)).toBe(fakeSite);
    expect(getPackage(themeRef)).toBe(fakePlugin);
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
    const siteRef = createRef("site-fixture");
    const pluginRef = createRef("plugin-fixture");
    const overrides: InstanceOverrides = {
      site: { package: siteRef },
      plugins: {
        "some-plugin": { extra: pluginRef },
      },
    };
    // First ref fails, second succeeds.
    const importFn: PackageImportFn = async (ref) => {
      if (ref === siteRef) throw new Error("boom");
      if (ref === pluginRef) return { default: fakePlugin };
      throw new Error(`unexpected ref: ${ref}`);
    };

    await registerOverridePackages(overrides, importFn);

    // First ref should NOT be registered.
    expect(hasPackage(siteRef)).toBe(false);
    expect(getPackage(siteRef)).toBeUndefined();
    // Second ref SHOULD be registered despite the first failing.
    expect(getPackage(pluginRef)).toBe(fakePlugin);
  });
});
