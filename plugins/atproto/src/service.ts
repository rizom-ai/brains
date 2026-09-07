import {
  defineServicePlugin,
  type LoggerContract,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import {
  ATPROTO_BRAIN_CARD_UNAVAILABLE,
  ATPROTO_JETSTREAM_GAP,
} from "@brains/atproto-contracts";
import {
  ambientSubscriptions,
  publishCanonicalLexiconSchemas,
  scheduleBrainCardPublish,
  type AmbientPublishing,
  LEXICON_SCHEMA_COLLECTION,
} from "./ambient-publishing";
import { atprotoConfigSchema, type AtprotoConfig } from "./config";
import {
  JetstreamConsumer,
  type JetstreamDiscoveryOutcome,
  type JetstreamRuntime,
} from "./jetstream-consumer";
import { PublishingTaskQueue } from "./publishing-tasks";
import {
  createAtprotoPublisher,
  type AtprotoAnnouncer,
  type AtprotoServiceDeps,
} from "./publisher";
import { buildAtprotoWebRoutes } from "./web-routes";

interface AtprotoState extends AmbientPublishing {
  readonly runtime: JetstreamRuntime;
  readonly jetstream: { consumer: JetstreamConsumer | undefined };
  readonly logger: LoggerContract;
}

function jetstreamConsumer(
  state: AtprotoState,
  config: AtprotoConfig,
  announce: AtprotoAnnouncer,
  deps: AtprotoServiceDeps,
): JetstreamConsumer {
  const { publisher } = state;
  return new JetstreamConsumer({
    runtime: state.runtime,
    config: config.jetstream,
    callbacks: {
      discover: async (
        repoDid,
        options,
      ): Promise<JetstreamDiscoveryOutcome> => {
        const result = (
          await publisher.discoverBrainCards(announce, {
            repos: [repoDid],
            allowNewCandidates: options.allowNewCandidate,
          })
        ).results[0];
        return result
          ? {
              status: result.status,
              ...(result.created !== undefined && { created: result.created }),
              ...(result.retryable !== undefined && {
                retryable: result.retryable,
              }),
              ...(result.error && { error: result.error }),
            }
          : {
              status: "skipped",
              retryable: true,
              error: "Discovery returned no result",
            };
      },
      markUnavailable: async (repoDid, observedAt): Promise<void> => {
        const staleAfter = new Date(
          Date.parse(observedAt) +
            config.jetstream.staleCandidateRetentionDays * 24 * 60 * 60 * 1000,
        ).toISOString();
        await announce.publish({
          topic: ATPROTO_BRAIN_CARD_UNAVAILABLE,
          data: { repoDid, observedAt, staleAfter, reason: "deleted" },
        });
      },
      publishHeartbeat: async (): Promise<void> => {
        if (!publisher.hasPublishingCredentials()) return;
        await publisher.publishBrainCard();
      },
      reportGap: async (payload): Promise<void> => {
        await announce.publish({
          topic: ATPROTO_JETSTREAM_GAP,
          data: {
            ...payload,
            observedAt: new Date(deps.now?.() ?? Date.now()).toISOString(),
          },
        });
      },
    },
    ...(deps.createJetstreamSocket && {
      createSocket: deps.createJetstreamSocket,
    }),
    ...(deps.now && { now: deps.now }),
    ...(deps.random && { random: deps.random }),
  });
}

/**
 * AT Protocol for a brain: its identity as `did:web` documents, its brain
 * card and projected entities on a PDS, and bounded discovery of other
 * brains' cards over Jetstream.
 *
 * The service owns no entity types. It reads the brain's presentation and
 * the entities other packages declared projections for, and writes only to
 * the PDS; what it learns it announces on the bus for the packages that
 * keep records. Publishing is ambient — entity events queue the work — and
 * gated on a full boot, so a startup check never writes.
 */
export function atprotoService(
  deps: AtprotoServiceDeps = {},
): ServicePackageDefinition<typeof atprotoConfigSchema> {
  return defineServicePlugin(
    {
      id: "atproto",
      config: atprotoConfigSchema,

      setup: ({
        config,
        lifecycle,
        entities,
        state,
        identity,
        profileKinds,
        publicSkills,
        http,
        siteUrl,
        logger,
      }): AtprotoState => {
        const publisher = createAtprotoPublisher({
          config,
          brain: { identity, profileKinds, publicSkills, http, siteUrl },
          entities,
          logger,
          deps,
        });
        const tasks = new PublishingTaskQueue(logger, () =>
          publisher.hasPublishingCredentials(),
        );
        const jetstream: AtprotoState["jetstream"] = { consumer: undefined };
        lifecycle.onCleanup(async () => {
          await jetstream.consumer?.stop();
          jetstream.consumer = undefined;
          await tasks.settle();
        });
        return {
          publisher,
          tasks,
          boot: { fullBootObserved: false },
          runtime: { logger, state },
          jetstream,
          logger,
        };
      },
    },
    {
      subscriptions: ({ config, state }) =>
        config.enabled ? ambientSubscriptions(state) : [],

      routes: ({ config }) => buildAtprotoWebRoutes(config),

      // Scheduled, not awaited: ready is on the boot path, and an unresponsive
      // PDS must not stall startup. Cleanup drains the tasks.
      ready: async ({ config, state, messaging }) => {
        if (!config.enabled || !state.boot.fullBootObserved) return;

        void scheduleBrainCardPublish(state, messaging);

        if (config.lexiconAuthority) {
          void state.tasks.run(LEXICON_SCHEMA_COLLECTION, () =>
            publishCanonicalLexiconSchemas(state, messaging),
          );
        }

        if (config.jetstream.enabled && !state.jetstream.consumer) {
          const consumer = jetstreamConsumer(state, config, messaging, deps);
          state.jetstream.consumer = consumer;
          await consumer.start();
        }
      },
    },
  );
}
