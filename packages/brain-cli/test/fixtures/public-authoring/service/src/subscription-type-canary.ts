import {
  defineBusContract,
  defineJob,
  defineServicePlugin,
  defineTool,
  z,
  type BusContract,
  type BusResult,
} from "@rizom/brain/services";

const verdict = z.object({
  status: z.enum(["open", "done"]),
  tags: z.array(z.enum(["urgent", "later"])),
});

// Another package's question: one owner answers it.
const reminderVerdict = defineBusContract({
  channel: "reminders:verdict",
  request: z.object({ priority: z.enum(["low", "high"]) }),
  response: verdict,
  delivery: "request",
});
// A command every owner hears; nobody answers it.
const remindLater = defineBusContract({
  channel: "reminders:remind-later",
  request: z.object({ when: z.enum(["tonight", "tomorrow"]) }),
  response: z.void(),
  delivery: "command",
});

// A contract keeps its types where it is passed on.
const annotated: BusContract<
  typeof reminderVerdict.schema,
  typeof verdict,
  "request"
> = reminderVerdict;

defineBusContract({
  channel: "reminders:gather",
  request: z.object({}),
  response: z.object({}),
  // @ts-expect-error Gathering every owner's answer stays inside the brain.
  delivery: "collect",
});

const askLater = defineJob({
  name: "ask-later",
  input: z.object({}),
  output: z.object({ asked: z.boolean() }),
});

// Included by the standalone/packed consumer typecheck, not loaded by the brain.
export const subscriptionTypeCanary = defineServicePlugin(
  { id: "subscription-canary", config: z.object({}) },
  {
    subscriptions: ({ answer }) => [
      // Written inline, an answer's literals keep their types, from a handler
      // that takes no parameters as well as from one that does.
      answer(annotated, () => ({ status: "open", tags: ["urgent"] })),
      answer(reminderVerdict, async ({ request, sender }) =>
        sender === "calendar"
          ? { status: "done", tags: ["later"] }
          : {
              status: request.priority === "high" ? "open" : "done",
              tags: [],
            },
      ),
      // The same TypeScript limitation as a tool's output, pinned so a release
      // that lifts it fails here: an array literal under a conditional widens.
      answer(reminderVerdict, ({ request }) => ({
        status: "open",
        // @ts-expect-error An array literal under a conditional widens.
        tags: request.priority === "high" ? ["urgent"] : [],
      })),
      answer(remindLater, async ({ request }) => {
        const when: "tonight" | "tomorrow" = request.when;
        void when;
      }),
      // @ts-expect-error The status is not one the response schema allows.
      answer(reminderVerdict, async () => ({ status: "later", tags: [] })),
      // @ts-expect-error A tag is not one the response schema allows.
      answer(reminderVerdict, () => ({ status: "open", tags: ["someday"] })),
      answer(reminderVerdict, ({ request }) => {
        // @ts-expect-error The handler reads the parsed request.
        void request.missing;
        return { status: "open", tags: [] };
      }),
      // An answer is given the call's data; entities are the slot's.
      // @ts-expect-error The handler context carries no entity access.
      answer(remindLater, async ({ entities: shadowed }) => {
        void shadowed;
      }),
    ],
    jobs: ({ messaging }) => [
      askLater.handle(async () => {
        await messaging.command(remindLater, { when: "tomorrow" });
        return { asked: true };
      }),
      // A job handler is given the call's data; messaging is the slot's.
      defineJob({
        name: "no-handler-messaging",
        input: z.object({}),
        output: z.object({}),
        // @ts-expect-error The handler context carries no messaging.
      }).handle(async ({ messaging: shadowed }) => {
        void shadowed;
        return {};
      }),
      defineJob({
        name: "no-handler-templates",
        input: z.object({}),
        output: z.object({}),
        // @ts-expect-error The handler context carries no templates.
      }).handle(async ({ templates: shadowed }) => {
        void shadowed;
        return {};
      }),
    ],
    tools: ({ messaging }) => [
      defineTool({
        name: "ask-verdict",
        description: "Asks another package for a verdict",
        input: z.object({}),
        output: z.object({ status: z.enum(["open", "done", "unknown"]) }),
        async execute() {
          // A request written inline keeps its literals.
          const asked: BusResult<z.output<typeof verdict>> =
            await messaging.request(reminderVerdict, { priority: "high" });
          if (asked.status === "answered") return { status: asked.data.status };
          if (asked.status === "failed") {
            const code: string = asked.error.code;
            void code;
          }
          return { status: "unknown" };
        },
      }),
      defineTool({
        name: "wrong-request",
        description: "Refused: a request the contract does not allow",
        input: z.object({}),
        output: z.object({}),
        async execute() {
          // @ts-expect-error The priority is not one the request allows.
          await messaging.request(reminderVerdict, { priority: "urgent" });
          // @ts-expect-error A command is sent, not asked.
          await messaging.request(remindLater, { when: "tonight" });
          // @ts-expect-error Gathering stays inside the brain.
          void messaging.gather;
          return {};
        },
      }),
    ],
  },
);
