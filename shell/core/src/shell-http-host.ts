import { HttpHost } from "@brains/http-host";
import { derivePreviewDomain } from "@brains/site-composition";
import type { ShellConfig } from "./config/shellConfig";
import type { ShellServices } from "./types/shell-types";
import type { RegisteredHttpRoute } from "@brains/plugins/internal/http-routes";
import type { AppInfo, RuntimeReadiness } from "@brains/plugins";
import type { EndpointRegistry } from "./endpoint-registry";
import type { InteractionRegistry } from "./interaction-registry";

export const HTTP_HOST_OWNER = "runtime:http-host";

/** Compose once after registration. No plugin config introspection or listener I/O. */
export function createShellHttpHost(options: {
  config: ShellConfig;
  services: ShellServices;
  routes: readonly RegisteredHttpRoute[];
  endpoints: EndpointRegistry;
  interactions: InteractionRegistry;
  appInfo: () => Promise<AppInfo>;
  readiness: () => Promise<RuntimeReadiness>;
}): HttpHost {
  const { config, services } = options;
  const sites = [...services.pluginManager.getAllPlugins()].flatMap(
    ([ownerPluginId, { plugin }]) => {
      const output = plugin.getStaticSiteOutput?.();
      return output ? [{ ...output, ownerPluginId }] : [];
    },
  );
  const host = new HttpHost({
    config: config.http,
    routes: options.routes,
    sites,
    logger: services.logger,
    messageBus: services.messageBus,
    getOperationalInfo: options.appInfo,
    getReadinessData: options.readiness,
  });
  if (host.configured && config.siteBaseUrl) {
    const siteUrl = `https://${config.siteBaseUrl}`;
    options.endpoints.register({
      pluginId: HTTP_HOST_OWNER,
      label: "Site",
      url: siteUrl,
      priority: 10,
    });
    options.interactions.register({
      pluginId: HTTP_HOST_OWNER,
      id: "site",
      label: "Public site",
      description: "Visit the published public site for this brain.",
      href: siteUrl,
      kind: "human",
      priority: 10,
    });
    if (host.preview) {
      const url = `https://${derivePreviewDomain(config.siteBaseUrl)}`;
      options.endpoints.register({
        pluginId: HTTP_HOST_OWNER,
        label: "Preview",
        url,
        priority: 20,
        visibility: "admin",
      });
      options.interactions.register({
        pluginId: HTTP_HOST_OWNER,
        id: "preview",
        label: "Preview site",
        description: "Open the private preview build.",
        href: url,
        kind: "admin",
        priority: 20,
        visibility: "admin",
      });
    }
  }
  return host;
}
