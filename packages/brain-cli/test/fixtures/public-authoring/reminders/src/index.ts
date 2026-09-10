import { defineEntity } from "@rizom/brain/entities";
import {
  defineJob,
  defineRoute,
  defineServicePlugin,
  defineSubscription,
  defineTool,
  SdkError,
  z,
  type EntityReader,
} from "@rizom/brain/services";

export const reminder = defineEntity({
  type: "reminder",
  purpose: "A task to remember at a given time",
  metadata: z.object({
    dueAt: z.string().datetime(),
    done: z.boolean().default(false),
  }),
});

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

const dueInput = z.object({ now: z.string().datetime() });
export const dueCount = defineSubscription({
  topic: "reminders:due-count",
  payload: dueInput,
  response: z.object({ count: z.number() }),
  handle: async ({ entities, payload }) => ({
    count: (await dueIds(entities, payload.now)).length,
  }),
});

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
    setup: ({ runtimeState }) => ({
      deliveries: runtimeState({
        namespace: "deliveries",
        schema: z.object({ total: z.number() }),
      }),
    }),
  },
  {
    subscriptions: () => [dueCount],
    templates: {
      "due-list": {
        schema: z.object({ contents: z.array(z.string()) }),
        format: ({ value }) => value.contents.join("\n"),
      },
    },
    tools: ({ jobs }) => [
      defineTool({
        name: "add",
        description: "Remember a task",
        input: z.object({
          id: z.string(),
          content: z.string(),
          dueAt: z.string().datetime(),
        }),
        output: z.object({ id: z.string() }),
        execute: ({ entities, input }) =>
          entities.create(reminder, {
            id: input.id,
            content: input.content,
            metadata: { dueAt: input.dueAt },
          }),
      }),
      defineTool({
        name: "list-due",
        description: "List unfinished reminders due by a timestamp",
        input: dueInput,
        output: z.object({ ids: z.array(z.string()) }),
        execute: async ({ entities, input }) => ({
          ids: await dueIds(entities, input.now),
        }),
      }),
      defineTool({
        name: "fire",
        description: "Queue a reminder for delivery",
        input: fireReminder.input,
        output: z.object({ jobId: z.string() }),
        execute: async ({ input }) => ({
          jobId: (await jobs.enqueue(fireReminder, input)).id,
        }),
      }),
    ],
    jobs: ({ state }) => [
      fireReminder.handle(async ({ entities, input, templates }) => {
        const item = await entities.get(reminder, input.id);
        if (!item)
          throw new SdkError("not_found", {
            message: `Reminder ${input.id} is missing`,
          });
        const previous = await state.deliveries.get("count");
        const total = (previous?.total ?? 0) + (item.metadata.done ? 0 : 1);
        const text = templates.format("due-list", { contents: [item.content] });
        if (item.metadata.done) return { fired: false, total, text };
        await entities.update(reminder, {
          ...item,
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
