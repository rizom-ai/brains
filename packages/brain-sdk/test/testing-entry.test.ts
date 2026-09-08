import { describe, expect, it } from "bun:test";
import {
  defineJob,
  defineRoute,
  defineServicePlugin,
  defineSubscription,
  defineTool,
  type AnySubscriptionDefinition,
  z,
} from "@brains/sdk/services";
import { createTemplate, defineEntity } from "@brains/sdk/entities";
import {
  defineInterface,
  defineMessageInterface,
  defineMessageInterfacePackage,
} from "@brains/sdk/interfaces";
import { createBrainTestHarness } from "@brains/sdk/testing";

async function expectRejection(
  promise: Promise<unknown>,
  message: string,
): Promise<void> {
  const error = await promise.then(
    () => null,
    (failure: unknown) => failure,
  );
  expect(error).toBeInstanceOf(Error);
  expect(error).toMatchObject({ message: expect.stringContaining(message) });
}

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
      await first.reset();
      expect(
        await second.fetch("POST", "/api/counter", { body: { n: 2 } }),
      ).toMatchObject({ jobId: expect.any(String) });
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

  it("rejects duplicate plugin IDs without replacing the running instance", async () => {
    const harness = createBrainTestHarness();
    try {
      const installed = await harness.installPackage(greeter, {
        greeting: "First",
      });
      await expectRejection(
        harness.installPackage(greeter, { greeting: "Second" }),
        "already installed",
      );
      expect(await installed.tools[0]?.call({ name: "reader" })).toEqual({
        ok: true,
        data: { message: "First, reader" },
      });
    } finally {
      await harness.reset();
    }
  });

  it("executes transformed and nullable job inputs without reparsing parsed values", async () => {
    let parses = 0;
    const transformed = defineJob({
      name: "transform",
      input: z.object({
        n: z.string().transform((value) => {
          parses++;
          return Number(value);
        }),
      }),
      output: z.object({ n: z.string().transform(Number) }),
    });
    const nonWire = defineJob({
      name: "non-wire",
      input: z.object({}),
      output: z.date(),
    });
    const nullable = defineJob({
      name: "nullable",
      input: z.null(),
      output: z.boolean(),
    });
    const harness = createBrainTestHarness();
    try {
      const installed = await harness.installPackage(
        defineServicePlugin(
          { id: "transforms", config: z.object({}) },
          {
            jobs: () => [
              transformed.handle(async ({ input }) => ({
                n: String(input.n + 1),
              })),
              nullable.handle(async ({ input }) => {
                expect(input).toBeNull();
                return true;
              }),
              nonWire.handle(async () => new Date()),
            ],
          },
        ),
      );
      expect(
        await installed.jobs
          .find((job) => job.name.endsWith(":transform"))
          ?.run({ n: "7" }),
      ).toEqual({ n: 8 });
      expect(parses).toBe(1);
      const nonWireJob = installed.jobs.find((job) =>
        job.name.endsWith(":non-wire"),
      );
      if (!nonWireJob) throw new Error("Job was not installed");
      await expectRejection(nonWireJob.run({}), "expected date");
      expect(
        await installed.jobs
          .find((job) => job.name.endsWith(":nullable"))
          ?.run(null),
      ).toBe(true);
    } finally {
      await harness.reset();
    }
  });

  it("validates the same wire responses and preserves codes in every subscription family", async () => {
    const contract = {
      topic: "audit:response",
      payload: z.object({ mode: z.enum(["good", "bad", "throw"]) }),
      response: z.object({ n: z.string().transform(Number) }),
    };
    for (const family of ["service", "interface", "message"]) {
      const harness = createBrainTestHarness();
      const behavior = {
        subscriptions: (): AnySubscriptionDefinition[] => [
          // @ts-expect-error Deliberately malformed provider output must also be refused statically.
          defineSubscription({
            ...contract,
            handle: ({ payload }) => {
              if (payload.mode === "throw") throw new Error("Offline");
              return { n: payload.mode === "bad" ? 7 : "7" };
            },
          }),
        ],
      };
      const header = { id: "answers", config: z.object({}) };
      const definition =
        family === "service"
          ? defineServicePlugin(header, behavior)
          : family === "interface"
            ? defineInterface(header, behavior)
            : defineMessageInterface(
                {
                  ...header,
                  channel: {
                    type: "audit",
                    displayName: "Audit",
                    subjectLabel: "Room",
                    recipient: z.string(),
                  },
                },
                { ...behavior, send: () => "unused" },
              );
      try {
        await harness.installPackage(definition);
        expect(await harness.request(contract, { mode: "good" })).toEqual({
          ok: true,
          data: { n: 7 },
        });
        expect(await harness.request(contract, { mode: "bad" })).toEqual({
          ok: false,
          code: "invalid_response",
        });
        expect(await harness.request(contract, { mode: "throw" })).toEqual({
          ok: false,
          code: "handler_failed",
        });
        expect(
          await harness.request({
            type: contract.topic,
            payload: { mode: "bad" },
          }),
        ).toMatchObject({ success: false, code: "invalid_response" });
        expect(
          await harness.request({ type: contract.topic, payload: {} }),
        ).toMatchObject({ success: false, code: "invalid_input" });
        // A typed setup request uses the same contract, not an envelope cast.
        await harness.installPackage(
          defineServicePlugin(
            {
              id: "asker",
              config: z.object({}),
              setup: async ({ messaging }) => ({
                answer: await messaging.request(contract, { mode: "good" }),
                ask: messaging.request,
              }),
            },
            {
              routes: ({ state }) => [
                defineRoute({
                  method: "GET",
                  path: "/ask",
                  security: { kind: "public" },
                  response: z.object({ n: z.number() }),
                  handle: async () => {
                    if (!state.answer.ok) throw new Error(state.answer.code);
                    const answer = await state.ask(contract, { mode: "good" });
                    if (!answer.ok) throw new Error(answer.code);
                    const n: number = answer.data.n + state.answer.data.n;
                    return { n };
                  },
                }),
              ],
            },
          ),
        );
        expect(await harness.fetch("GET", "/ask")).toEqual({ n: 14 });
      } finally {
        await harness.reset();
      }
    }
  });

  it("awaits async setup and isolates resource state in each family", async () => {
    for (const family of ["service", "interface", "message"]) {
      let created = 0;
      const cleaned: number[] = [];
      const acquire = async (
        onCleanup: (cleanup: () => void) => void,
      ): Promise<{ value: number }> => {
        const value = ++created;
        onCleanup(() => {
          cleaned.push(value);
        });
        await Promise.resolve();
        return { value };
      };
      const route = (value: number): ReturnType<typeof defineRoute> =>
        defineRoute({
          method: "GET",
          path: "/state",
          security: { kind: "public" },
          response: z.object({ value: z.number() }),
          handle: () => ({ value }),
        });
      const definition =
        family === "service"
          ? defineServicePlugin(
              {
                id: "async",
                config: z.object({}),
                setup: ({ lifecycle }) => acquire(lifecycle.onCleanup),
              },
              { routes: ({ state }) => [route(state.value)] },
            )
          : family === "interface"
            ? defineInterface(
                {
                  id: "async",
                  config: z.object({}),
                  setup: ({ lifecycle }) => acquire(lifecycle.onCleanup),
                },
                { routes: ({ state }) => [route(state.value)] },
              )
            : defineMessageInterface(
                {
                  id: "async",
                  config: z.object({}),
                  channel: {
                    type: "audit",
                    displayName: "Audit",
                    subjectLabel: "Room",
                    recipient: z.string(),
                  },
                  setup: ({ lifecycle }) => acquire(lifecycle.onCleanup),
                },
                {
                  routes: ({ state }) => [route(state.value)],
                  send: () => "unused",
                },
              );
      const first = createBrainTestHarness();
      const second = createBrainTestHarness();
      try {
        await first.installPackage(definition);
        await second.installPackage(definition);
        expect(await first.fetch("GET", "/state")).toEqual({ value: 1 });
        expect(await second.fetch("GET", "/state")).toEqual({ value: 2 });
      } finally {
        await first.reset();
        await second.reset();
      }
      expect(cleaned).toEqual([1, 2]);
    }
  });

  it("rolls back failed async setup immediately in every family", async () => {
    const cleaned: string[] = [];
    const fail = async (
      onCleanup: (cleanup: () => void) => void,
    ): Promise<never> => {
      onCleanup(() => {
        cleaned.push("first");
      });
      onCleanup(() => {
        cleaned.push("second");
      });
      await Promise.resolve();
      throw new Error("Setup refused");
    };
    const definitions = [
      defineServicePlugin({
        id: "fail",
        config: z.object({}),
        setup: ({ lifecycle }) => fail(lifecycle.onCleanup),
      }),
      defineInterface({
        id: "fail",
        config: z.object({}),
        setup: ({ lifecycle }) => fail(lifecycle.onCleanup),
      }),
      defineMessageInterface(
        {
          id: "fail",
          config: z.object({}),
          channel: {
            type: "audit",
            displayName: "Audit",
            subjectLabel: "Room",
            recipient: z.string(),
          },
          setup: ({ lifecycle }) => fail(lifecycle.onCleanup),
        },
        { send: () => "unused" },
      ),
    ];
    for (const definition of definitions) {
      cleaned.length = 0;
      const harness = createBrainTestHarness();
      await expectRejection(
        harness.installPackage(definition),
        "Setup refused",
      );
      expect(cleaned).toEqual(["second", "first"]);
      await harness.reset();
      expect(cleaned).toEqual(["second", "first"]);
    }
  });

  it("runs every resource and plugin cleanup even if one throws", async () => {
    const cleaned: string[] = [];
    const harness = createBrainTestHarness();
    await harness.installPackage(
      defineServicePlugin({
        id: "first",
        config: z.object({}),
        setup: ({ lifecycle }) => {
          lifecycle.onCleanup(() => {
            cleaned.push("first-a");
          });
          lifecycle.onCleanup(() => {
            cleaned.push("first-b");
            throw new Error("First cleanup refused");
          });
          return {};
        },
      }),
    );
    await harness.installPackage(
      defineInterface({
        id: "second",
        config: z.object({}),
        setup: ({ lifecycle }) => {
          lifecycle.onCleanup(() => {
            cleaned.push("second-a");
          });
          lifecycle.onCleanup(() => {
            cleaned.push("second-b");
            throw new Error("Cleanup refused");
          });
          return {};
        },
      }),
    );
    await expectRejection(harness.reset(), "Plugin cleanup failed");
    expect(cleaned).toEqual(["second-b", "second-a", "first-b", "first-a"]);
    await harness.reset();
    expect(cleaned).toHaveLength(4);
    await harness.installPackage(greeter, { greeting: "Again" });
    await harness.reset();
  });

  it("removes partially registered subscriptions when registration fails", async () => {
    const harness = createBrainTestHarness();
    const subscription = defineSubscription({
      topic: "partial:read",
      payload: z.object({}),
      response: z.boolean(),
      handle: () => true,
    });
    await expectRejection(
      harness.installPackage(
        defineServicePlugin(
          { id: "partial", config: z.object({}) },
          { subscriptions: () => [subscription, subscription] },
        ),
      ),
      "more than once",
    );
    expect(
      await harness.request({ type: "partial:read", payload: {} }),
    ).toMatchObject({ success: false, code: "no_handler" });
    await harness.reset();
  });

  it("preserves approvals and executes prepared input once in both tool families", async () => {
    for (const family of ["service", "interface"]) {
      const harness = createBrainTestHarness();
      let parses = 0;
      let executions = 0;
      const behavior = {
        tools: (): ReturnType<typeof defineTool>[] => [
          defineTool({
            name: "approve",
            description: "Approve a transformed input",
            input: z.strictObject({
              n: z.string().transform(Number),
              increment: z.number().transform((n) => n + 1),
              generated: z.number().default(() => ++parses),
            }),
            output: z.object({
              n: z.number(),
              increment: z.number(),
              generated: z.number(),
            }),
            confirmation: ({ n, increment, generated }) =>
              `Use ${n}, ${increment}, ${generated}?`,
            execute: ({ input }) => {
              executions++;
              return input;
            },
          }),
        ],
      };
      const header = { id: "approval", config: z.object({}) };
      try {
        const installed = await harness.installPackage(
          family === "service"
            ? defineServicePlugin(header, behavior)
            : defineInterface(header, behavior),
        );
        const tool = installed.tools[0];
        if (!tool) throw new Error("Missing approval tool");
        const proposed = await tool.call({ n: "7", increment: 1 });
        if (!("confirmation" in proposed)) throw new Error("Missing approval");
        expect(proposed.confirmation.summary).toBe("Use 7, 2, 1?");
        expect(proposed.confirmation.toolName).toBe(tool.name);
        expect(executions).toBe(0);
        // Model a transport replay, not shared object identity.
        const replay: unknown = JSON.parse(
          JSON.stringify(proposed.confirmation.args),
        );
        expect(await tool.call(replay)).toEqual({
          ok: true,
          data: { n: 7, increment: 2, generated: 1 },
        });
        expect(parses).toBe(1);
        expect(executions).toBe(1);
        expect(await tool.call(replay)).toMatchObject({
          ok: false,
          error: expect.any(String),
        });
        expect(executions).toBe(1);

        const second = await tool.call({ n: "8", increment: 1 });
        if (!("confirmation" in second))
          throw new Error("Missing second approval");
        const args = z
          .record(z.string(), z.unknown())
          .parse(second.confirmation.args);
        expect(await tool.call({ ...args, n: "9" })).toMatchObject({
          ok: false,
          error: expect.any(String),
        });
        expect(await tool.call(args)).toMatchObject({
          ok: false,
          error: expect.any(String),
        });
        expect(
          await tool.call({
            n: "7",
            increment: 1,
            _rizomConfirmationToken: "fabricated",
          }),
        ).toMatchObject({ ok: false, error: expect.any(String) });
        expect(executions).toBe(1);
      } finally {
        await harness.reset();
      }
    }
  });

  it("enforces the production tool permission hierarchy before side effects", async () => {
    const harness = createBrainTestHarness();
    let executed = 0;
    try {
      const installed = await harness.installPackage(
        defineServicePlugin(
          { id: "permissions", config: z.object({}) },
          {
            tools: () =>
              ([undefined, "public", "trusted", "admin"] as const).map(
                (permission) =>
                  defineTool({
                    name: permission ?? "default",
                    description: "Permission probe",
                    input: z.object({}),
                    output: z.number(),
                    permission,
                    execute: () => ++executed,
                  }),
              ),
          },
        ),
      );
      const ranks = { public: 0, trusted: 1, admin: 2 };
      for (const permission of ["public", "trusted", "admin"] as const) {
        for (const [index, tool] of installed.tools.entries()) {
          const required = [2, 0, 1, 2][index];
          if (required === undefined)
            throw new Error("Missing permission rank");
          const before = executed;
          const answer = await tool.call({}, { permission });
          if (ranks[permission] >= required) {
            expect(answer).toEqual({ ok: true, data: before + 1 });
          } else {
            expect(answer).toMatchObject({
              ok: false,
              error: expect.stringContaining("Permission denied"),
            });
            expect(executed).toBe(before);
          }
        }
      }
    } finally {
      await harness.reset();
    }
  });

  it("rolls back compound installs without losing prior packages, even when cleanup fails", async () => {
    for (const failCleanup of [false, true]) {
      const harness = createBrainTestHarness();
      const cleaned: string[] = [];
      let fail = true;
      const config = z.object({});
      const route = (id: string): ReturnType<typeof defineRoute> =>
        defineRoute({
          method: "GET",
          path: `/${id}`,
          security: { kind: "public" },
          response: z.string(),
          handle: () => id,
        });
      const child = (
        id: string,
        last: boolean,
      ): ReturnType<typeof defineMessageInterface<typeof config>> =>
        defineMessageInterface(
          {
            id,
            config,
            channel: {
              type: id,
              displayName: id,
              subjectLabel: "Recipient",
              recipient: z.string(),
            },
            setup: ({ lifecycle }) => {
              lifecycle.onCleanup(() => {
                cleaned.push(id);
                if (fail && failCleanup && !last)
                  throw new Error("cleanup failed");
              });
              if (fail && last) throw new Error("child failed");
              return {};
            },
          },
          { routes: () => [route(id)] },
        );
      const compound = defineMessageInterfacePackage({
        id: "compound",
        config,
        interfaces: () => [
          child("first-child", false),
          child("last-child", true),
        ],
      });
      try {
        await harness.installPackage(
          defineServicePlugin(
            { id: "prior", config },
            {
              routes: () => [route("prior")],
              subscriptions: () => [
                defineSubscription({
                  topic: "prior:read",
                  payload: z.object({}),
                  response: z.string(),
                  handle: () => "prior",
                }),
              ],
            },
          ),
        );
        const failure = await harness.installPackage(compound).then(
          () => null,
          (error: unknown) => error,
        );
        expect(failure).toBeInstanceOf(Error);
        expect(cleaned).toEqual(["last-child", "first-child"]);
        await expectRejection(
          harness.fetch("GET", "/first-child"),
          "Nothing serves",
        );
        expect(await harness.fetch("GET", "/prior")).toBe("prior");
        expect(
          await harness.request(
            {
              topic: "prior:read",
              payload: z.object({}),
              response: z.string(),
            },
            {},
          ),
        ).toEqual({ ok: true, data: "prior" });
        fail = false;
        await harness.installPackage(compound);
        await harness.finalizeRegistration();
        expect(await harness.fetch("GET", "/first-child")).toBe("first-child");
        expect(await harness.fetch("GET", "/last-child")).toBe("last-child");
      } finally {
        fail = false;
        await harness.reset();
      }
      expect(cleaned).toEqual([
        "last-child",
        "first-child",
        "last-child",
        "first-child",
      ]);
    }
  });

  it("keeps subscription response types and reuses the definition as a request contract", async () => {
    const subscription = defineSubscription({
      topic: "typed:read",
      payload: z.object({ n: z.string().transform(Number) }),
      response: z.object({
        next: z.string().transform(Number),
        status: z.literal("ok"),
      }),
      handle: ({ payload }): { next: string; status: "ok" } => ({
        next: String(payload.n + 1),
        status: "ok",
      }),
    });
    const harness = createBrainTestHarness();
    try {
      await harness.installPackage(
        defineServicePlugin(
          { id: "typed", config: z.object({}) },
          {
            subscriptions: () => [subscription],
          },
        ),
      );
      const answer = await harness.request(subscription, { n: "7" });
      if (!answer.ok) throw new Error(answer.code);
      expect(answer.data.next.toFixed(0)).toBe("8");
      const status: "ok" = answer.data.status;
      expect(status).toBe("ok");
      // @ts-expect-error Request callers provide schema input, not parsed output.
      expect(await harness.request(subscription, { n: 7 })).toEqual({
        ok: false,
        code: "invalid_input",
      });
    } finally {
      await harness.reset();
    }
  });

  it("writes durable wire inputs and reads parsed outputs through public contexts", async () => {
    for (const family of ["service", "interface"]) {
      const harness = createBrainTestHarness();
      const schema = z.object({
        n: z.string().transform(Number),
        label: z.string().default("ready"),
      });
      const header = { id: "state", config: z.object({}) };
      // Both context families must retain independently inferred input/output types.
      const service = defineServicePlugin(
        {
          ...header,
          setup: async ({ runtimeState }) => {
            const store = runtimeState({ namespace: "state", schema });
            await store.set("one", { n: "7" });
            await expectRejection(
              // @ts-expect-error State setters take wire input, not transformed output.
              store.set("bad", { n: 7 }),
              "expected string",
            );
            return { store };
          },
        },
        {
          tools: ({ state }) => [
            defineTool({
              name: "read",
              description: "Read durable state",
              input: z.object({}),
              output: z.number(),
              execute: async ({ state: runtimeState }) => {
                const counter = runtimeState({
                  namespace: "counter",
                  schema: z.number().transform((n) => n + 1),
                });
                await counter.set("one", 1);
                expect(await counter.get("one")).toBe(2);
                expect(await counter.get("one")).toBe(2);
                expect(await counter.setIfNotExists("one", 10)).toBe(false);
                expect(await counter.setIfNotExists("two", 2)).toBe(true);
                expect(
                  (await counter.list()).map((record) => record.value),
                ).toEqual([2, 3]);
                const value = await state.store.get("one");
                if (!value) throw new Error("Missing state");
                expect(value.label).toBe("ready");
                return value.n;
              },
            }),
          ],
        },
      );
      const generic = defineInterface(
        {
          ...header,
          setup: async ({ runtimeState }) => {
            const store = runtimeState({ namespace: "state", schema });
            await store.set("one", { n: "8" });
            await expectRejection(
              // @ts-expect-error Interface state setters also retain schema input types.
              store.set("bad", { n: 8 }),
              "expected string",
            );
            return { store };
          },
        },
        {
          routes: ({ state }) => [
            defineRoute({
              method: "GET",
              path: "/state",
              security: { kind: "public" },
              response: z.number(),
              handle: async () => {
                const value = await state.store.get("one");
                if (!value) throw new Error("Missing state");
                return value.n;
              },
            }),
          ],
        },
      );
      try {
        const installed = await harness.installPackage(
          family === "service" ? service : generic,
        );
        if (family === "service")
          expect(await installed.tools[0]?.call({})).toEqual({
            ok: true,
            data: 7,
          });
        else expect(await harness.fetch("GET", "/state")).toBe(8);
      } finally {
        await harness.reset();
      }
    }
  });

  it("matches URL pathnames, exact routes and longest segment prefixes like the host", async () => {
    const route = (
      path: string,
      match: "exact" | "prefix",
    ): ReturnType<typeof defineRoute> =>
      defineRoute({
        method: "GET",
        path,
        match,
        security: { kind: "public" },
        response: z.object({ path: z.string(), query: z.string().nullable() }),
        handle: ({ request }) => ({
          path,
          query: new URL(request.url).searchParams.get("q"),
        }),
      });
    const harness = createBrainTestHarness();
    try {
      await harness.installPackage(
        defineInterface(
          { id: "paths", config: z.object({}) },
          {
            routes: () => [
              route("/pages", "prefix"),
              route("/pages/deep/", "prefix"),
              route("/pages/deep/exact", "exact"),
            ],
          },
        ),
      );
      expect(await harness.fetch("GET", "/pages?q=hello")).toEqual({
        path: "/pages",
        query: "hello",
      });
      expect(await harness.fetch("GET", "/pages/one")).toEqual({
        path: "/pages",
        query: null,
      });
      expect(await harness.fetch("GET", "/pages/deep/child")).toEqual({
        path: "/pages/deep/",
        query: null,
      });
      expect(await harness.fetch("GET", "/pages/deep/exact?q=one")).toEqual({
        path: "/pages/deep/exact",
        query: "one",
      });
      await expectRejection(
        harness.fetch("GET", "/pages-other"),
        "Nothing serves",
      );
      await expectRejection(harness.fetch("POST", "/pages"), "Nothing serves");
    } finally {
      await harness.reset();
    }
  });
});
