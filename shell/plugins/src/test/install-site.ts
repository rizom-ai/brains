import { siteRuntimeOf } from "@brains/site-composition";
import { registerSiteRuntime } from "../site/site-runtime";
import type { PluginTestHarness } from "./harness";

/**
 * Register what a first-party site carries (`withSiteRuntime`) on a test
 * harness's shell, as the brain registers it for the site package, with the
 * config the brain hands it: the site's `entityDisplay` and its settings.
 */
export function installSiteRuntime(
  harness: PluginTestHarness,
  site: { readonly entityDisplay?: unknown },
  options: {
    readonly packageName: string;
    readonly settings?: Readonly<Record<string, unknown>>;
  },
): void {
  registerSiteRuntime(
    harness.getMockShell(),
    options.packageName,
    siteRuntimeOf(site),
    { entityDisplay: site.entityDisplay, ...(options.settings ?? {}) },
  );
}
