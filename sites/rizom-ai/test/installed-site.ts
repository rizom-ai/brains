import type { DataSource } from "@brains/entity-service";
import {
  createPluginHarness,
  installSiteRuntime,
  type PluginTestHarness,
} from "@brains/plugins/test";
import site from "../src";

/**
 * The rizom.ai site registered as the brain registers it, beside other
 * packages' sources, each registered under its scoped id and read by its
 * `<package name>:<local id>`.
 */
export function installedSite(
  sources: ReadonlyArray<DataSource & { publicId: string }> = [],
): PluginTestHarness {
  const harness = createPluginHarness();
  for (const source of sources) harness.registerDataSource(source);
  installSiteRuntime(harness, site, { packageName: "@rizom/site-rizom-ai" });
  return harness;
}

/** A source of the rizom.ai site, as the brain registered it. */
export function siteSource(harness: PluginTestHarness, id: string): DataSource {
  const source = harness.getDataSources().get(id);
  if (!source?.fetch) throw new Error(`Data source ${id} is not registered`);
  return source;
}
