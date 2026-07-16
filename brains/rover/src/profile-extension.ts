import type { Plugin, ServicePluginContext } from "@brains/plugins";
import { ServicePlugin, professionalProfileExtension } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import packageJson from "../package.json" with { type: "json" };
import { migrateLegacyCommunicationPreferences } from "./profile-migration";

const emptyConfigSchema: z.ZodType<
  RoverProfileConfig,
  RoverProfileConfigInput
> = z.looseObject({});

/**
 * Rover opts into the professional profile contract.
 *
 * The base anchor-profile schema stays brain-model agnostic. Rover registers
 * the shared professional profile extension explicitly because Rover is the
 * brain model choosing those durable profile fields for onboarding.
 */
type RoverProfileConfig = Record<string, unknown>;
type RoverProfileConfigInput = Record<string, unknown>;

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

  protected override async onReady(
    context: ServicePluginContext,
  ): Promise<void> {
    const [profile, character] = await Promise.all([
      context.entityService.getEntity({
        entityType: "anchor-profile",
        id: "anchor-profile",
      }),
      context.entityService.getEntity({
        entityType: "brain-character",
        id: "brain-character",
      }),
    ]);
    if (!profile || !character) return;

    const migration = migrateLegacyCommunicationPreferences(
      profile.content,
      character.content,
    );
    if (!migration.changed) return;

    const result = await context.entityService.updateEntity({
      entity: { ...character, content: migration.content },
      ...(character.contentHash
        ? { options: { expectedContentHash: character.contentHash } }
        : {}),
    });
    if (result.skipped) {
      this.logger.warn(
        "Skipped legacy communication preference migration after concurrent edit",
      );
      return;
    }

    this.logger.info("Migrated legacy communication preferences", {
      fields: migration.migratedFields,
    });
  }
}

export function roverProfilePlugin(
  config: RoverProfileConfigInput = {},
): Plugin {
  return new RoverProfilePlugin(config);
}
