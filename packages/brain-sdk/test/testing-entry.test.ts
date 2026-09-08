import { describe, expect, it } from "bun:test";
import {
  defineJob,
  defineRoute,
  defineServicePlugin,
  defineSubscription,
  defineTool,
  z,
} from "@brains/sdk/services";
import { createTemplate, defineEntity } from "@brains/sdk/entities";
import {
  defineInterface,
  defineMessageInterface,
} from "@brains/sdk/interfaces";
import { createBrainTestHarness } from "@brains/sdk/testing";

// Also compiled against the built public entries by public-plugin-api.test.ts.
// No runtime imports, casts, or fixture-only access to plugin callbacks.
describe("the public testing harness", () => {
  const greeter = defineServicePlugin(
    { id: "greeter", config: z.object({ greeting: z.string() }) },
    {
      tools: ({ config }) => [
        defineTool({
          name: "greet",
          description: "Say hello.",
          input: z.object({ name: z.string() }),
          output: z.object({ message: z.string() }),
          execute: ({ input }) => ({
            message: `${config.greeting}, ${input.name}`,
          }),
        }),
      ],
    },
  );

  it("calls a tool with validated input and a consistent result", async () => {
    const harness = createBrainTestHarness();
    try {
      const installed = await harness.installPackage(greeter, {
        greeting: "Hello",
      });
      expect(await installed.tools[0]?.call({ name: "world" })).toEqual({
        ok: true,
        data: { message: "Hello, world" },
      });
      expect(await installed.tools[0]?.call({ nome: "world" })).toMatchObject({
        ok: false,
      });
    } finally {
      await harness.reset();
    }
  });

  it("runs a job and serves authenticated routes from each instance's setup state", async () => {
    const tally = defineJob({
      name: "tally",
      input: z.object({ n: z.number() }),
      output: z.object({ total: z.number() }),
      oncePending: ({ n }) => `tally:${n}`,
    });
    const counter = defineServicePlugin(
      {
        id: "counter",
        config: z.object({ start: z.number().default(0) }),
        setup: ({ config }) => ({ total: config.start }),
      },
      {
        jobs: ({ state }) => [
          tally.handle(async ({ input }) => {
            state.total += input.n;
            return { total: state.total };
          }),
        ],
        routes: ({ state, jobs }) => [
          defineRoute({
            method: "POST",
            path: "/api/counter",
            security: {
              kind: "protocol",
              authenticate: () => ({ id: "reader" }),
            },
            body: tally.input,
            response: z.object({ jobId: z.string() }),
            handle: async ({ body }) => ({
              jobId: (await jobs.enqueue(tally, body)).id,
            }),
          }),
          defineRoute({
            method: "GET",
            path: "/api/counter",
            security: {
              kind: "protocol",
              authenticate: ({ request }) =>
                request.headers.get("authorization") === "Bearer fixture"
                  ? { id: "reader" }
                  : null,
            },
            response: z.object({ total: z.number(), actor: z.string() }),
            handle: ({ caller }) => ({
              total: state.total,
              actor: caller.actor.id,
            }),
          }),
        ],
      },
    );
    const first = createBrainTestHarness();
    const second = createBrainTestHarness();
    try {
      const installed = await first.installPackage(counter, { start: 7 });
      await second.installPackage(counter, { start: 30 });
      expect(installed.jobs).toHaveLength(1);
      expect(
        await first.fetch("POST", "/api/counter", { body: { n: 2 } }),
      ).toMatchObject({ jobId: expect.any(String) });
      expect(await installed.jobs[0]?.run({ n: 2 })).toEqual({ total: 9 });
      expect(installed.jobs[0]?.run({ n: "wrong" })).rejects.toThrow();
      const headers = { authorization: "Bearer fixture" };
      expect(await first.fetch("GET", "/api/counter", { headers })).toEqual({
        total: 9,
        actor: "reader",
      });
      expect(await second.fetch("GET", "/api/counter", { headers })).toEqual({
        total: 30,
        actor: "reader",
      });
      expect(await first.fetch("GET", "/api/counter")).not.toHaveProperty(
        "total",
      );
    } finally {
      await first.reset();
      await second.reset();
    }
  });

  it("reads a declared entity in a job and formats its own presentation", async () => {
    const bookmark = defineEntity({
      type: "bookmark",
      purpose: "Something worth returning to.",
      metadata: z.object({ title: z.string(), url: z.url() }),
      templates: {
        card: createTemplate({
          name: "card",
          description: "A bookmark as text.",
          requiredPermission: "public",
          schema: z.object({ title: z.string() }),
          formatter: {
            format: (value: { title: string }): string => `# ${value.title}`,
            parse: (content: string): { title: string } => ({
              title: content.replace(/^# /u, ""),
            }),
          },
        }),
      },
    });
    const reader = defineServicePlugin(
      {
        id: "reader",
        config: z.object({}),
        entities: [bookmark],
        setup: ({ lifecycle }) => {
          const state = { registered: false };
          lifecycle.onRegistered(() => {
            state.registered = true;
          });
          return state;
        },
      },
      {
        jobs: ({ state }) => [
          defineJob({
            name: "read-one",
            input: z.object({ id: z.string() }),
            output: z.object({ title: z.string() }),
          }).handle(async ({ input, entities }) => {
            if (!state.registered)
              throw new Error("Compound service was not finalized");
            const saved = await entities.get(bookmark, input.id);
            if (!saved) throw new Error("Bookmark not found");
            return { title: saved.metadata.title };
          }),
        ],
      },
    );
    const harness = createBrainTestHarness();
    try {
      const installed = await harness.installPackage(
        reader,
        {},
        { name: "@fixture/reader", version: "0.1.0" },
      );
      harness.addEntities([
        {
          id: "one",
          entityType: "bookmark",
          content: "Worth reading.",
          metadata: { title: "Boundaries", url: "https://example.com" },
        },
      ]);
      await harness.finalizeRegistration();
      const value = await installed.jobs[0]?.run({ id: "one" });
      expect(value).toEqual({ title: "Boundaries" });
      expect(
        harness.formatTemplate("@fixture/reader:bookmark:card", value),
      ).toBe("# Boundaries");
      expect(() =>
        harness.formatTemplate("@fixture/reader:bookmark:card", { title: 7 }),
      ).toThrow();
      expect(await harness.getEntity("bookmark", "one")).toMatchObject({
        id: "one",
      });
    } finally {
      await harness.reset();
    }
  });

  it("shares setup state across conversational route and send callbacks without sharing instances", async () => {
    const campfire = defineMessageInterface(
      {
        id: "campfire",
        config: z.object({ room: z.string() }),
        channel: {
          type: "campfire",
          displayName: "Campfire",
          subjectLabel: "Room",
          recipient: z.object({ roomId: z.string() }),
        },
        setup: ({ config }) => {
          const lines: string[] = [];
          return { room: config.room, lines };
        },
      },
      {
        send: ({ state, message }) => {
          state.lines.push(`${state.room}: ${message.text}`);
          return `message-${state.lines.length}`;
        },
        routes: ({ state, messages }) => [
          defineRoute({
            method: "POST",
            path: "/api/campfire",
            security: {
              kind: "protocol",
              authenticate: () => ({ id: "reader" }),
            },
            body: z.object({ text: z.string() }),
            response: z.object({ lines: z.array(z.string()) }),
            handle: async ({ body, caller }) => {
              await messages.receiveAuthenticated({
                sender: { id: caller.actor.id },
                channel: { id: state.room },
                text: body.text,
                caller: {
                  userId: caller.actor.id,
                  permissionLevel: caller.permission,
                },
              });
              return { lines: state.lines };
            },
          }),
        ],
      },
    );
    const first = createBrainTestHarness();
    const second = createBrainTestHarness();
    try {
      await first.installPackage(campfire, { room: "hearth" });
      await second.installPackage(campfire, { room: "porch" });
      await first.finalizeRegistration();
      await second.finalizeRegistration();
      expect(
        await first.fetch("POST", "/api/campfire", { body: { text: "Hello" } }),
      ).toEqual({ lines: ["hearth: Mock agent response"] });
      expect(
        await second.fetch("POST", "/api/campfire", {
          body: { text: "Hello" },
        }),
      ).toEqual({ lines: ["porch: Mock agent response"] });
    } finally {
      await first.reset();
      await second.reset();
    }
  });

  it("finalizes all packages in order and removes old routes on reset", async () => {
    const lifecycle: string[] = [];
    const make = (id: string): ReturnType<typeof defineServicePlugin> =>
      defineServicePlugin(
        {
          id,
          config: z.object({}),
          setup: ({ lifecycle: hooks }) => {
            hooks.onRegistered(() => {
              lifecycle.push(`registered:${id}`);
            });
            hooks.onCleanup(() => {
              lifecycle.push(`cleaned:${id}`);
            });
            return {};
          },
        },
        {
          routes: () => [
            defineRoute({
              path: `/api/${id}`,
              method: "GET",
              security: { kind: "public" },
              response: z.object({ id: z.string() }),
              handle: () => ({ id }),
            }),
          ],
        },
      );
    const harness = createBrainTestHarness();
    try {
      await harness.installPackage(make("first"));
      await harness.installPackage(make("second"));
      await harness.finalizeRegistration();
      expect(lifecycle).toEqual(["registered:first", "registered:second"]);
      expect(await harness.fetch("GET", "/api/first")).toEqual({ id: "first" });
      await harness.reset();
      expect(lifecycle).toEqual([
        "registered:first",
        "registered:second",
        "cleaned:second",
        "cleaned:first",
      ]);
      expect(harness.fetch("GET", "/api/first")).rejects.toThrow(
        "Nothing serves",
      );
      await harness.installPackage(make("third"));
      expect(harness.fetch("GET", "/api/first")).rejects.toThrow(
        "Nothing serves",
      );
      expect(await harness.fetch("GET", "/api/third")).toEqual({ id: "third" });
    } finally {
      await harness.reset();
    }
  });

  it("preserves harness configuration across reset", async () => {
    const definition = defineServicePlugin(
      {
        id: "domain",
        config: z.object({}),
        setup: ({ domain }) => ({ domain }),
      },
      {
        routes: ({ state }) => [
          defineRoute({
            path: "/domain",
            method: "GET",
            security: { kind: "public" },
            response: z.object({ domain: z.string().optional() }),
            handle: () => state,
          }),
        ],
      },
    );
    const harness = createBrainTestHarness({ domain: "example.test" });
    try {
      await harness.installPackage(definition);
      expect(await harness.fetch("GET", "/domain")).toEqual({
        domain: "example.test",
      });
      await harness.reset();
      await harness.installPackage(definition);
      expect(await harness.fetch("GET", "/domain")).toEqual({
        domain: "example.test",
      });
    } finally {
      await harness.reset();
    }
  });

  it("keeps host registration out of ordinary callback types and runtime objects", async () => {
    const service = defineServicePlugin({
      id: "service-boundary",
      config: z.object({}),
      setup: ({ auth, inbox, attachments }) => {
        expect(auth).not.toHaveProperty("register");
        expect(auth).not.toHaveProperty("unregister");
        expect(inbox).not.toHaveProperty("registerSource");
        expect(attachments).not.toHaveProperty("register");
        // @ts-expect-error Installing auth belongs to the runtime, not a service.
        void auth.register;
        // @ts-expect-error Removing auth also belongs to the runtime.
        void auth.unregister;
        // @ts-expect-error Inbox sources are declared, not imperatively registered.
        void inbox.registerSource;
        // @ts-expect-error Attachment providers are declared, not registered in setup.
        void attachments.register;
        return {};
      },
    });
    const generic = defineInterface({
      id: "interface-boundary",
      config: z.object({}),
      setup: ({ auth, inbox }) => {
        expect(auth).not.toHaveProperty("register");
        expect(inbox).not.toHaveProperty("registerSource");
        // @ts-expect-error Interfaces cannot replace auth.
        void auth.register;
        // @ts-expect-error Interfaces cannot register inbox sources in setup.
        void inbox.registerSource;
        return {};
      },
    });
    const conversational = defineMessageInterface(
      {
        id: "message-boundary",
        config: z.object({}),
        channel: {
          type: "boundary",
          displayName: "Boundary",
          subjectLabel: "Room",
          recipient: z.string(),
        },
        setup: ({ auth, inbox }) => {
          expect(auth).not.toHaveProperty("register");
          expect(inbox).not.toHaveProperty("registerSource");
          // @ts-expect-error Message interfaces cannot replace auth.
          void auth.register;
          // @ts-expect-error Message interfaces cannot register inbox sources in setup.
          void inbox.registerSource;
          return {};
        },
      },
      { send: () => "unused" },
    );
    const entity = defineEntity({
      type: "boundary-record",
      purpose: "Prove reaction context reachability.",
      metadata: z.object({}),
      checks: [
        {
          id: "boundary-check",
          cadence: "daily",
          run: async ({ auth }): Promise<{ alerts: [] }> => {
            // @ts-expect-error An entity reaction cannot replace auth either.
            void auth.register;
            // @ts-expect-error An entity reaction cannot remove auth.
            void auth.unregister;
            return { alerts: [] };
          },
        },
      ],
    });
    expect(entity.type).toBe("boundary-record");
    const harness = createBrainTestHarness();
    try {
      await harness.installPackage(service);
      await harness.installPackage(generic);
      await harness.installPackage(conversational);
    } finally {
      await harness.reset();
    }
  });

  it("uses the public request contract and preserves distinct failure codes", async () => {
    const count = {
      topic: "review:count",
      payload: z.object({ fail: z.boolean().default(false) }),
      response: z.object({ count: z.number() }),
    };
    const harness = createBrainTestHarness();
    try {
      expect(await harness.request(count, {})).toEqual({
        ok: false,
        code: "no_handler",
      });
      await harness.installPackage(
        defineServicePlugin(
          { id: "counter", config: z.object({}) },
          {
            subscriptions: () => [
              defineSubscription({
                ...count,
                handle: ({ payload }) => {
                  if (payload.fail) throw new Error("Unavailable today");
                  return { count: 7 };
                },
              }),
            ],
          },
        ),
      );
      const answer = await harness.request(count, {});
      expect(answer).toEqual({ ok: true, data: { count: 7 } });
      if (answer.ok) {
        const total: number = answer.data.count;
        expect(total).toBe(7);
      }
      expect(await harness.request(count, { fail: true })).toEqual({
        ok: false,
        code: "handler_failed",
      });
      expect(
        await harness.request(
          { ...count, response: z.object({ count: z.string() }) },
          {},
        ),
      ).toEqual({ ok: false, code: "invalid_response" });
      // The unchecked caller-selected response generic is deliberately gone.
      async function invalidRequests(): Promise<void> {
        // @ts-expect-error A response type alone cannot prove a bus answer.
        await harness.request<{ count: number }>("review:count", {});
        // @ts-expect-error The shared contract also types request input.
        await harness.request(count, { fail: "yes" });
      }
      void invalidRequests;
    } finally {
      await harness.reset();
    }
  });
});
