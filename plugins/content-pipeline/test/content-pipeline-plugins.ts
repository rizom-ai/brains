import type { Plugin } from "@brains/plugins";
import { ContentPipelinePlugin } from "../src/plugin";
import type { ContentPipelineConfigInput } from "../src/types/config";

/** The content-pipeline package's plugins, as a brain installs them. */
export function createContentPipelinePlugins(
  config: ContentPipelineConfigInput = {},
): Plugin[] {
  return [new ContentPipelinePlugin(config)];
}
