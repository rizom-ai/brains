import type { Plugin } from "@brains/plugins";
import { analyticsPlugin } from "../src";
import type { AnalyticsConfigInput } from "../src/config";
import type { CloudflareClientDeps } from "../src/lib/cloudflare-client";

/** The analytics package's plugins, as a brain installs them. */
export function createAnalyticsPlugins(
  config: AnalyticsConfigInput = {},
  deps: CloudflareClientDeps = {},
): Plugin[] {
  return analyticsPlugin(config, deps);
}
