import { defineEntity } from "@rizom/brain/entities";
import {
  SdkError,
  defineBusContract,
  defineJob,
  defineRoute,
  defineServicePlugin,
  defineTool,
  z,
  type EntityReader,
} from "@rizom/brain/services";

// A task to remember, owned by this package.
export const reminder = defineEntity({
  type: "reminder",
  purpose: "A task to remember at a given time",
  metadata: z.object({
    dueAt: z.iso.datetime(),
    done: z.boolean().default(false),
  }),
});

/** The unfinished reminders due by `now`, as whoever is calling may see them. */
async function dueIds(entities: EntityReader, now: string): Promise<string[]> {
  const items = await entities.list(reminder);
  return items
    .filter(
      (item) =>
        !item.metadata.done &&
        Date.parse(item.metadata.dueAt) <= Date.parse(now),
    )
    .map((item) => item.id);
}

const dueInput = z.object({ now: z.iso.datetime() });

// How many reminders are due: a question other packages ask this one.
export const dueCount = defineBusContract({
  channel: "@fixture/reminders:due-count",
  request: dueInput,
  response: z.object({ count: z.number().int() }),
  delivery: "request",
});

// Delivering a reminder, as durable work.
export const fireReminder = defineJob({
  name: "fire",
  input: z.object({ id: z.string() }),
  output: z.object({ fired: z.boolean(), total: z.number(), text: z.string() }),
});

export default defineServicePlugin(
  {
    id: "reminders",
    config: z.object({}),
    entities: [reminder],
    // How many reminders were delivered: bookkeeping, not an entity.
    setup: ({ runtimeState }) => ({
      deliveries: runtimeState({
        namespace: "deliveries",
        schema: z.object({ total: z.number().int() }),
      }),
    }),
  },
  {
    templates: {
      "due-list": {
        schema: z.object({ contents: z.array(z.string()) }),
        format: ({ value }) => value.contents.join("\n"),
      },
    },
    subscriptions: ({ answer, entities }) => [
      answer(dueCount, async ({ request }) => ({
        count: (await dueIds(entities, request.now)).length,
      })),
    ],
    tools: ({ entities, jobs }) => [
      defineTool({
        name: "add",
        description: "Remember a task",
        input: z.object({
          id: z.string(),
          content: z.string(),
          dueAt: z.iso.datetime(),
        }),
        output: z.object({ id: z.string() }),
        sideEffects: "writes",
        execute: ({ input }) =>
          entities.create(reminder, {
            id: input.id,
            content: input.content,
            metadata: { dueAt: input.dueAt },
          }),
      }),
      defineTool({
        name: "list-due",
        description: "List unfinished reminders due by a time",
        input: dueInput,
        output: z.object({ ids: z.array(z.string()) }),
        sideEffects: "none",
        execute: async ({ input }) => ({
          ids: await dueIds(entities, input.now),
        }),
      }),
      defineTool({
        name: "fire",
        description: "Queue a reminder for delivery",
        input: fireReminder.input,
        output: z.object({ jobId: z.string() }),
        sideEffects: "writes",
        execute: async ({ input }) => ({
          jobId: (await jobs.enqueue(fireReminder, input)).id,
        }),
      }),
    ],
    jobs: ({ state, entities, templates }) => [
      fireReminder.handle(async ({ input }) => {
        const item = await entities.get(reminder, input.id);
        if (!item) {
          throw new SdkError("not_found", {
            message: `Reminder ${input.id} is missing`,
          });
        }
        const previous = await state.deliveries.get("count");
        const text = templates.format("due-list", { contents: [item.content] });
        if (item.metadata.done) {
          return { fired: false, total: previous?.total ?? 0, text };
        }
        const total = (previous?.total ?? 0) + 1;
        await entities.update(reminder, item, {
          metadata: { ...item.metadata, done: true },
        });
        await state.deliveries.set("count", { total });
        return { fired: true, total, text };
      }),
    ],
    routes: ({ entities }) => [
      defineRoute({
        method: "GET",
        path: "/reminders/due",
        security: { kind: "public" },
        response: z.object({ ids: z.array(z.string()) }),
        handle: async () => ({
          ids: await dueIds(entities, new Date().toISOString()),
        }),
      }),
    ],
  },
);
