import { HackMDPlugin } from "./plugin";
import type { HackMDConfigInput } from "./config";

export { HackMDPlugin };
export {
  hackmdConfigSchema,
  type HackMDConfig,
  type HackMDConfigInput,
} from "./config";

/**
 * Create a HackMD plugin instance
 */
export function hackmdPlugin(config: HackMDConfigInput): HackMDPlugin {
  return new HackMDPlugin(config);
}
