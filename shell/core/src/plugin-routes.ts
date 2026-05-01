import type {
  PluginManager,
  RegisteredApiRoute,
  RegisteredWebRoute,
} from "@brains/plugins";

export function collectPluginApiRoutes(
  pluginManager: PluginManager,
): RegisteredApiRoute[] {
  const routes: RegisteredApiRoute[] = [];

  for (const [pluginId, info] of pluginManager.getAllPlugins()) {
    const { plugin } = info;
    if ("getApiRoutes" in plugin && typeof plugin.getApiRoutes === "function") {
      for (const definition of plugin.getApiRoutes()) {
        routes.push({
          pluginId,
          fullPath: `/api/${pluginId}${definition.path}`,
          definition,
        });
      }
    }
  }

  return routes;
}

export function collectPluginWebRoutes(
  pluginManager: PluginManager,
): RegisteredWebRoute[] {
  const routes: RegisteredWebRoute[] = [];

  for (const [pluginId, info] of pluginManager.getAllPlugins()) {
    const { plugin } = info;
    if ("getWebRoutes" in plugin && typeof plugin.getWebRoutes === "function") {
      for (const definition of plugin.getWebRoutes()) {
        routes.push({
          pluginId,
          fullPath: definition.path,
          definition,
        });
      }
    }
  }

  return routes;
}
