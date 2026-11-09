import type { Plugin } from "@brains/plugins";
import {
  playbookPlugin,
  playbooksPlugin,
  type PlaybooksConfigInput,
  type PlaybooksPluginDeps,
} from "../src";

/**
 * The playbook type's plugin and the playbooks service, as the canonical
 * brain composes them, in the order they register.
 */
export function createPlaybooksPlugins(
  config: PlaybooksConfigInput = {},
  deps: PlaybooksPluginDeps = {},
): Plugin[] {
  return [playbookPlugin(), playbooksPlugin(config, deps)];
}
