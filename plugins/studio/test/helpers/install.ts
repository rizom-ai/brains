import {
  bindPluginPackageMetadata,
  instantiatePluginPackageDefinition,
  type AppendAuthAuditEventInput,
  type AuthPrincipal,
  type Plugin,
  type WebRouteDefinition,
} from "@brains/plugins";
import { createStubAuth, type MockShell } from "@brains/plugins/test";
import {
  studioService,
  type StudioConfigInput,
  type StudioDeps,
} from "../../src";
import packageJson from "../../package.json";

export const PACKAGE_METADATA: { name: string; version: string } = {
  name: packageJson.name,
  version: packageJson.version,
};
export const STUDIO_PLUGIN_ID: string = `${packageJson.name}:studio`;

/** The plugin the runtime builds from one config, with a test's registries. */
export function instantiate(
  config: StudioConfigInput = {},
  deps: StudioDeps = {},
): Plugin {
  const definition = studioService(deps);
  bindPluginPackageMetadata(definition, PACKAGE_METADATA);
  const [plugin] = instantiatePluginPackageDefinition(
    definition,
    config,
    PACKAGE_METADATA,
  );
  if (!plugin) throw new Error("Studio plugin was not created");
  return plugin;
}

/** The routes the shared HTTP host mounts for an installed Studio. */
export function routesOf(plugin: Plugin): WebRouteDefinition[] {
  return plugin.getWebRoutes?.() ?? [];
}

export function findRoute(
  source: Plugin | WebRouteDefinition[],
  path: string,
  method: WebRouteDefinition["method"] = "GET",
): WebRouteDefinition {
  const routes = Array.isArray(source) ? source : routesOf(source);
  const route = routes.find(
    (candidate) =>
      candidate.path === path && (candidate.method ?? "GET") === method,
  );
  if (!route) throw new Error(`Missing ${method} route: ${path}`);
  return route;
}

export interface SignInOptions {
  /** Where the audit trail lands, for a test that reads it. */
  readonly audit?: AppendAuthAuditEventInput[];
}

/**
 * A brain whose auth service signs in whoever `principal` answers, asked on
 * every request. Studio's API is declared `session`: the runtime asks the
 * brain's auth who is calling, and nothing in the package is handed a
 * principal. So a test signs someone in here, the way a browser would.
 */
export function signIn(
  shell: MockShell,
  principal: () => AuthPrincipal | undefined,
  options: SignInOptions = {},
): void {
  const stub = createStubAuth();
  shell.getAuthRegistry().register({
    ...stub,
    resolveSession: async () => principal(),
    recordAuditEvent: async (event) => {
      options.audit?.push(event);
      return stub.recordAuditEvent(event);
    },
  });
}

/** Studio installed on a shell, and the routes it serves there. */
export async function installStudio(
  shell: MockShell,
  options: { config?: StudioConfigInput; deps?: StudioDeps } = {},
): Promise<{ plugin: Plugin; routes: WebRouteDefinition[] }> {
  const plugin = instantiate(options.config, options.deps);
  await plugin.register(shell);
  return { plugin, routes: routesOf(plugin) };
}
