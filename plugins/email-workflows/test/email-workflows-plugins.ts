import {
  defineEntityPackage,
  instantiatePluginPackageDefinition,
  type Plugin,
} from "@brains/plugins";
import { createEmailWorkflowsPackage } from "../src/plugin";
import { emailReplyDraftEntity } from "../src/reply-drafts/entity/definition";

const metadata = { name: "@brains/email-workflows", version: "0.0.0-test" };

/**
 * The email-workflows package's plugins, as the canonical brain composes
 * it under its class's plugin id: the mail-item type's plugin, then the
 * email-workflows service.
 */
export function createEmailWorkflowsPlugins(): Plugin[] {
  return instantiatePluginPackageDefinition(
    createEmailWorkflowsPackage(),
    {},
    metadata,
    { pluginId: "email-workflows" },
  );
}

/** The mail-item type's plugin alone, as the package installs it. */
export function createMailItemPlugin(): Plugin {
  const [plugin] = createEmailWorkflowsPlugins();
  if (!plugin) throw new Error("The package installs no mail-item plugin");
  return plugin;
}

/** The email-workflows service alone, as the package installs it. */
export function createEmailWorkflowsPlugin(): Plugin {
  const [, plugin] = createEmailWorkflowsPlugins();
  if (!plugin) throw new Error("The package installs no service plugin");
  return plugin;
}

/**
 * The reply-draft type's plugin, which no brain installs on main: installed
 * on its own for the drafting operator's tests, under its type.
 */
export function createEmailReplyDraftPlugin(): Plugin {
  const [plugin] = instantiatePluginPackageDefinition(
    defineEntityPackage({
      id: "email-reply-draft",
      entities: [emailReplyDraftEntity],
    }),
    {},
    metadata,
    { pluginId: "email-reply-draft" },
  );
  if (!plugin) throw new Error("No reply-draft plugin");
  return plugin;
}
