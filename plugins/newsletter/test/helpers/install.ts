import {
  bindPluginPackageMetadata,
  instantiatePluginPackageDefinition,
  type Plugin,
  type PluginCapabilities,
} from "@brains/plugins";
import type { PluginTestHarness } from "@brains/plugins/test";
import {
  newsletterService,
  type NewsletterConfigInput,
  type NewsletterDependencies,
} from "../../src";
import type { ButtondownFetch } from "../../src/lib/buttondown-client";
import packageJson from "../../package.json";

export const PACKAGE_METADATA: { name: string; version: string } = {
  name: packageJson.name,
  version: packageJson.version,
};

export const SERVICE_PLUGIN_ID: string = `${packageJson.name}:buttondown`;
export const ENTITY_PLUGIN_ID: string = `${packageJson.name}:newsletter`;

/**
 * The plugins the runtime would build from one newsletter config: the
 * Buttondown service and the newsletter entity, in that order.
 */
export function instantiate(
  // Unknown rather than the config type: one test hands over a config the
  // package must refuse.
  config: NewsletterConfigInput | unknown = {},
  dependencies: NewsletterDependencies = {},
): { service: Plugin; entity: Plugin } {
  const definition = newsletterService(dependencies);
  bindPluginPackageMetadata(definition, PACKAGE_METADATA);
  const plugins = instantiatePluginPackageDefinition(
    definition,
    config,
    PACKAGE_METADATA,
  );
  const service = plugins.find(({ type }) => type === "service");
  const entity = plugins.find(({ type }) => type === "entity");
  if (!service || !entity) {
    throw new Error("Newsletter package did not produce both plugins");
  }
  return { service, entity };
}

/**
 * Both plugins installed, entity first so the service can find its type.
 * The capabilities are the service's, which is what the tools tests read.
 */
export async function installNewsletter(
  harness: PluginTestHarness,
  config: NewsletterConfigInput = {},
  dependencies: NewsletterDependencies = {},
): Promise<{
  service: Plugin;
  entity: Plugin;
  capabilities: PluginCapabilities;
}> {
  const plugins = instantiate(config, dependencies);
  await harness.installPlugin(plugins.entity);
  const capabilities = await harness.installPlugin(plugins.service);
  return { ...plugins, capabilities };
}

/**
 * A fetch the client is built over that a test can stub after the fact.
 * Unstubbed calls fail loudly rather than reaching the network.
 */
export function stubbableFetch(): {
  fetch: ButtondownFetch;
  stub: (handler: ButtondownFetch) => void;
} {
  let current: ButtondownFetch = () =>
    Promise.reject(new Error("fetch called without a stub"));
  return {
    fetch: (url, init) => current(url, init),
    stub: (handler): void => {
      current = handler;
    },
  };
}

export function jsonResponse(
  body: unknown,
  status = 200,
): ReturnType<ButtondownFetch> {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
}
