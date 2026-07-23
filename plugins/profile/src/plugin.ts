import type {
  AnchorProfileKind,
  BaseEntity,
  Plugin,
  ServicePluginContext,
} from "@brains/plugins";
import {
  anchorProfileKindSchema,
  ServicePlugin,
  SYSTEM_CHANNELS,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import packageJson from "../package.json";
import { profileFrontmatterExtension, validateProfileContent } from "./schemas";
import {
  buildStarterCharacterBrief,
  generateStarterCharacter,
  type GeneratedStarterCharacter,
  type StarterCharacterBrief,
} from "./starter-character";
import {
  resolveStarterIdentityIdentifier,
  seedOrMigrateStarterIdentity,
} from "./starter-identity";

interface StarterIdentityConfig {
  enabled: boolean;
  anchorKind: AnchorProfileKind;
}

export interface StarterIdentityConfigInput {
  enabled?: boolean | undefined;
  anchorKind?: AnchorProfileKind | undefined;
}

interface ProfileConfig {
  starterIdentity: StarterIdentityConfig;
}

export interface ProfileConfigInput {
  starterIdentity?: StarterIdentityConfigInput | undefined;
}

const starterIdentityConfigSchema: z.ZodType<
  StarterIdentityConfig,
  StarterIdentityConfigInput
> = z.object({
  enabled: z.boolean().default(true),
  anchorKind: anchorProfileKindSchema.default("person"),
});

const profileConfigSchema: z.ZodType<ProfileConfig, ProfileConfigInput> =
  z.object({
    starterIdentity: starterIdentityConfigSchema.default({
      enabled: true,
      anchorKind: "person",
    }),
  });

export class ProfilePlugin extends ServicePlugin<
  ProfileConfig,
  ProfileConfigInput
> {
  constructor(config: ProfileConfigInput = {}) {
    super("profile", packageJson, config, profileConfigSchema);
  }

  protected async generateCharacter(
    context: ServicePluginContext,
    brief: StarterCharacterBrief,
  ): Promise<GeneratedStarterCharacter> {
    return generateStarterCharacter(context.ai, brief);
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    context.entities.extendFrontmatterSchema(
      "anchor-profile",
      profileFrontmatterExtension,
    );
    context.entities.registerPersistValidator(
      "anchor-profile",
      async (entity: BaseEntity): Promise<void> => {
        validateProfileContent(entity.content);
      },
    );

    if (!this.config.starterIdentity.enabled) return;

    let initialSyncSucceeded = false;
    let shellReady = false;
    let generationInFlight: Promise<void> | undefined;

    const runStarterIdentity = async (): Promise<void> => {
      const identifier = resolveStarterIdentityIdentifier({
        domain: context.domain,
      });
      if (!identifier) {
        this.logger.warn(
          "Starter identity deferred: configure a canonical brain domain",
        );
        return;
      }

      try {
        await seedOrMigrateStarterIdentity({
          entityService: context.entityService,
          identifier,
          defaultAnchorKind: this.config.starterIdentity.anchorKind,
          generateBrainCharacter: async ({
            anchorKind,
            anchorEntity,
            anchorIsAuthored,
          }) => {
            const brief = await buildStarterCharacterBrief({
              entityService: context.entityService,
              anchorKind,
              anchorEntity,
              includeAnchor: anchorIsAuthored,
            });
            return this.generateCharacter(context, brief);
          },
          logger: this.logger,
        });
      } catch (error) {
        this.logger.warn("Starter character generation deferred", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };

    const attemptStarterIdentity = async (): Promise<void> => {
      if (!initialSyncSucceeded || !shellReady) return;
      if (generationInFlight) {
        await generationInFlight;
        return;
      }

      generationInFlight = runStarterIdentity();
      try {
        await generationInFlight;
      } finally {
        generationInFlight = undefined;
      }
    };

    context.messaging.subscribe<{ success?: boolean }>(
      SYSTEM_CHANNELS.initialSyncCompleted,
      async (message) => {
        if (message.payload.success === true) {
          initialSyncSucceeded = true;
          await attemptStarterIdentity();
        }
        return { success: true };
      },
    );

    context.messaging.subscribe(SYSTEM_CHANNELS.shellReady, async () => {
      shellReady = true;
      await attemptStarterIdentity();
      return { success: true };
    });
  }
}

export function profilePlugin(config: ProfileConfigInput = {}): Plugin {
  return new ProfilePlugin(config);
}
