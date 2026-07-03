import type { Plugin, ServicePluginContext } from "@brains/plugins";
import { ServicePlugin, professionalProfileExtension } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import packageJson from "../package.json" with { type: "json" };

const emptyConfigSchema = z.object({}).strict();

/**
 * Rover opts into the professional profile contract.
 *
 * The base anchor-profile schema stays brain-model agnostic. Rover registers
 * the shared professional profile extension explicitly because Rover is the
 * brain model choosing those durable profile fields for onboarding.
 */
class RoverProfilePlugin extends ServicePlugin<
  z.infer<typeof emptyConfigSchema>
> {
  constructor(config: Partial<z.infer<typeof emptyConfigSchema>> = {}) {
    super("rover-profile", packageJson, config, emptyConfigSchema);
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    context.entities.extendFrontmatterSchema(
      "anchor-profile",
      professionalProfileExtension,
    );
  }
}

export function roverProfilePlugin(
  config: Partial<z.infer<typeof emptyConfigSchema>> = {},
): Plugin {
  return new RoverProfilePlugin(config);
}
