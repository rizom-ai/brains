import { HackMDPlugin } from "./plugin";
import type { HackMDConfig } from "./config";

export { HackMDPlugin };
export { hackmdConfigSchema, type HackMDConfig } from "./config";

/**
 * Create a HackMD plugin instance
 */
export function hackmdPlugin(config: Partial<HackMDConfig> = {}): HackMDPlugin {
  return new HackMDPlugin(config);
}
