import { defineEntity, defineEntityPackage, z } from "@rizom/brain/entities";
import { defineJob, defineServicePlugin } from "@rizom/brain/services";

const record = defineEntity({
  type: "record",
  purpose: "Owned mutation typing",
  metadata: z.object({ count: z.number() }),
});
const other = defineEntity({
  type: "other",
  purpose: "Not interchangeable",
  metadata: z.object({ count: z.number() }),
});
const job = defineJob({
  name: "fold",
  input: z.object({}),
  output: z.object({ ok: z.boolean() }),
});

export const ownedMutationTypes = defineServicePlugin(
  { id: "owned-mutations", config: z.object({}), entities: [record] },
  {
    jobs: () => [
      job.handle(async ({ entities, conversations }) => {
        await conversations.getMessages("conversation", {
          range: { start: 1, end: 31 },
        });
        const candidates = await entities.nearest(record, "one", {
          visibility: "public",
          maxDistance: 0.3,
          limit: 20,
        });
        const nearestCount: number | undefined =
          candidates[0]?.entity.metadata.count;
        void nearestCount;
        const mutations = entities.mutations;
        const edit = await mutations.read(record, "one", {
          visibilityScope: "restricted",
        });
        if (!edit) return { ok: false };
        const count: number = edit.entity.metadata.count;
        await mutations.replace(record, edit, {
          ...edit.entity,
          metadata: { count: count + 1 },
        });
        const operation = mutations.once(record, "capture", "reply");
        await operation.get();
        await operation.complete({ operation: "none" });
        const unsupported = (): void => {
          // @ts-expect-error Semantic lookup requires a definition, not a native type name.
          void entities.nearest("record", "one", {
            visibility: "public",
            maxDistance: 0.3,
            limit: 20,
          });
          // @ts-expect-error Candidate metadata retains the definition's number type.
          const wrong: string | undefined =
            candidates[0]?.entity.metadata.count;
          void wrong;
          const mixedWindow = { range: { start: 1, end: 31 }, limit: 2 };
          // @ts-expect-error A window cannot be combined with a tail limit.
          void conversations.getMessages("conversation", mixedWindow);
          // @ts-expect-error A type name does not replace an entity declaration.
          mutations.once("record", "capture", "reply");
          // @ts-expect-error Native namespaces are not author-selected.
          mutations.once(record, "capture", "reply", {
            namespace: "faq.capture",
          });
          void mutations.replace(
            record,
            // @ts-expect-error Copying view fields does not issue an editing credential.
            { entity: edit.entity, version: edit.version },
            edit.entity,
          );
          // @ts-expect-error A record edit cannot replace another definition's entity.
          void mutations.replace(other, edit, edit.entity);
          void mutations.replace(record, edit, {
            ...edit.entity,
            // @ts-expect-error Definition metadata is retained through the editing view.
            metadata: { count: "wrong" },
          });
          // @ts-expect-error A comparable version is not a native write condition.
          void edit.revision;
          // @ts-expect-error Native service handles are unavailable.
          void mutations.getEntityWriteSnapshot;
          void operation.complete({
            operation: "update",
            edit,
            entity: edit.entity,
            // @ts-expect-error Attribution and write guards are host-owned.
            options: {
              eventContext: { source: "forged" },
              beforeWrite: () => {},
            },
          });
        };
        void unsupported;
        return { ok: true };
      }),
    ],
  },
);

export const configuredEntityTypes = defineEntityPackage({
  id: "configured-entities",
  config: z.object({ reason: z.string().default("configured") }),
  entities: [record],
  configure: ({ config }) => [
    {
      entity: record,
      create: {
        fromContent: {
          resolve: async (): Promise<{ refuse: string }> => ({
            refuse: config.reason,
          }),
        },
      },
    },
  ],
});
