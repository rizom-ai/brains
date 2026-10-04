import { defineEntity, z } from "@rizom/brain/entities";
import { defineServicePlugin } from "@rizom/brain/services";

const record = defineEntity({
  type: "record",
  purpose: "Inbox editing",
  metadata: z.object({ count: z.number() }),
});
const other = defineEntity({
  type: "other",
  purpose: "Other type",
  metadata: z.object({ count: z.number() }),
});

export const inboxTypes = defineServicePlugin(
  { id: "inbox-types", config: z.object({}), entities: [record, other] },
  {
    inbox: () => ({
      sourceId: "records",
      displayName: "Records",
      list: async (context): Promise<[]> => {
        // @ts-expect-error Listing has no caller-bound editing authority.
        void context.edits;
        // @ts-expect-error Inbox readers do not expose background mutations.
        void context.entities.mutations;
        // @ts-expect-error Inbox callbacks do not expose auth management.
        void context.auth;
        return [];
      },
      resolveDetail: async (
        context,
      ): Promise<{ kind: "plain"; text: string; truncated: boolean }> => {
        const signal: AbortSignal = context.signal;
        void signal;
        // @ts-expect-error Details do not receive action capabilities.
        void context.edits;
        return { kind: "plain", text: "Detail", truncated: false };
      },
      act: async (context): Promise<void> => {
        const edit = await context.edits.read(record, "one");
        if (!edit) return;
        const count: number = edit.entity.metadata.count;
        await context.edits.replace(record, edit, {
          ...edit.entity,
          metadata: { count: count + 1 },
        });
        await context.edits.delete(record, edit);
        // @ts-expect-error Definitions and opaque edit entity types must agree.
        await context.edits.delete(other, edit);
        const wrong = { ...edit.entity, metadata: { count: "not a number" } };
        // @ts-expect-error Replacement metadata remains definition-typed.
        await context.edits.replace(record, edit, wrong);
        // @ts-expect-error Caller actions cannot issue background receipts.
        context.edits.once(record, "capture", "key");
        // @ts-expect-error Attribution is supplied by the host.
        await context.edits.delete(record, edit, { actor: "someone else" });
        // @ts-expect-error Callback readers have no background CRUD.
        context.entities.update(record, edit.entity);
      },
    }),
  },
);
