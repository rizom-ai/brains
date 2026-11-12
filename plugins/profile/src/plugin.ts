import {
  SdkError,
  defineServicePlugin,
  z,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import {
  SYSTEM_CHANNELS,
  initialSyncCompletedChannel,
  serviceRuntime,
  type ClaimedSystemType,
} from "@brains/sdk/internal/service-runtime";
import { getErrorMessage } from "@brains/utils/error";
import {
  profileImportApplyContract,
  profileImportPreviewContract,
} from "@brains/contracts";
import { applyProfileImport, previewProfileImport } from "./import/steward";
import {
  BUILT_IN_PROFILE_KINDS,
  profileBaseFrontmatterExtension,
  validateProfileEntity,
} from "./schemas";
import {
  buildStarterCharacterBrief,
  generateStarterCharacter,
} from "./starter-character";
import {
  resolveStarterIdentityIdentifier,
  seedOrMigrateStarterIdentity,
  type StarterIdentityStore,
} from "./starter-identity";

const starterIdentityConfigSchema: z.ZodObject<{
  enabled: z.ZodDefault<z.ZodBoolean>;
}> = z.object({
  enabled: z.boolean().default(true),
});

export type StarterIdentityConfigInput = z.input<
  typeof starterIdentityConfigSchema
>;

const profileConfigSchema: z.ZodObject<{
  starterIdentity: z.ZodDefault<typeof starterIdentityConfigSchema>;
  importers: z.ZodDefault<z.ZodArray<z.ZodString>>;
}> = z.object({
  starterIdentity: starterIdentityConfigSchema.default({ enabled: true }),
  /**
   * The plugins that may fill the anchor profile through profile's import
   * contracts, by the sender the bus stamps on their requests: a class
   * plugin's id, or a declared one's.
   */
  importers: z.array(z.string()).default(["linkedin-import"]),
});

export type ProfileConfig = z.output<typeof profileConfigSchema>;
export type ProfileConfigInput = z.input<typeof profileConfigSchema>;

/** The two identity records profile keeps, each through its claim. */
function identityStore(
  anchor: ClaimedSystemType,
  brain: ClaimedSystemType,
): StarterIdentityStore {
  const claimOf = (type: string): ClaimedSystemType =>
    type === brain.type ? brain : anchor;
  return {
    getEntity: (request) => claimOf(request.entityType).getEntity(request),
    createEntity: (request) =>
      claimOf(request.entity.entityType).createEntity(request),
    updateEntity: (request) =>
      claimOf(request.entity.entityType).updateEntity(request),
  };
}

/**
 * Profile: the steward of the brain's identity. It keeps the anchor profile
 * and the brain character, the shell's own identity types: it extends the
 * anchor's frontmatter with the selected profile kind's fields and checks
 * every anchor write against them, seeds or migrates a starter identity
 * once the brain is ready, and fills the anchor from an import another
 * package asks it for.
 */
const profilePackage: ServicePackageDefinition<typeof profileConfigSchema> =
  defineServicePlugin(
    { id: "profile", config: profileConfigSchema },
    {
      subscriptions: (context) => {
        const { config, answer } = context;
        const runtime = serviceRuntime(context);
        const anchor = runtime.claim("anchor-profile");
        const brain = runtime.claim("brain-character");

        for (const definition of BUILT_IN_PROFILE_KINDS) {
          runtime.profileKinds.register(definition);
        }

        // Once every package has registered the kinds it contributes.
        runtime.registered(() => {
          anchor.extendFrontmatterSchema(profileBaseFrontmatterExtension);
          const selection = runtime.profileKinds.getResolved();
          const definition = runtime.profileKinds.getSelectedDefinition();
          if (selection && !definition) {
            throw new Error(
              `Selected profile kind "${selection.kind}" has no field definition`,
            );
          }
          if (definition) anchor.extendFrontmatterSchema(definition.fields);
          anchor.registerPersistValidator(async (entity): Promise<void> => {
            validateProfileEntity(
              entity.content,
              selection && definition
                ? { category: selection.category, fields: definition.fields }
                : undefined,
            );
          });
        });

        if (config.starterIdentity.enabled) {
          listenForStarterIdentity(runtime, identityStore(anchor, brain));
        }

        // Another package fills the anchor through its steward, refused
        // unless the brain lets that package import.
        const admit = (sender: string): void => {
          if (!config.importers.includes(sender)) {
            throw new SdkError("permission_denied", {
              publicMessage: `${sender} may not fill the anchor profile`,
            });
          }
        };
        return [
          answer(profileImportPreviewContract, async ({ request, sender }) => {
            admit(sender);
            return previewProfileImport(anchor, request.fields);
          }),
          answer(profileImportApplyContract, async ({ request, sender }) => {
            admit(sender);
            return applyProfileImport(anchor, request.fields, request.revision);
          }),
        ];
      },
    },
  );

/**
 * The starter identity waits for a successful initial sync, settled
 * startup content (the shell's identity defaults exist only then) and a
 * ready shell, and runs once at a time.
 */
function listenForStarterIdentity(
  runtime: ReturnType<typeof serviceRuntime>,
  store: StarterIdentityStore,
): void {
  const { logger } = runtime;
  let initialSyncSucceeded = false;
  let startupContentSettled = false;
  let shellReady = false;
  let generationInFlight: Promise<void> | undefined;

  const runStarterIdentity = async (): Promise<void> => {
    const identifier = resolveStarterIdentityIdentifier({
      domain: runtime.domain,
    });
    if (!identifier) {
      logger.warn(
        "Starter identity deferred: configure a canonical brain domain",
      );
      return;
    }

    const selection = runtime.profileKinds.getResolved();
    try {
      await seedOrMigrateStarterIdentity({
        entityService: store,
        identifier,
        ...(selection && {
          profileKind: selection.kind,
          profileCategory: selection.category,
        }),
        generateBrainCharacter: async ({
          profileKind,
          profileCategory,
          anchorEntity,
          anchorIsAuthored,
        }) => {
          const brief = await buildStarterCharacterBrief({
            entityService: runtime.entityReads,
            ...(profileKind && { profileKind }),
            ...(profileCategory && { profileCategory }),
            anchorEntity,
            includeAnchor: anchorIsAuthored,
          });
          return generateStarterCharacter(runtime.ai, brief);
        },
        logger,
      });
    } catch (error) {
      logger.warn("Starter character generation deferred", {
        error: getErrorMessage(error),
      });
    }
  };

  const attemptStarterIdentity = async (): Promise<void> => {
    if (!initialSyncSucceeded || !startupContentSettled || !shellReady) {
      return;
    }
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

  runtime.listen(initialSyncCompletedChannel, async ({ payload }) => {
    if (payload.success) {
      initialSyncSucceeded = true;
      await attemptStarterIdentity();
    }
  });
  runtime.listen(SYSTEM_CHANNELS.startupContentSettled, async () => {
    startupContentSettled = true;
    await attemptStarterIdentity();
  });
  runtime.listen(SYSTEM_CHANNELS.shellReady, async () => {
    shellReady = true;
    await attemptStarterIdentity();
  });
}

export default profilePackage;
