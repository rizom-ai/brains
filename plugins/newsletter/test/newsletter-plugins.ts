import {
  instantiatePluginPackageDefinition,
  type Plugin,
  type PluginPackageDefinition,
} from "@brains/plugins";
import {
  createButtondownPackage,
  createResendPackage,
  newsletterEntityPackage,
  selectNewsletterPackages,
  type ButtondownPluginConfigInput,
  type NewsletterCompositeConfigInput,
  type ResendPluginConfigInput,
} from "../src";
import type { ButtondownClientDeps } from "../src/provider/lib/buttondown-client";
import type { ResendClientDeps } from "../src/provider/resend/resend-client";

const metadata = { name: "@brains/newsletter", version: "0.0.0-test" };

function installedAs(
  definition: PluginPackageDefinition,
  config: unknown,
  pluginId: string,
): Plugin {
  const [plugin] = instantiatePluginPackageDefinition(
    definition,
    config,
    metadata,
    { pluginId },
  );
  if (!plugin) throw new Error(`The ${pluginId} package created no plugin`);
  return plugin;
}

/**
 * The newsletter package's plugins, as the canonical brain composes the
 * capability: the newsletter entity under newsletter, and the configured
 * provider under its class's id, buttondown or resend.
 */
export function createNewsletterPlugins(
  config: NewsletterCompositeConfigInput = {},
): Plugin[] {
  const { entity, provider } = selectNewsletterPackages(config);
  return [
    installedAs(entity.definition, entity.config, "newsletter"),
    ...(provider
      ? [installedAs(provider.definition, provider.config, provider.kind)]
      : []),
  ];
}

/** The newsletter entity's plugin alone, as the brain installs it. */
export function createNewsletterEntityPlugin(): Plugin {
  return installedAs(newsletterEntityPackage, {}, "newsletter");
}

/** The Buttondown service, as the brain installs it, on the transport a test gives. */
export function createButtondownPlugin(
  config: ButtondownPluginConfigInput = {},
  deps: ButtondownClientDeps = {},
): Plugin {
  return installedAs(createButtondownPackage(deps), config, "buttondown");
}

/** The Resend service, as the brain installs it, on the transport a test gives. */
export function createResendPlugin(
  config: ResendPluginConfigInput = {},
  deps: ResendClientDeps = {},
): Plugin {
  return installedAs(createResendPackage(deps), config, "resend");
}
