import {
  defineJob,
  defineServicePlugin,
  defineSubscription,
  SYSTEM_CHANNELS,
  z,
  type ServicePackageDefinition,
} from "@brains/sdk/services";

import {
  BUILT_IN_PROFILE_KINDS,
  profileBaseFrontmatterExtension,
  validateProfileContent,
} from "./schemas";
import {
  buildStarterCharacterBrief,
  generateStarterCharacter,
} from "./starter-character";
import {
  resolveStarterIdentityIdentifier,
  seedOrMigrateStarterIdentity,
} from "./starter-identity";

/**
 * The identity singletons this package manages on the shell's behalf. Both
 * types are registered by identity-service; profile owns their lifecycle —
 * seeding a starter identity, replacing generated placeholders, and shaping
 * what a valid anchor profile looks like.
 */
const STEWARDED_TYPES = ["anchor-profile"] as const;

export interface StarterIdentityConfigInput {
  enabled?: boolean | undefined;
}

export interface ProfileConfigInput {
  starterIdentity?: StarterIdentityConfigInput | undefined;
}

interface StarterIdentityConfig {
  enabled: boolean;
}

interface ProfileConfig {
  starterIdentity: StarterIdentityConfig;
}

const starterIdentityConfigSchema: z.ZodType<
  StarterIdentityConfig,
  StarterIdentityConfigInput
> = z.object({
  enabled: z.boolean().default(true),
});

export const profileConfigSchema: z.ZodType<ProfileConfig, ProfileConfigInput> =
  z.object({
    starterIdentity: starterIdentityConfigSchema.default({ enabled: true }),
  });

const seedStarterIdentityJob = defineJob({
  name: "seed-starter-identity",
  input: z.object({}),
  output: z.object({
    brainCharacter: z.enum(["created", "migrated", "unchanged", "deferred"]),
    anchorProfile: z.enum(["created", "migrated", "unchanged", "deferred"]),
    starterName: z.string().optional(),
  }),
});

/**
 * Both signals the starter flow waits on.
 *
 * The identity is derived from imported content, so it must not run before
 * the initial sync has landed; and it writes through the shell, so it must
 * not run before every plugin is up. Whichever arrives second enqueues.
 */
interface StarterGate {
  initialSyncSucceeded: boolean;
  registrationComplete: boolean;
  enqueued: boolean;
}

const profilePackage: ServicePackageDefinition<typeof profileConfigSchema> =
  defineServicePlugin({
    id: "profile",
    config: profileConfigSchema,

    setup: (): { gate: StarterGate } => ({
      gate: {
        initialSyncSucceeded: false,
        registrationComplete: false,
        enqueued: false,
      },
    }),

    stewards: STEWARDED_TYPES,

    profileKinds: () => BUILT_IN_PROFILE_KINDS,

    // Evaluated after the kind selection is frozen: the fields a valid
    // anchor profile carries depend on which kind this brain represents.
    entityExtensions: ({ profileKinds }) => {
      const selection = profileKinds.getResolved();
      const definition = profileKinds.getSelectedDefinition();
      if (selection && !definition) {
        throw new Error(
          `Selected profile kind "${selection.kind}" has no field definition`,
        );
      }
      return [
        {
          entityType: "anchor-profile",
          frontmatter: profileBaseFrontmatterExtension,
        },
        ...(definition
          ? [{ entityType: "anchor-profile", frontmatter: definition.fields }]
          : []),
        {
          entityType: "anchor-profile",
          validate: (entity): void => {
            validateProfileContent(
              entity.content,
              selection && definition
                ? { category: selection.category, fields: definition.fields }
                : undefined,
            );
          },
        },
      ];
    },

    jobs: ({ config }) => [
      seedStarterIdentityJob.handle(
        async ({ entities, ai, domain, profileKinds, logger }) => {
          const deferred = {
            brainCharacter: "deferred",
            anchorProfile: "deferred",
          } as const;
          if (!config.starterIdentity.enabled) return deferred;

          const identifier = resolveStarterIdentityIdentifier({ domain });
          if (!identifier) {
            logger.warn(
              "Starter identity deferred: configure a canonical brain domain",
            );
            return deferred;
          }

          const selection = profileKinds.getResolved();
          // A provider outage is transient, so the failure reaches the queue
          // and is retried there. The class this replaced could only wait for
          // another initial-sync signal, which may never come again.
          return seedOrMigrateStarterIdentity({
            entityService: entities,
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
                entityService: entities,
                ...(profileKind && { profileKind }),
                ...(profileCategory && { profileCategory }),
                anchorEntity,
                includeAnchor: anchorIsAuthored,
              });
              return generateStarterCharacter(ai, brief);
            },
            logger,
          });
        },
      ),
    ],

    subscriptions: ({ config, state, jobs }) =>
      config.starterIdentity.enabled
        ? [
            defineSubscription({
              topic: SYSTEM_CHANNELS.initialSyncCompleted,
              payload: z.object({ success: z.boolean().optional() }),
              handle: async ({ payload }) => {
                if (payload.success !== true) return { success: true };
                state.gate.initialSyncSucceeded = true;
                if (state.gate.registrationComplete && !state.gate.enqueued) {
                  state.gate.enqueued = true;
                  await jobs.enqueue(seedStarterIdentityJob, {});
                }
                return { success: true };
              },
            }),
          ]
        : [],

    ready: async ({ config, state, jobs }) => {
      if (!config.starterIdentity.enabled) return;
      state.gate.registrationComplete = true;
      if (state.gate.initialSyncSucceeded && !state.gate.enqueued) {
        state.gate.enqueued = true;
        await jobs.enqueue(seedStarterIdentityJob, {});
      }
    },
  });

export default profilePackage;
