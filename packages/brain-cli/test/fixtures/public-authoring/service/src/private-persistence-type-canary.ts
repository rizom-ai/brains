import { defineEntity, z } from "@rizom/brain/entities";
import { defineServicePlugin, defineSubscription } from "@rizom/brain/services";

// Standalone/packed type coverage only; this package is not loaded by the brain.
const privateRecord = defineEntity({
  type: "private-record",
  purpose: "Private operational record",
  metadata: z.object({}),
  config: {
    embeddable: false,
    fullTextSearchable: false,
    projectionSource: false,
  },
  validatePersist: ({ content, visibility }) => {
    if (visibility !== "restricted" || !content)
      throw new Error("Invalid private record");
  },
});

export const privatePersistenceTypeCanary = defineServicePlugin(
  {
    id: "private-persistence",
    config: z.object({ enabled: z.boolean().default(false) }),
    entities: [privateRecord],
    dependsOn: (config) =>
      config.enabled ? ["@fixture/destination:destination"] : [],
    setup: ({ entities }) => {
      const input = {
        id: "one",
        entityType: "private-record",
        content: "Private body",
        metadata: {},
        visibility: "restricted",
      } satisfies Parameters<typeof entities.create>[0];
      const run = async (signal: AbortSignal): Promise<void> => {
        await entities.create(input, {
          signal,
          conditionalWrite: { expectedRevision: null },
          beforeWrite: async (stored) => {
            if (stored.visibility !== "restricted")
              throw new Error("Invalid private record");
          },
        });
        const stored = await entities.getEntity({
          entityType: "private-record",
          id: "one",
          visibilityScope: "restricted",
        });
        if (stored)
          await entities.update(
            { ...stored, content: "Changed" },
            { expectedContentHash: stored.contentHash, signal },
          );
      };
      const unsupported = (
        stored: Parameters<typeof entities.update>[0],
      ): void => {
        void entities.update(stored, {
          expectedContentHash: stored.contentHash,
        });
        void entities.create(input, {
          // @ts-expect-error Owned creation is create-if-absent, not arbitrary revision replacement.
          conditionalWrite: { expectedRevision: "revision" },
        });
        // @ts-expect-error Attribution remains runtime-owned.
        void entities.create(input, { eventContext: { source: "forged" } });
        // @ts-expect-error Conditional updates do not expose native attribution overrides.
        void entities.update(stored, { operationContext: {} });
      };
      return { run, unsupported };
    },
  },
  {
    subscriptions: () => [
      defineSubscription({
        topic: "fixture:private-delivery",
        execution: "all-roles",
        payload: z.object({ id: z.string() }),
        response: z.object({ ok: z.boolean() }),
        handle: async () => ({ ok: true }),
      }),
    ],
  },
);
