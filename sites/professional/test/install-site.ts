import {
  createPluginHarness,
  installSiteRuntime,
  type PluginTestHarness,
} from "@brains/plugins/test";
import site from "../src";

/** The professional site, registered as the brain registers it. */
export function installedSite(
  dataDir: string,
  settings: Readonly<Record<string, unknown>> = {},
): PluginTestHarness {
  const harness = createPluginHarness({ dataDir });
  installSiteRuntime(harness, site, {
    packageName: "@brains/site-professional",
    settings,
  });
  return harness;
}
