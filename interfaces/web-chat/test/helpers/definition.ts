import {
  bindPluginPackageMetadata,
  instantiatePluginPackageDefinition,
  type Plugin,
} from "@brains/plugins";
import { createWebChatDefinition } from "../../src/web-chat-definition";
import type { WebChatConfigInput } from "../../src/config";
import packageJson from "../../package.json";

export function createWebChatPlugin(
  config: WebChatConfigInput = {},
  dependencies: Parameters<typeof createWebChatDefinition>[0] = {},
): Plugin {
  const definition = createWebChatDefinition(dependencies);
  const metadata = { name: packageJson.name, version: packageJson.version };
  bindPluginPackageMetadata(definition, metadata);
  const [plugin] = instantiatePluginPackageDefinition(
    definition,
    config,
    metadata,
  );
  if (!plugin) throw new Error("Web Chat definition did not create a plugin");
  return plugin;
}
