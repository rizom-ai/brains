import { bookmark } from "@fixture/reading-entities";
import {
  defineRoute,
  defineServicePlugin,
  defineStudioWorkspace,
  defineWorkspaceAction,
  z,
} from "@rizom/brain/services";
import { queuedReading } from "./index";

// Compile-only: checked by the fixture typecheck, never loaded by the brain.
const queue = defineWorkspaceAction({
  name: "queue",
  label: "Queue",
  permission: "trusted",
  input: z.object({ title: z.string() }),
  output: z.object({ id: z.string() }),
});

const shelf = defineStudioWorkspace({
  id: "shelf",
  label: "Shelf",
  permission: "trusted",
  data: z.object({ queued: z.number() }),
  actions: [queue],
  view: ({ data }) => ({
    blocks: [
      { type: "stats", items: [{ label: "Queued", value: data.queued }] },
    ],
  }),
});

export const callerCanary = defineServicePlugin(
  { id: "caller-canary", config: z.object({}), entities: [queuedReading] },
  {
    studioWorkspaces: (context) => [
      shelf.bind(context, {
        async load({ entities }) {
          // A loader reads as the operator, at their visibility.
          const [first] = await entities.list(queuedReading, { limit: 1 });
          if (first) {
            // @ts-expect-error A loader writes nothing.
            await entities.delete(queuedReading, first);
          }
          return { queued: await entities.count(queuedReading) };
        },
        actions: [
          queue.bind(context, async ({ input, entities }) => {
            const created = await entities.create(queuedReading, {
              content: input.title,
              metadata: {
                title: input.title,
                sourceUrl: "https://example.com/read",
                notify: false,
              },
            });
            // @ts-expect-error An action writes only the package's own types.
            await entities.create(bookmark, { content: "x", metadata: {} });
            await entities.create(queuedReading, {
              content: input.title,
              metadata: {
                title: input.title,
                sourceUrl: "https://example.com/read",
                // @ts-expect-error The schema takes a boolean.
                notify: "later",
              },
            });
            return created;
          }),
        ],
      }),
    ],
  },
);

export const unownedCanary = defineServicePlugin(
  { id: "unowned-canary", config: z.object({}) },
  {
    studioWorkspaces: (context) => [
      shelf.bind(context, {
        load: () => ({ queued: 0 }),
        actions: [
          queue.bind(context, async ({ input, entities }) =>
            // @ts-expect-error A package that owns no types writes none.
            entities.create(queuedReading, {
              content: input.title,
              metadata: {
                title: input.title,
                sourceUrl: "https://example.com/read",
                notify: false,
              },
            }),
          ),
        ],
      }),
    ],
  },
);

const go = defineWorkspaceAction({
  name: "go",
  label: "Go",
  permission: "trusted",
  input: z.object({}),
  launch: { origins: ["https://reading.example"] },
});

const departures = defineStudioWorkspace({
  id: "departures",
  label: "Departures",
  permission: "trusted",
  data: z.object({}),
  actions: [go],
  view: () => ({ blocks: [{ type: "action", action: go, input: {} }] }),
});

export const launchCanary = defineServicePlugin(
  { id: "launch-canary", config: z.object({}) },
  {
    studioWorkspaces: (context) => [
      departures.bind(context, {
        load: () => ({}),
        actions: [
          go.bind(context, async ({ accountSettings }) => {
            // @ts-expect-error The header declares no account settings.
            await accountSettings.claim();
            return { url: "https://reading.example/consent" };
          }),
        ],
      }),
    ],
  },
);

export const launchAnswerCanary = defineServicePlugin(
  { id: "launch-answer-canary", config: z.object({}) },
  {
    studioWorkspaces: (context) => [
      departures.bind(context, {
        load: () => ({}),
        actions: [
          // @ts-expect-error A launch answers with the URL to send the browser to.
          go.bind(context, () => ({ href: "https://reading.example/consent" })),
        ],
      }),
    ],
  },
);

const outcomes = defineStudioWorkspace({
  id: "outcomes",
  label: "Outcomes",
  permission: "trusted",
  query: z.object({ connection: z.enum(["connected", "failed"]).optional() }),
  data: z.object({}),
  actions: [],
  view: () => ({ blocks: [] }),
});

export const returnCanary = defineServicePlugin(
  { id: "return-canary", config: z.object({}) },
  {
    routes: () => [
      defineRoute({
        method: "GET",
        path: "/return-canary/connected",
        security: { kind: "public" },
        returnTo: outcomes,
        // An inline literal keeps its type: no cast for the enum.
        handle: () => ({ connection: "connected" }),
      }),
      defineRoute({
        method: "GET",
        path: "/return-canary/unknown",
        security: { kind: "public" },
        // @ts-expect-error The query refuses "maybe", so this is no return-to route.
        returnTo: outcomes,
        handle: () => ({ connection: "maybe" }),
      }),
    ],
    studioWorkspaces: (context) => [
      outcomes.bind(context, { load: () => ({}), actions: [] }),
    ],
  },
);
