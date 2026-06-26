import type { Plugin, ServicePluginContext } from "@brains/plugins";
import { ServicePlugin, professionalProfileExtension } from "@brains/plugins";
import { z } from "@brains/utils/zod-v4";
import packageJson from "../package.json" with { type: "json" };

const emptyConfigSchema = z.looseObject({});

/**
 * Rover opts into the professional profile contract.
 *
 * The base anchor-profile schema stays brain-model agnostic. Rover registers
 * the shared professional profile extension explicitly because Rover is the
 * brain model choosing those durable profile fields for onboarding.
 */
type RoverProfileConfig = z.output<typeof emptyConfigSchema>;
type RoverProfileConfigInput = z.input<typeof emptyConfigSchema>;

class RoverProfilePlugin extends ServicePlugin<
  RoverProfileConfig,
  RoverProfileConfigInput
> {
  constructor(config: RoverProfileConfigInput = {}) {
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
  config: RoverProfileConfigInput = {},
): Plugin {
  return new RoverProfilePlugin(config);
}
