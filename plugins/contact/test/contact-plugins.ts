import {
  instantiatePluginPackageDefinition,
  type Plugin,
  type WebRouteDefinition,
} from "@brains/plugins";
import { CONTACT_DEPENDENCIES } from "../src";
import type { ContactPluginConfig } from "../src/config";
import { createContactPackage } from "../src/plugin";
import packageJson from "../package.json";

const metadata = { name: packageJson.name, version: packageJson.version };

/**
 * The contact package's plugins, as the canonical brain composes it under
 * its class's plugin id and dependencies: the contact-request type's
 * plugin, then the contact service.
 */
export function createContactPlugins(
  config: ContactPluginConfig = {},
): Plugin[] {
  return instantiatePluginPackageDefinition(
    createContactPackage(),
    config,
    metadata,
    { pluginId: "contact", dependencies: CONTACT_DEPENDENCIES },
  );
}

/** The contact-request type's plugin alone, as the package installs it. */
export function createContactRequestPlugin(): Plugin {
  const [plugin] = createContactPlugins();
  if (!plugin)
    throw new Error("The package installs no contact-request plugin");
  return plugin;
}

/** The contact service as a test drives it: its routes and its lifecycle. */
export type ContactService = Plugin & {
  getWebRoutes(): WebRouteDefinition[];
  ready(): Promise<void>;
  shutdown(): Promise<void>;
};

function asService(plugin: Plugin | undefined): ContactService {
  if (!plugin?.getWebRoutes || !plugin.ready || !plugin.shutdown)
    throw new Error("The package installs no service plugin");
  const { getWebRoutes, ready, shutdown } = plugin;
  return Object.assign(plugin, {
    getWebRoutes: (): WebRouteDefinition[] => getWebRoutes.call(plugin),
    ready: (): Promise<void> => ready.call(plugin),
    shutdown: (): Promise<void> => shutdown.call(plugin),
  });
}

/** The contact service alone, as the package installs it. */
export function createContactPlugin(
  config: ContactPluginConfig = {},
): ContactService {
  const [, plugin] = createContactPlugins(config);
  return asService(plugin);
}

/** The package's two plugins, the service as a test drives it. */
export function createContactPluginPair(
  config: ContactPluginConfig = {},
): [Plugin, ContactService] {
  const [entity, service] = createContactPlugins(config);
  if (!entity)
    throw new Error("The package installs no contact-request plugin");
  return [entity, asService(service)];
}
