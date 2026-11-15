import type { WebRouteDefinition } from "@brains/plugins";
import { createPluginHarness, createTempDataDir } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import { authServicePlugin } from "../src";

/** The routes the auth service serves once it has registered, then shut down. */
export async function installedRoutes(): Promise<WebRouteDefinition[]> {
  const harness = createPluginHarness({ logger: createSilentLogger() });
  try {
    await harness.installPlugin(
      authServicePlugin({
        storageDir: await createTempDataDir("brains-auth-routes-"),
      }),
    );
    return harness.getPlugin().getWebRoutes?.() ?? [];
  } finally {
    await harness.reset();
  }
}
