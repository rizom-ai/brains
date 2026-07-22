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
  resolveStarterIdentityIdentifier,
  seedOrMigrateStarterIdentity,
} from "./starter-identity";

interface StarterIdentityConfig {
  enabled: boolean;
  anchorKind: AnchorProfileKind;
  did?: string | undefined;
  handle?: string | undefined;
}

export interface StarterIdentityConfigInput {
  enabled?: boolean | undefined;
  anchorKind?: AnchorProfileKind | undefined;
  did?: string | undefined;
  handle?: string | undefined;
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
  did: z.string().min(1).optional(),
  handle: z.string().min(1).optional(),
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

    context.messaging.subscribe(
      SYSTEM_CHANNELS.initialSyncCompleted,
      async (message) => {
        const payload = message.payload as { success?: boolean };
        if (payload.success !== true) return { success: true };

        const identifier = resolveStarterIdentityIdentifier({
          did: this.config.starterIdentity.did,
          handle: this.config.starterIdentity.handle,
          domain: context.domain,
        });
        if (!identifier) {
          this.logger.warn(
            "Starter identity skipped: configure a DID, handle, or brain domain",
          );
          return { success: true };
        }

        await seedOrMigrateStarterIdentity({
          entityService: context.entityService,
          identifier,
          defaultAnchorKind: this.config.starterIdentity.anchorKind,
          logger: this.logger,
        });
        return { success: true };
      },
    );
  }
}

export function profilePlugin(config: ProfileConfigInput = {}): Plugin {
  return new ProfilePlugin(config);
}
