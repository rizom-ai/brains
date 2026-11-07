import { bookmark } from "@fixture/reading-entities";
import { defineEntity } from "@rizom/brain/entities";
import {
  defineJob,
  defineServicePlugin,
  defineTool,
  z,
  type EntityReader,
  type OwnedEntityWriter,
} from "@rizom/brain/services";

const task = defineEntity({
  type: "canary-task",
  purpose: "Owned entity access typing",
  metadata: z.object({
    status: z.enum(["open", "done"]),
    tags: z.array(z.string()).default([]),
  }),
});

const closeTasks = defineJob({
  name: "close-tasks",
  input: z.object({}),
  output: z.object({ closed: z.number() }),
});

// A handler written outside the slot closure is handed `entities` by it.
function closeOpen(
  entities: EntityReader & OwnedEntityWriter<typeof task>,
): ReturnType<typeof closeTasks.handle> {
  return closeTasks.handle(async () => {
    const open = (await entities.list(task)).filter(
      (item) => item.metadata.status === "open",
    );
    await Promise.all(
      open.map((item) =>
        entities.update(task, item, {
          metadata: { status: "done", tags: [...item.metadata.tags, "closed"] },
        }),
      ),
    );
    return { closed: open.length };
  });
}

async function countOpen(entities: EntityReader): Promise<number> {
  return (await entities.list(task)).filter(
    (item) => item.metadata.status === "open",
  ).length;
}

// Included by the standalone/packed consumer typecheck, not loaded by the brain.
export const entityAccessTypeCanary = defineServicePlugin(
  {
    id: "entity-access-canary",
    config: z.object({}),
    entities: [task],
  },
  {
    jobs: ({ entities }) => [
      closeOpen(entities),
      // A job handler is given no `entities` of its own; the slot's is the one.
      defineJob({
        name: "no-handler-entities",
        input: z.object({}),
        output: z.object({}),
        // @ts-expect-error The handler context carries no entity access.
      }).handle(async ({ entities: shadowed }) => {
        void shadowed;
        return {};
      }),
    ],
    tools: ({ entities }) => {
      // Written inline, metadata keeps its literal types from a callback that
      // takes no parameters as well as from one that does.
      const openTask = (): Promise<{ readonly id: string }> =>
        entities.create(task, {
          content: "Water the plants",
          metadata: { status: "open" },
        });
      void openTask;

      const rejected = async (): Promise<void> => {
        const saved = await entities.get(task, "one");
        const someBookmark = await entities.get(bookmark, "page");
        if (!saved || !someBookmark) return;
        // @ts-expect-error A definition the header does not own cannot be written.
        await entities.create(bookmark, {
          content: "Not mine",
          metadata: { title: "x", url: "https://example.test" },
        });
        // @ts-expect-error Nor updated.
        await entities.update(bookmark, someBookmark, { content: "Not mine" });
        // @ts-expect-error Nor deleted.
        await entities.delete(bookmark, someBookmark);
        await entities.create(task, {
          content: "Typo",
          // @ts-expect-error The status is not one the schema allows.
          metadata: { status: "opne" },
        });
        await entities.update(task, saved, {
          // @ts-expect-error Nor is this one, in a change.
          metadata: { status: "later" },
        });
        // @ts-expect-error A record of another type is not this type's record.
        await entities.delete(task, someBookmark);
        const reader: EntityReader = entities;
        // @ts-expect-error A reader alone cannot write.
        await reader.create(task, {
          content: "",
          metadata: { status: "open" },
        });
      };
      void rejected;

      return [
        defineTool({
          name: "add-task",
          description: "Add an open task",
          input: z.object({ title: z.string() }),
          output: z.object({ id: z.string() }),
          execute: ({ input }) =>
            entities.create(task, {
              content: input.title,
              metadata: { status: "open", tags: ["new"] },
              visibility: "shared",
            }),
        }),
        defineTool({
          name: "count-open",
          description: "Count open tasks",
          input: z.object({}),
          output: z.object({ open: z.number() }),
          execute: async (context) => {
            // @ts-expect-error A tool's execute context carries no entity access.
            void context.entities;
            return { open: await countOpen(entities) };
          },
        }),
        defineTool({
          name: "finish-task",
          description: "Mark a task done",
          input: z.object({ id: z.string() }),
          output: z.object({ done: z.boolean() }),
          async execute({ input }) {
            const saved = await entities.get(task, input.id);
            if (!saved) return { done: false };
            await entities.update(task, saved, {
              metadata: { status: "done" },
            });
            const total: number = await entities.count(task);
            void total;
            return { done: true };
          },
        }),
      ];
    },
  },
);

export const unownedHeader = defineServicePlugin(
  { id: "reader-only", config: z.object({}) },
  {
    tools: ({ entities }) => {
      const rejected = async (): Promise<void> => {
        // @ts-expect-error A package that declares no types writes none.
        await entities.create(task, {
          content: "",
          metadata: { status: "open" },
        });
      };
      void rejected;
      return [];
    },
  },
);
