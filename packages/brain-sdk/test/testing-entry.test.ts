import { describe, expect, it } from "bun:test";
import {
  defineJob,
  defineRoute,
  defineServicePlugin,
  defineSubscription,
  defineTool,
  type AnySubscriptionDefinition,
  type EntityAccess,
  type LoggerContract,
  type SdkErrorCode,
  type ServiceBatchStatus,
  sdkErrorCodeSchema,
  sdkErrorSchema,
  z,
} from "@brains/sdk/services";
import {
  createTemplate,
  defineEntity,
  defineProjectionRule,
  type AttachmentProvider,
  type MediaAttachmentContext,
  type JobHandlerContext,
} from "@brains/sdk/entities";
import {
  defineInterface,
  defineMessageInterface,
  defineMessageInterfacePackage,
  type IRuntimeStateStore,
  type ScopedRuntimeUploadStore,
  SdkError,
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

async function expectCodedRejection(
  promise: Promise<unknown>,
  code: SdkErrorCode,
): Promise<void> {
  const error = await promise.then(
    () => null,
    (failure: unknown) => failure,
  );
  expect(error).toMatchObject({ code });
}

// Also compiled against the built public entries by public-plugin-api.test.ts.
// No runtime imports, casts, or fixture-only access to plugin callbacks.
describe("the public testing harness", () => {
  it("retains each author's original exception for tools and jobs in tests", async () => {
    const reasons = [
      new Error("the real reason", { cause: new Error("an inner reason") }),
      new SdkError("conflict", {
        message: "another private reason",
        publicMessage: "Refresh your selection",
      }),
    ];
    const fail = async ({ index }: { index: number }): Promise<never> => {
      await Promise.resolve();
      throw reasons[index] ?? new Error("Unknown reason");
    };
    const input = z.object({ index: z.number() });
    const harness = createBrainTestHarness();
    try {
      const installed = await harness.installPackage(
        defineServicePlugin(
          { id: "diagnostics", config: z.object({}) },
          {
            tools: () => [
              defineTool({
                name: "fail",
                description: "Explain an author failure in a test",
                input,
                output: z.string(),
                execute: ({ input }) => fail(input),
              }),
            ],
            jobs: () => [
              defineJob({ name: "fail", input, output: z.string() }).handle(
                ({ input }) => fail(input),
              ),
            ],
          },
        ),
      );
      const tool = installed.tools[0];
      const job = installed.jobs[0];
      expect(tool).toBeDefined();
      expect(job).toBeDefined();
      if (!tool || !job) throw new Error("Missing declarations");
      const results = await Promise.all([
        tool.call({ index: 0 }),
        tool.call({ index: 1 }),
      ]);
      for (const [index, result] of results.entries()) {
        expect(result).toMatchObject({
          ok: false,
          code: index === 0 ? "handler_failed" : "conflict",
          error:
            index === 0 ? "The operation failed" : "Refresh your selection",
          cause: reasons[index],
        });
        // This is diagnostic access for the author, not a change to wire errors.
        if (result.ok || "confirmation" in result)
          throw new Error("Expected failure");
        expect(result.cause).toBe(reasons[index]);
        const rejected = await job.run({ index }).then(
          () => undefined,
          (error: unknown) => error,
        );
        expect(rejected).toMatchObject({ cause: reasons[index] });
        if (!(rejected instanceof Error))
          throw new Error("Expected coded job error");
        expect(rejected.cause).toBe(reasons[index]);
      }
    } finally {
      await harness.reset();
    }
  });
  it("writes a service's declared type and explains the header slot when ownership is missing", async () => {
    const reminder = defineEntity({
      type: "reminder",
      purpose: "An owned reminder",
      metadata: z.object({ done: z.boolean() }),
    });
    const tools = [
      defineTool({
        name: "add",
        description: "Add a reminder",
        input: z.object({}),
        output: z.object({ id: z.string() }),
        execute: ({ entities }) =>
          entities.create(reminder, {
            content: "Call Sam",
            metadata: { done: false },
          }),
      }),
    ];
    const harness = createBrainTestHarness();
    try {
      const owner = await harness.installPackage(
        defineServicePlugin(
          { id: "reminders", config: z.object({}), entities: [reminder] },
          { tools: () => tools },
        ),
      );
      const other = await harness.installPackage(
        defineServicePlugin(
          { id: "reminder-reader", config: z.object({}) },
          { tools: () => tools },
        ),
      );
      await harness.finalizeRegistration();
      const created = await owner.tools[0]?.call({});
      expect(created).toMatchObject({
        ok: true,
        data: { id: expect.any(String) },
      });
      const denied = await other.tools[0]?.call({});
      expect(denied).toMatchObject({
        ok: false,
        code: "handler_failed",
        cause: { message: expect.stringContaining("entities: [...]") },
      });
    } finally {
      await harness.reset();
    }
  });

  it("round-trips an entity body through tool create, job update, and all harness reads", async () => {
    const reminder = defineEntity({
      type: "reminder-body",
      purpose: "Content remains the body, not the storage envelope",
      metadata: z.object({ done: z.boolean() }),
    });
    const harness = createBrainTestHarness();
    try {
      const installed = await harness.installPackage(
        defineServicePlugin(
          { id: "reminder-bodies", config: z.object({}), entities: [reminder] },
          {
            tools: () => [
              defineTool({
                name: "add",
                description: "Create a reminder body",
                input: z.object({}),
                output: z.object({ id: z.string() }),
                execute: ({ entities }) =>
                  entities.create(reminder, {
                    id: "written-reminder",
                    content: "Call Sam",
                    metadata: { done: false },
                  }),
              }),
              defineTool({
                name: "list",
                description: "Read reminder bodies",
                input: z.object({}),
                output: z.array(z.string()),
                execute: async ({ entities }) =>
                  (await entities.listEntities({ entityType: reminder.type }))
                    .map((entity) => entity.content)
                    .sort(),
              }),
            ],
            jobs: () => [
              defineJob({
                name: "fire",
                input: z.object({ id: z.string() }),
                output: z.object({ before: z.string(), after: z.string() }),
              }).handle(async ({ input, entities }) => {
                const before = await entities.get(reminder, input.id);
                if (!before) throw new Error("Missing reminder");
                await entities.update(reminder, {
                  ...before,
                  content: "Email Sam",
                  metadata: { done: true },
                });
                const after = await entities.get(reminder, input.id);
                if (!after) throw new Error("Missing updated reminder");
                return { before: before.content, after: after.content };
              }),
            ],
          },
        ),
      );
      await harness.finalizeRegistration();
      harness.addEntities([
        {
          id: "seeded-reminder",
          entityType: reminder.type,
          content: "Call Sam",
          metadata: { done: false },
        },
      ]);
      expect(await installed.tools[0]?.call({})).toMatchObject({ ok: true });
      expect(await installed.tools[1]?.call({})).toEqual({
        ok: true,
        data: ["Call Sam", "Call Sam"],
      });
      expect(
        await harness.getEntity(reminder.type, "written-reminder"),
      ).toMatchObject({ content: "Call Sam", metadata: { done: false } });
      expect(await installed.jobs[0]?.run({ id: "written-reminder" })).toEqual({
        before: "Call Sam",
        after: "Email Sam",
      });
      expect(
        await harness.getEntity(reminder.type, "written-reminder"),
      ).toMatchObject({ content: "Email Sam", metadata: { done: true } });
    } finally {
      await harness.reset();
    }
  });

  it("uses identical definition-typed CRUD in tools, jobs, and subscriptions", async () => {
    const reminder = defineEntity({
      type: "typed-reminder",
      purpose: "One entity API for all service callbacks",
      metadata: z.object({ done: z.boolean() }),
    });
    async function exercise(
      entities: EntityAccess,
      id: string,
    ): Promise<boolean> {
      const created = await entities.create(reminder, {
        id,
        content: "Call Sam",
        metadata: { done: false },
      });
      expect(created).toEqual({ id });
      const saved = await entities.get(reminder, created.id);
      if (!saved) throw new Error("Missing typed reminder");
      const done: boolean = saved.metadata.done;
      expect(done).toBe(false);
      expect(
        await entities.update(reminder, { ...saved, metadata: { done: true } }),
      ).toEqual({ id });
      const listed = await entities.list(reminder, {
        filter: { metadata: { done: true } },
      });
      const matched: boolean | undefined = listed.find((item) => item.id === id)
        ?.metadata.done;
      const searched = await entities.search(reminder, "Sam");
      const searchedDone: boolean | undefined =
        searched[0]?.entity.metadata.done;
      void searchedDone;
      return matched === true;
    }
    const input = z.object({ id: z.string() });
    const subscription = defineSubscription({
      topic: "typed-reminder:cycle",
      payload: input,
      response: z.boolean(),
      handle: ({ payload, entities }) => exercise(entities, payload.id),
    });
    const harness = createBrainTestHarness();
    try {
      const installed = await harness.installPackage(
        defineServicePlugin(
          { id: "typed-reminders", config: z.object({}), entities: [reminder] },
          {
            tools: () => [
              defineTool({
                name: "cycle",
                description: "Exercise typed CRUD",
                input,
                output: z.boolean(),
                execute: ({ input, entities }) => exercise(entities, input.id),
              }),
            ],
            jobs: () => [
              defineJob({ name: "cycle", input, output: z.boolean() }).handle(
                ({ input, entities }) => exercise(entities, input.id),
              ),
            ],
            subscriptions: () => [subscription],
          },
        ),
      );
      await harness.finalizeRegistration();
      expect(await installed.tools[0]?.call({ id: "tool-reminder" })).toEqual({
        ok: true,
        data: true,
      });
      expect(await installed.jobs[0]?.run({ id: "job-reminder" })).toBe(true);
      expect(
        await harness.request(subscription, { id: "subscription-reminder" }),
      ).toEqual({ ok: true, data: true });
    } finally {
      await harness.reset();
    }
    function rejectedInputs(entities: EntityAccess): void {
      // @ts-expect-error Writes require the definition, not the former native input shape.
      void entities.create({
        entityType: "typed-reminder",
        content: "",
        metadata: { done: false },
      });
      void entities.create(reminder, {
        content: "",
        // @ts-expect-error Metadata is inferred from the definition.
        metadata: { done: "yes" },
      });
    }
    void rejectedInputs;
  });

  it("uses the shared error records for batch failures, not diagnostic strings", () => {
    const failure: ServiceBatchStatus["errors"][number] = {
      code: "not_found",
      message: "Not found",
    };
    expect(sdkErrorSchema.parse(failure)).toEqual(failure);
    // @ts-expect-error Batch failures must carry a stable code, not raw text.
    const raw: ServiceBatchStatus["errors"][number] = "private diagnostic";
    expect(sdkErrorSchema.safeParse(raw).success).toBe(false);
  });

  it("preserves failure codes across public entry families without exposing diagnostics", async () => {
    const secret = "private-token-and-request-body";
    const input = z.object({ code: z.string() });
    const fail = (value: z.output<typeof input>): never => {
      const parsed = sdkErrorCodeSchema.safeParse(value.code);
      if (parsed.success)
        throw new SdkError(parsed.data, {
          message: secret,
          ...(parsed.data === "conflict"
            ? { publicMessage: "Refresh your selection" }
            : {}),
          cause: new Error(secret),
        });
      throw Object.assign(new Error(secret), { code: value.code });
    };
    const subscription = defineSubscription({
      topic: "errors:request",
      payload: input,
      response: z.string(),
      handle: ({ payload }) => fail(payload),
    });
    const fixture = defineServicePlugin(
      {
        id: "errors",
        config: z.object({}),
        setup: ({ messaging }) => ({ ask: messaging.request }),
      },
      {
        subscriptions: () => [subscription],
        jobs: () => [
          defineJob({ name: "fail", input, output: z.string() }).handle(
            async ({ input: value }) => fail(value),
          ),
          defineJob({
            name: "refusal",
            input: z.object({}),
            output: z.object({
              success: z.literal(false),
              error: z.string(),
              code: z.literal("out_of_stock"),
            }),
          }).handle(async () => ({
            success: false,
            error: "Inventory is empty",
            code: "out_of_stock",
          })),
        ],
        tools: ({ state }) => [
          defineTool({
            name: "fail",
            description: "Coded failure",
            input,
            output: z.string(),
            execute: ({ input: value }) => fail(value),
          }),
          defineTool({
            name: "request",
            description: "Typed request",
            input,
            output: z.unknown(),
            execute: ({ input: value }) => state.ask(subscription, value),
          }),
          defineTool({
            name: "refusal",
            description: "Domain refusal",
            input: z.object({}),
            output: z.object({
              success: z.literal(false),
              reason: z.literal("already_exists"),
            }),
            execute: () => ({ success: false, reason: "already_exists" }),
          }),
        ],
      },
    );
    const harness = createBrainTestHarness();
    try {
      const installed = await harness.installPackage(fixture);
      const tool = installed.tools.find((entry) =>
        entry.name.endsWith("_fail"),
      );
      const request = installed.tools.find((entry) =>
        entry.name.endsWith("_request"),
      );
      const refusal = installed.tools.find((entry) =>
        entry.name.endsWith("_refusal"),
      );
      const job = installed.jobs[0];
      const domainJob = installed.jobs[1];
      if (!tool || !request || !refusal || !job || !domainJob)
        throw new Error("Fixture was not installed");
      for (const code of [...sdkErrorCodeSchema.options, "future_code"]) {
        const expected =
          sdkErrorCodeSchema.safeParse(code).data ?? "handler_failed";
        const answer = await tool.call({ code });
        expect(answer).toMatchObject({ ok: false, code: expected });
        expect(JSON.stringify(answer)).not.toContain(secret);
        expect(await request.call({ code })).toEqual({
          ok: true,
          data: { ok: false, code: expected },
        });
        await expectCodedRejection(job.run({ code }), expected);
      }
      expect(await tool.call({ code: "conflict" })).toMatchObject({
        ok: false,
        code: "conflict",
        error: "Refresh your selection",
      });
      expect(await domainJob.run({})).toEqual({
        success: false,
        error: "Inventory is empty",
        code: "out_of_stock",
      });
      expect(await refusal.call({})).toEqual({
        ok: true,
        data: { success: false, reason: "already_exists" },
      });
    } finally {
      await harness.reset();
    }
  });

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

  it("gives a service route a definition-typed entity reader", async () => {
    const reminder = defineEntity({
      type: "route-reminder",
      purpose: "Route read probe",
      metadata: z.object({ done: z.boolean() }),
    });
    const harness = createBrainTestHarness();
    try {
      await harness.installPackage(
        defineServicePlugin(
          { id: "reminder-routes", config: z.object({}), entities: [reminder] },
          {
            routes: ({ entities }) => [
              defineRoute({
                method: "GET",
                path: "/reminders/due",
                security: { kind: "public" },
                response: z.object({ ids: z.array(z.string()) }),
                handle: async () => {
                  expect(Object.isFrozen(entities)).toBe(true);
                  expect(entities).not.toHaveProperty("create");
                  // @ts-expect-error A route slot receives a reader, not a writer.
                  void entities.create;
                  const { list } = entities;
                  const items = await list(reminder);
                  return {
                    ids: items
                      .filter((item) => {
                        const done: boolean = item.metadata.done;
                        return !done;
                      })
                      .map((item) => item.id),
                  };
                },
              }),
            ],
          },
        ),
      );
      harness.addEntities([
        {
          id: "due",
          entityType: reminder.type,
          content: "Call Sam",
          metadata: { done: false },
        },
      ]);
      expect(await harness.fetch("GET", "/reminders/due")).toEqual({
        ids: ["due"],
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

  it("looks up tools, jobs, and templates by exact local name with useful failures", async () => {
    const harness = createBrainTestHarness();
    const definition = defineServicePlugin(
      { id: "local-reader", config: z.object({}) },
      {
        tools: () => [
          defineTool({
            name: "remind-later",
            description: "Remind",
            input: z.object({}),
            output: z.object({ done: z.boolean() }),
            execute: () => ({ done: true }),
          }),
        ],
        jobs: () => [
          defineJob({
            name: "fire",
            input: z.object({}),
            output: z.boolean(),
          }).handle(async () => true),
        ],
        templates: {
          "due-list": {
            schema: z.object({ text: z.string() }),
            format: ({ value }) => value.text,
          },
        },
      },
    );
    try {
      const installed = await harness.installPackage(definition);
      expect(installed.tool("remind-later").localName).toBe("remind-later");
      expect(installed.tool("remind-later").name).toBe(
        "local-reader_remind-later",
      );
      expect(await installed.tool("remind-later").call({})).toEqual({
        ok: true,
        data: { done: true },
      });
      expect(await installed.job("fire").run({})).toBe(true);
      expect(harness.templateNames()).toEqual(["due-list"]);
      expect(harness.formatTemplate("due-list", { text: "Call Sam" })).toBe(
        "Call Sam",
      );
      expect(() => installed.tool("later")).toThrow("remind-later");
      expect(() => installed.job("missing")).toThrow("fire");
      expect(() => harness.formatTemplate("missing", {})).toThrow("due-list");
      await harness.installPackage(
        defineServicePlugin(
          { id: "other-reader", config: z.object({}) },
          {
            templates: {
              "due-list": {
                schema: z.object({ text: z.string() }),
                format: ({ value }) => value.text,
              },
            },
          },
        ),
        {},
        { name: "@fixture/other", version: "0.0.0" },
      );
      expect(() =>
        harness.formatTemplate("due-list", { text: "Ambiguous" }),
      ).toThrow("Ambiguous");
      await harness.reset();
      expect(harness.templateNames()).toEqual([]);
      expect(() => harness.formatTemplate("due-list", {})).toThrow(
        "No template",
      );
    } finally {
      await harness.reset();
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
      expect(harness.formatTemplate("card", value)).toBe("# Boundaries");
      expect(() => harness.formatTemplate("card", { title: 7 })).toThrow();
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

  it("keeps colliding package names and namespace suffixes in separate state stores", async () => {
    const definition = defineServicePlugin(
      {
        id: "owner-state",
        config: z.object({ namespace: z.string(), value: z.string() }),
        setup: async ({ config, runtimeState }) => {
          const store = runtimeState({
            namespace: config.namespace,
            schema: z.string(),
          });
          await store.set("shared-key", config.value);
          return { store };
        },
      },
      {
        tools: ({ state }) => [
          defineTool({
            name: "read",
            description: "Read this owner's state",
            input: z.object({}),
            output: z.string().nullable(),
            execute: () => state.store.get("shared-key"),
          }),
        ],
      },
    );
    const cases = [
      { name: "@scope/pkg", namespace: "cache" },
      { name: "scope.pkg", namespace: "cache" },
      { name: "scope", namespace: "pkg.cache" },
      { name: "@scope/pkg.extra", namespace: "cache" },
      { name: "@scope.pkg/extra", namespace: "cache" },
    ];
    const harness = createBrainTestHarness();
    try {
      const reads: Array<() => Promise<unknown>> = [];
      for (const entry of cases) {
        const installed = await harness.installPackage(
          definition,
          { namespace: entry.namespace, value: entry.name },
          { name: entry.name, version: "0.1.0" },
        );
        const tool = installed.tools[0];
        if (!tool) throw new Error("Read tool not installed");
        reads.push(() => tool.call({}));
      }
      for (const [index, read] of reads.entries()) {
        expect(await read()).toEqual({ ok: true, data: cases[index]?.name });
      }
    } finally {
      await harness.reset();
    }
  });

  it("keeps returned view metadata local to its reader", async () => {
    const entity = defineEntity({
      type: "view-record",
      purpose: "View metadata boundary",
      metadata: z.object({}),
      templates: {
        card: createTemplate({
          name: "card",
          description: "A scripted view",
          requiredPermission: "public",
          schema: z.object({}),
          layout: {
            component: (): never => {
              throw new Error("Rendering is not exercised here");
            },
          },
          runtimeScripts: [{ src: "/scripts/card.js", defer: true }],
          staticAssets: { "/scripts/card.js": "original" },
        }),
      },
    });
    let check: (() => void) | undefined;
    const definition = defineServicePlugin(
      {
        id: "view-reader",
        config: z.object({}),
        entities: [entity],
        setup: ({ views }) => {
          check = (): void => {
            const name = "@fixture/views:view-record:card";
            for (const view of [views.get(name), ...views.list()]) {
              if (!view?.runtimeScripts?.[0] || !view.staticAssets)
                throw new Error("Expected view metadata");
              view.runtimeScripts[0].src = "/changed.js";
              view.runtimeScripts.push({ src: "/added.js" });
              view.staticAssets["/scripts/card.js"] = "changed";
            }
            expect(views.get(name)?.runtimeScripts).toEqual([
              { src: "/scripts/card.js", defer: true },
            ]);
            expect(
              views.list().find((view) => view.name === name)?.staticAssets,
            ).toEqual({ "/scripts/card.js": "original" });
            expect(views.getRenderer(name)).toBe(
              views.get(name)?.renderers.web,
            );
          };
          return {};
        },
      },
      {},
    );
    const harness = createBrainTestHarness();
    try {
      await harness.installPackage(
        definition,
        {},
        { name: "@fixture/views", version: "0.1.0" },
      );
      await harness.finalizeRegistration();
      if (!check) throw new Error("View reader was not initialized");
      check();
    } finally {
      await harness.reset();
    }
  });

  it("gives attachment factories only their declared media context", async () => {
    const harness = createBrainTestHarness({ domain: "media.test" });
    let media: MediaAttachmentContext | undefined;
    const entity = defineEntity({
      type: "media-boundary",
      purpose: "Media factory boundary",
      metadata: z.object({}),
      attachments: [
        {
          type: "preview",
          provider: (context): AttachmentProvider => {
            media = context;
            expect(Object.keys(context).sort()).toEqual([
              "domain",
              "entityService",
              "identity",
              "themeCSS",
            ]);
            expect(Object.isFrozen(context)).toBe(true);
            expect(Object.keys(context.identity)).toEqual(["getProfile"]);
            expect(Object.isFrozen(context.identity)).toBe(true);
            expect(Object.keys(context.entityService).sort()).toEqual([
              "getEntity",
              "listEntities",
            ]);
            expect(Object.isFrozen(context.entityService)).toBe(true);
            expect(context).not.toHaveProperty("messaging");
            expect(context).not.toHaveProperty("jobs");
            expect(context.entityService).not.toHaveProperty("deleteEntity");
            // @ts-expect-error Media factories do not receive the plugin's message bus.
            void context.messaging;
            // @ts-expect-error Media factories cannot replace identity configuration.
            void context.identity.updateProfile;
            // @ts-expect-error The media entity reader does not expose mutations.
            void context.entityService.deleteEntity;
            return { resolve: (): undefined => undefined };
          },
        },
      ],
    });
    try {
      await harness.installPackage(
        defineServicePlugin(
          { id: "media-package", config: z.object({}), entities: [entity] },
          {},
        ),
      );
      await harness.finalizeRegistration();
      if (!media) throw new Error("Media factory was not invoked");
      expect(media.domain).toBe("media.test");
      expect(typeof media.themeCSS).toBe("string");
      const { getProfile } = media.identity;
      expect(getProfile()).toHaveProperty("name");
      const { getEntity, listEntities } = media.entityService;
      expect(
        await getEntity({ entityType: entity.type, id: "missing" }),
      ).toBeNull();
      expect(await listEntities({ entityType: entity.type })).toEqual([]);
    } finally {
      await harness.reset();
    }
  });

  it("isolates same-ID upload owners in both interface families", async () => {
    const harness = createBrainTestHarness();
    const paths: string[] = [];
    const options = {
      namespace: "upload",
      refKind: "upload",
      routePath: "/uploads",
    };
    const capture = (
      store: ScopedRuntimeUploadStore,
    ): Record<string, never> => {
      const path = store.getUploadDir(
        "upload-00000000-0000-4000-8000-000000000001",
      );
      paths.push(path);
      const directory = path.split(/[\\/]/u).at(-3);
      expect(directory).toMatch(/^interface-upload-[a-f0-9]{64}$/u);
      expect(Object.isFrozen(store)).toBe(true);
      return {};
    };
    try {
      for (const family of ["interface", "message-interface"] as const) {
        for (const label of ["first", "second"]) {
          const definition =
            family === "interface"
              ? defineInterface(
                  {
                    id: "same-id",
                    config: z.object({}),
                    setup: ({ uploads }) => capture(uploads(options)),
                  },
                  {},
                )
              : defineMessageInterface(
                  {
                    id: "same-id",
                    config: z.object({}),
                    channel: {
                      type: label,
                      displayName: label,
                      subjectLabel: "Recipient",
                      recipient: z.string(),
                    },
                    setup: ({ uploads }) => capture(uploads(options)),
                  },
                  { send: () => "unused" },
                );
          await harness.installPackage(
            definition,
            {},
            { name: `@fixture/upload-${family}-${label}`, version: "0.1.0" },
          );
        }
      }
      await harness.finalizeRegistration();
      expect(paths).toHaveLength(4);
      expect(new Set(paths).size).toBe(4);
    } finally {
      await harness.reset();
    }
  });

  it("isolates same-ID interface owners and formerly overlapping package state", async () => {
    for (const family of ["interface", "message-interface"] as const) {
      const harness = createBrainTestHarness();
      const reads: Array<{
        read: () => Promise<string | null>;
        expected: string;
      }> = [];
      const namespaces = [
        "inbound.uid-cursor",
        "inbound.source-locators",
        "cache",
      ];
      const capture = async (
        store: IRuntimeStateStore<string>,
        value: string,
      ): Promise<void> => {
        await store.set("shared-key", value);
        reads.push({ read: () => store.get("shared-key"), expected: value });
      };
      const ordinary = defineInterface({
        id: "email",
        config: z.object({ label: z.string() }),
        setup: async ({ runtimeState, config }) => {
          for (const namespace of namespaces) {
            await capture(
              runtimeState({ namespace, schema: z.string() }),
              `${config.label}:${namespace}`,
            );
          }
          return {};
        },
      });
      const definition =
        family === "interface"
          ? ordinary
          : defineMessageInterface(
              {
                id: "email",
                config: z.object({ label: z.string() }),
                channel: {
                  type: "email",
                  displayName: "Email",
                  subjectLabel: "Mailbox",
                  recipient: z.string(),
                },
                setup: async ({ runtimeState, config }) => {
                  for (const namespace of namespaces) {
                    await capture(
                      runtimeState({ namespace, schema: z.string() }),
                      `${config.label}:${namespace}`,
                    );
                  }
                  return {};
                },
              },
              { send: () => "unused" },
            );
      try {
        await harness.installPackage(
          definition,
          { label: "first" },
          { name: "@fixture/first", version: "0.1.0" },
        );
        await harness.installPackage(
          ordinary,
          { label: "second" },
          { name: "@fixture/second", version: "0.1.0" },
        );
        await harness.installPackage(
          defineServicePlugin(
            {
              id: "package-state",
              config: z.object({}),
              setup: async ({ runtimeState }) => {
                for (const namespace of ["uid-cursor", "source-locators"]) {
                  await capture(
                    runtimeState({ namespace, schema: z.string() }),
                    `package:${namespace}`,
                  );
                }
                return {};
              },
            },
            {},
          ),
          {},
          { name: "@email/inbound", version: "0.1.0" },
        );
        await harness.finalizeRegistration();
        expect(reads).toHaveLength(8);
        for (const { read, expected } of reads)
          expect(await read()).toBe(expected);
      } finally {
        await harness.reset();
      }
    }
  });

  it("isolates declared registration metadata and rejects invalid entity policy", async () => {
    const metadata = {
      outputEntityType: "image" as const,
      targetField: "coverImageId" as const,
      privateRuntime: true,
    };
    const config = {
      weight: 2,
      publish: { publishStatuses: ["published"] },
      get privateRuntime(): never {
        throw new Error("Undeclared config getter was read");
      },
    };
    const entity = defineEntity({
      type: "metadata-owner",
      purpose: "Registration metadata probe",
      metadata: z.object({}),
      config,
      attachments: [
        {
          type: "cover",
          provider: (): AttachmentProvider => ({
            metadata,
            resolve: (): undefined => undefined,
          }),
        },
      ],
    });
    const harness = createBrainTestHarness();
    try {
      await harness.installPackage(
        defineServicePlugin(
          {
            id: "metadata-reader",
            config: z.object({}),
            entities: [entity],
            setup: ({ attachments, lifecycle }) => {
              lifecycle.onRegistered(() => {
                const read = attachments.getProviderMetadata(
                  "metadata-owner",
                  "cover",
                );
                if (!read) throw new Error("Declared metadata missing");
                expect(read).toEqual({
                  outputEntityType: "image",
                  targetField: "coverImageId",
                });
                expect(read).not.toBe(metadata);
                // @ts-expect-error Reader metadata does not include implementation fields.
                void read.privateRuntime;
                read.outputEntityType = "document";
                read.targetField = "ogImageId";
                Reflect.set(metadata, "targetField", "ogImageId");
                expect(
                  attachments.getProviderMetadata("metadata-owner", "cover"),
                ).toEqual({
                  outputEntityType: "image",
                  targetField: "coverImageId",
                });
              });
              return {};
            },
          },
          {},
        ),
      );
      await expectRejection(
        harness.installPackage(
          defineServicePlugin(
            {
              id: "invalid-policy",
              config: z.object({}),
              entities: [
                defineEntity({
                  type: "policy-retry",
                  purpose: "Policy validation",
                  metadata: z.object({}),
                  config: { weight: NaN },
                }),
              ],
            },
            {},
          ),
        ),
        "weight",
      );
      await harness.installPackage(
        defineServicePlugin(
          {
            id: "invalid-policy",
            config: z.object({}),
            entities: [
              defineEntity({
                type: "policy-retry",
                purpose: "Policy validation",
                metadata: z.object({}),
                config: { weight: 1 },
              }),
            ],
          },
          {},
        ),
      );
      await harness.finalizeRegistration();
      expect(await harness.getEntity("policy-retry", "missing")).toBeNull();
    } finally {
      await harness.reset();
    }
  });

  it("models selected profile kinds without exposing undeclared registration fields", async () => {
    const fields = z.object({ headline: z.string().default("Builder") });
    const kind = {
      kind: "professional",
      category: "person" as const,
      fields,
      labels: { singular: "Professional", plural: "Professionals" },
      privateRuntime: { replaceSelection: (): void => {} },
    };
    const harness = createBrainTestHarness({ profileKind: "professional" });
    try {
      const installed = await harness.installPackage(
        defineServicePlugin(
          { id: "profile-reader", config: z.object({}) },
          {
            profileKinds: () => [kind],
            jobs: () => [
              defineJob({
                name: "inspect",
                input: z.object({}),
                output: z.object({ kind: z.string(), label: z.string() }),
              }).handle(async ({ profileKinds }) => {
                const selected = profileKinds.getSelectedDefinition();
                if (!selected) throw new Error("Profile kind was not selected");
                expect(Object.keys(selected).sort()).toEqual([
                  "category",
                  "fields",
                  "kind",
                  "labels",
                ]);
                expect(selected).not.toHaveProperty("privateRuntime");
                expect(Object.isFrozen(selected)).toBe(true);
                expect(selected.fields).toBe(fields);
                expect(selected.fields.parse({})).toEqual({
                  headline: "Builder",
                });
                // @ts-expect-error Selected definitions do not expose registration internals.
                void selected.privateRuntime;
                return {
                  kind: profileKinds.getResolved()?.kind ?? "missing",
                  label: selected.labels.singular,
                };
              }),
            ],
          },
        ),
      );
      await harness.finalizeRegistration();
      expect(await installed.jobs[0]?.run({})).toEqual({
        kind: "professional",
        label: "Professional",
      });
    } finally {
      await harness.reset();
    }

    const invalid = createBrainTestHarness({ profileKind: "missing" });
    try {
      await invalid.installPackage(
        defineServicePlugin(
          { id: "missing-kind", config: z.object({}) },
          { profileKinds: () => [kind] },
        ),
      );
      await expectRejection(invalid.finalizeRegistration(), "not registered");
    } finally {
      await invalid.reset();
    }
  });

  it("gives service and entity jobs only their declared reader capabilities", async () => {
    const probe = async ({
      uploads,
      attachments,
      conversations,
      identity,
      logger,
      progress,
    }: Pick<
      JobHandlerContext<unknown>,
      | "uploads"
      | "attachments"
      | "conversations"
      | "identity"
      | "logger"
      | "progress"
    >): Promise<Record<string, string[]>> => {
      expect(Object.keys(progress)).toEqual(["report"]);
      expect(Object.isFrozen(progress)).toBe(true);
      expect(progress).not.toHaveProperty("callback");
      expect(progress).not.toHaveProperty("createSub");
      expect(progress).not.toHaveProperty("startHeartbeat");
      expect(progress).not.toHaveProperty("stopHeartbeat");
      expect(progress).not.toHaveProperty("toCallback");
      // @ts-expect-error Job progress does not own runtime heartbeat timers.
      void progress.startHeartbeat;
      // @ts-expect-error The underlying callback is not an author capability.
      void progress.callback;
      const report = progress.report;
      await report({
        progress: 1,
        total: 1,
        message: "Reader probe completed",
      });
      expect(Object.isFrozen(logger)).toBe(true);
      expect(logger.child("job")).not.toHaveProperty("fileHandle");
      expect(logger.constructor).not.toHaveProperty("resetInstance");
      expect(uploads).not.toHaveProperty("save");
      expect(uploads).not.toHaveProperty("remove");
      expect(uploads).not.toHaveProperty("prune");
      // @ts-expect-error A job cannot save uploads through its reader.
      void uploads.save;
      // @ts-expect-error A job cannot delete uploads through its reader.
      void uploads.remove;
      // @ts-expect-error A job cannot register attachment providers.
      void attachments.register;
      expect(identity.getProfile()).toBeDefined();
      expect(await conversations.get("missing")).toBeNull();
      return {
        uploads: Object.keys(uploads).sort(),
        attachments: Object.keys(attachments).sort(),
        conversations: Object.keys(conversations).sort(),
        identity: Object.keys(identity).sort(),
      };
    };
    const entity = defineEntity({
      type: "reader-record",
      purpose: "Probe job authority",
      metadata: z.object({}),
      jobs: { probe: { input: z.object({}), handle: probe } },
    });
    const service = defineServicePlugin(
      { id: "job-reader", config: z.object({}), entities: [entity] },
      {
        jobs: () => [
          defineJob({
            name: "probe",
            input: z.object({}),
            output: z.record(z.string(), z.array(z.string())),
          }).handle(probe),
        ],
      },
    );
    const harness = createBrainTestHarness();
    try {
      const { jobs } = await harness.installPackage(service);
      expect(jobs).toHaveLength(2);
      for (const job of jobs) {
        expect(await job.run({})).toEqual({
          uploads: ["read"],
          attachments: ["resolve"],
          conversations: ["get", "getManyWithMessages", "getMessages"],
          identity: ["getProfile"],
        });
      }
    } finally {
      await harness.reset();
    }
  });

  it("keeps projection callbacks within their declared read and execution capabilities", async () => {
    const harness = createBrainTestHarness();
    const unsupported = (): never => {
      throw new Error("Unused projection operation");
    };
    const spaces = ["chat"];
    try {
      await harness.installPackage(
        defineServicePlugin(
          {
            id: "projection-reader",
            config: z.object({}),
            setup: async ({ logger }) => {
              const entities = {
                getEntity: async (): Promise<null> => null,
                getEntities: async (): Promise<never[]> => [],
                listEntities: async (): Promise<never[]> => [],
                getEntityTypes: (): string[] => ["topic"],
                hasEntityType: (): boolean => true,
                getEntityTypeConfig: (): Record<string, never> => ({}),
                isProjectionOwnedEntity: async (): Promise<boolean> => false,
                deleteEntity: unsupported,
              };
              const rule = defineProjectionRule({
                id: "reader",
                version: "1",
                sources: [{ kind: "conversation" }],
                targetType: "topic",
                targets: { authority: "additive" },
                inputSchema: z.object({}),
                selectInput: async (_trigger, context) => {
                  expect(Object.isFrozen(context)).toBe(true);
                  expect(Object.isFrozen(context.entities)).toBe(true);
                  expect(context.entities).not.toHaveProperty("deleteEntity");
                  expect(context.conversations).not.toHaveProperty("delete");
                  expect(Object.isFrozen(context.spaces)).toBe(true);
                  expect(Reflect.set(context.spaces, "0", "changed")).toBe(
                    false,
                  );
                  const { getEntityTypes } = context.entities;
                  expect(getEntityTypes()).toEqual(["topic"]);
                  // @ts-expect-error Projection input selection does not mutate entities.
                  void context.entities.deleteEntity;
                  // @ts-expect-error Conversation deletion is not a projection reader operation.
                  void context.conversations.delete;
                  // @ts-expect-error A projection cannot add deployment spaces.
                  void context.spaces.push;
                  return {};
                },
                derive: async (_input, context) => {
                  expect(Object.isFrozen(context)).toBe(true);
                  expect(Object.keys(context.ai).sort()).toEqual([
                    "generate",
                    "generateImage",
                    "generateObject",
                    "query",
                  ]);
                  expect(Object.isFrozen(context.ai)).toBe(true);
                  expect(Object.isFrozen(context.logger)).toBe(true);
                  expect(context.logger).not.toHaveProperty("fileHandle");
                  // @ts-expect-error Derivations only receive the declared AI operations.
                  void context.ai.canGenerateImages;
                  // @ts-expect-error Logger file handles belong to the runtime.
                  void context.logger.fileHandle;
                  return [];
                },
              });
              const signal = new AbortController().signal;
              const selected = await rule.selectInput(
                { waveId: "probe", inputs: [] },
                {
                  entities,
                  spaces,
                  conversations: {
                    get: async () => null,
                    getMessages: async () => [],
                    getManyWithMessages: async () => [],
                  },
                  resolvePrompt: async (_reference, fallback) => fallback,
                  appInfo: unsupported,
                  identityInput: () => ({}),
                },
                signal,
              );
              const runtime = {
                logger: { ...logger, fileHandle: 17 },
                ai: {
                  query: unsupported,
                  generate: unsupported,
                  generateObject: unsupported,
                  generateImage: unsupported,
                  canGenerateImages: (): boolean => false,
                },
              };
              expect(await rule.derive(selected, runtime, signal)).toEqual([]);
              expect(runtime.logger.fileHandle).toBe(17);
              expect(spaces).toEqual(["chat"]);
              return {};
            },
          },
          {},
        ),
      );
    } finally {
      await harness.reset();
    }
  });

  it("gives protocol interfaces declared transport operations and a read-only space snapshot", async () => {
    const harness = createBrainTestHarness();
    let inspected = false;
    try {
      await harness.installPackage(
        defineInterface(
          {
            id: "transport-reader",
            config: z.object({}),
            setup: ({ mcpTransport, spaces }) => {
              expect(Object.isFrozen(spaces)).toBe(true);
              expect(Reflect.set(spaces, "0", "changed")).toBe(false);
              // @ts-expect-error Configured spaces are a read-only snapshot.
              void spaces.push;
              expect(Object.isFrozen(mcpTransport)).toBe(true);
              expect(Object.keys(mcpTransport).sort()).toEqual([
                "createMcpServer",
                "getMcpServer",
                "setPermissionLevel",
                "setProtocolMode",
              ]);
              expect(mcpTransport.setAnchorStatus).toBeUndefined();
              expect(mcpTransport).not.toHaveProperty("registerTool");
              expect(mcpTransport).not.toHaveProperty("messageBus");
              expect(mcpTransport.constructor).not.toHaveProperty(
                "createFresh",
              );
              expect(
                Reflect.set(mcpTransport, "permissionLevel", "admin"),
              ).toBe(false);
              const { setPermissionLevel, setProtocolMode } = mcpTransport;
              setPermissionLevel("public");
              setProtocolMode("basic");
              // @ts-expect-error Transport hosts do not register tools in the runtime service.
              void mcpTransport.registerTool;
              // @ts-expect-error The backing service's bus is not a transport capability.
              void mcpTransport.messageBus;
              // @ts-expect-error Plugin removal belongs to the runtime.
              void mcpTransport.unregisterPlugin;
              inspected = true;
              return {};
            },
          },
          {},
        ),
      );
      expect(inspected).toBe(true);
    } finally {
      await harness.reset();
    }
  });

  it("keeps host registration out of ordinary callback types and runtime objects", async () => {
    const assertLogger = (logger: LoggerContract): void => {
      for (const projected of [
        logger,
        logger.child("child"),
        logger.child("child").child("nested"),
      ]) {
        expect(Object.isFrozen(projected)).toBe(true);
        expect(Object.keys(projected).sort()).toEqual([
          "child",
          "debug",
          "error",
          "info",
          "setUseStderr",
          "silly",
          "verbose",
          "warn",
        ]);
        expect(projected).not.toHaveProperty("fileHandle");
        expect(projected).not.toHaveProperty("formatEntry");
        expect(projected.constructor).not.toHaveProperty("getInstance");
      }
      // @ts-expect-error Logger file descriptors are runtime implementation details.
      void logger.fileHandle;
    };
    const service = defineServicePlugin(
      {
        id: "service-boundary",
        config: z.object({}),
        setup: ({
          auth,
          inbox,
          attachments,
          permissions,
          profileKinds,
          runtimeState,
          logger,
        }) => {
          assertLogger(logger);
          const scope = runtimeState({
            namespace: "boundary",
            schema: z.string(),
          });
          expect(scope).not.toHaveProperty("db");
          expect(Reflect.set(scope, "namespace", "other")).toBe(false);
          // @ts-expect-error Scoped state does not expose a database.
          void scope.db;
          expect({
            permissions: Object.keys(permissions).sort(),
            profileKinds: Object.keys(profileKinds).sort(),
          }).toEqual({
            permissions: ["assertEntityActionAllowed"],
            profileKinds: ["getResolved"],
          });
          // @ts-expect-error Runtime principal replacement is not an author capability.
          void permissions.replaceRuntimePrincipalState;
          // @ts-expect-error Profile kinds are declared, not registered through a reader.
          void profileKinds.register;
          expect(auth).not.toHaveProperty("register");
          expect(auth).not.toHaveProperty("unregister");
          expect(inbox).not.toHaveProperty("registerSource");
          expect(attachments).not.toHaveProperty("register");
          // @ts-expect-error Caller lookup does not return administration commands.
          void auth.getCaller()?.listUsers;
          // @ts-expect-error Audit lookup does not return caller authentication.
          void auth.getAudit()?.resolveSession;
          // @ts-expect-error Identity lookup does not return federation keys.
          void auth.getIdentities()?.getA2ASigningKey;
          // @ts-expect-error Even administration does not expose the auth runtime.
          void auth.getAdministration()?.runtime;
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
      },
      {
        tools: () => [
          defineTool({
            name: "permissions",
            description: "Inspect reaction authority",
            input: z.object({}),
            output: z.array(z.string()),
            execute: ({ permissions, logger }) => {
              assertLogger(logger);
              // @ts-expect-error Reactions cannot replace runtime principals.
              void permissions.replaceRuntimePrincipalState;
              return Object.keys(permissions).sort();
            },
          }),
        ],
      },
    );
    const generic = defineInterface({
      id: "interface-boundary",
      config: z.object({}),
      setup: ({ auth, inbox, profileKinds, identity, uploads, logger }) => {
        assertLogger(logger);
        expect(() =>
          uploads({
            namespace: "x/../../other",
            refKind: "upload",
            routePath: "/uploads",
          }),
        ).toThrow("flat path segment");
        expect(
          uploads({
            namespace: "files",
            refKind: "upload",
            routePath: "/uploads",
          }),
        ).not.toHaveProperty("options");
        expect(Object.keys(profileKinds)).toEqual(["getResolved"]);
        expect(Object.keys(identity).sort()).toEqual(["get", "getProfile"]);
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
        setup: ({ auth, inbox, profileKinds, identity, uploads, logger }) => {
          assertLogger(logger);
          expect(() =>
            uploads({
              namespace: "x/../../other",
              refKind: "upload",
              routePath: "/uploads",
            }),
          ).toThrow("flat path segment");
          expect(
            uploads({
              namespace: "files",
              refKind: "upload",
              routePath: "/uploads",
            }),
          ).not.toHaveProperty("options");
          expect(Object.keys(profileKinds)).toEqual(["getResolved"]);
          expect(Object.keys(identity).sort()).toEqual(["get", "getProfile"]);
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
      const installed = await harness.installPackage(service);
      expect(await installed.tools[0]?.call({})).toEqual({
        ok: true,
        data: ["assertEntityActionAllowed"],
      });
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
      await expectCodedRejection(nonWireJob.run({}), "invalid_response");
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
      handle: ({ payload }) => ({
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

  it("infers literal, enum and union responses without annotations while rejecting invalid returns", async () => {
    const input = z.object({ n: z.string().transform(Number) });
    const response = z.discriminatedUnion("status", [
      z.object({ status: z.literal("ok"), n: z.number() }),
      z.object({
        status: z.literal("empty"),
        reason: z.enum(["none", "filtered"]),
      }),
    ]);
    const route = defineRoute({
      method: "POST",
      path: "/inference",
      security: { kind: "public" },
      body: input,
      response,
      handle: ({ body }) =>
        body.n > 0
          ? { status: "ok", n: body.n }
          : { status: "empty", reason: "none" },
    });
    const asyncRoute = defineRoute({
      method: "POST",
      path: "/inference-async",
      security: { kind: "public" },
      body: input,
      response,
      handle: async ({ body }) => ({ status: "ok", n: body.n }),
    });
    const subscription = defineSubscription({
      topic: "inference:read",
      payload: input,
      response,
      handle: async ({ payload }) =>
        payload.n > 0
          ? { status: "ok", n: payload.n }
          : { status: "empty", reason: "filtered" },
    });
    const tool = defineTool({
      name: "infer",
      description: "Infer a union response",
      input,
      output: response,
      execute: ({ input }) =>
        input.n > 0
          ? { status: "ok", n: input.n }
          : { status: "empty", reason: "none" },
    });
    const asyncTool = defineTool({
      name: "infer-async",
      description: "Infer an async literal response",
      input,
      output: z.object({ status: z.literal("ok"), n: z.number() }),
      execute: async ({ input }) => ({ status: "ok", n: input.n }),
    });

    const rowsSchema = z.object({
      status: z.literal("ok"),
      rows: z.array(
        z.object({
          label: z.enum(["one", "two"]),
          pair: z.tuple([z.literal("x"), z.number()]),
        }),
      ),
    });
    const rowsRoute = defineRoute({
      method: "GET",
      path: "/inference-rows",
      security: { kind: "public" },
      response: rowsSchema,
      handle: () => ({
        status: "ok",
        rows: [{ label: "one", pair: ["x", 1] }],
      }),
    });
    const rowsSubscription = defineSubscription({
      topic: "inference:rows",
      payload: input,
      response: rowsSchema,
      handle: async () => ({
        status: "ok",
        rows: [{ label: "two", pair: ["x", 2] }],
      }),
    });
    const rowsTool = defineTool({
      name: "rows",
      description: "Return immutable nested collections",
      input,
      output: rowsSchema,
      execute: () => ({
        status: "ok",
        rows: [{ label: "one", pair: ["x", 3] }],
      }),
    });
    const wrongRows = (): {
      status: "ok";
      rows: { label: "one"; pair: ["wrong", number] }[];
    } => ({ status: "ok", rows: [{ label: "one", pair: ["wrong", 1] }] });
    // @ts-expect-error Allowing immutable collections must not weaken tuple element constraints.
    defineRoute({ ...rowsRoute, handle: wrongRows });
    // @ts-expect-error Subscription tuples keep their exact element types.
    defineSubscription({ ...rowsSubscription, handle: wrongRows });
    // @ts-expect-error Tool tuples keep their exact element types.
    defineTool({ ...rowsTool, execute: wrongRows });

    class NominalAnswer {
      private readonly value = 7;
      read(): number {
        return this.value;
      }
    }
    const nominalTool = defineTool({
      name: "nominal",
      description: "Preserve opaque schema input types",
      input,
      output: z.instanceof(NominalAnswer),
      execute: () => new NominalAnswer(),
    });
    const structuralImpostor = (): { read(): number } => ({ read: () => 7 });
    // @ts-expect-error Readonly collection support must not erase nominal class constraints.
    defineTool({ ...nominalTool, execute: structuralImpostor });

    const wrongLiteral = (): { status: "typo"; n: number } => ({
      status: "typo",
      n: 1,
    });
    const wrongProperty = (): { status: "ok"; n: string } => ({
      status: "ok",
      n: "wrong",
    });
    const missingProperty = async (): Promise<{ status: "ok" }> => ({
      status: "ok",
    });
    // @ts-expect-error The const return type must not widen the response schema to accept a wrong literal.
    defineRoute({ ...route, handle: wrongLiteral });
    // @ts-expect-error A wrong property type is still rejected.
    defineRoute({ ...route, handle: wrongProperty });
    // @ts-expect-error Async results must still include required properties.
    defineRoute({ ...route, handle: missingProperty });
    // @ts-expect-error Subscription responses retain their declared literal constraints.
    defineSubscription({ ...subscription, handle: wrongLiteral });
    // @ts-expect-error Async subscription responses must include required properties.
    defineSubscription({ ...subscription, handle: missingProperty });
    // @ts-expect-error Tool answers must still satisfy the output schema.
    defineTool({ ...tool, execute: wrongProperty });
    // @ts-expect-error Async tool answers must still include required properties.
    defineTool({ ...tool, execute: missingProperty });

    const transformed = defineRoute({
      method: "GET",
      path: "/transformed-output",
      security: { kind: "public" },
      response: z.string().transform(Number),
      handle: () => "7",
    });
    const parsedOutput = (): number => 7;
    // @ts-expect-error A handler supplies input to the response schema, never its transformed output.
    defineRoute({ ...transformed, handle: parsedOutput });
    const transformedSubscription = defineSubscription({
      topic: "inference:transformed",
      payload: input,
      response: z.string().transform(Number),
      handle: () => "7",
    });
    // @ts-expect-error Subscription handlers also return response-schema input.
    defineSubscription({ ...transformedSubscription, handle: parsedOutput });
    const transformedTool = defineTool({
      name: "transform",
      description: "Transform an answer",
      input,
      output: z.string().transform(Number),
      execute: () => "7",
    });
    // @ts-expect-error Tool handlers also return response-schema input.
    defineTool({ ...transformedTool, execute: parsedOutput });

    const harness = createBrainTestHarness();
    try {
      const installed = await harness.installPackage(
        defineServicePlugin(
          { id: "inference", config: z.object({}) },
          {
            routes: () => [route, asyncRoute, transformed, rowsRoute],
            subscriptions: () => [
              subscription,
              transformedSubscription,
              rowsSubscription,
            ],
            tools: () => [tool, asyncTool, transformedTool, rowsTool],
          },
        ),
      );
      expect(
        await harness.fetch("POST", "/inference", { body: { n: "7" } }),
      ).toEqual({ status: "ok", n: 7 });
      expect(
        await harness.fetch("POST", "/inference", { body: { n: "0" } }),
      ).toEqual({ status: "empty", reason: "none" });
      expect(
        await harness.fetch("POST", "/inference-async", { body: { n: "8" } }),
      ).toEqual({ status: "ok", n: 8 });
      expect(await harness.fetch("GET", "/transformed-output")).toBe(7);
      expect(await harness.fetch("GET", "/inference-rows")).toEqual({
        status: "ok",
        rows: [{ label: "one", pair: ["x", 1] }],
      });
      expect(await harness.request(rowsSubscription, { n: "0" })).toEqual({
        ok: true,
        data: { status: "ok", rows: [{ label: "two", pair: ["x", 2] }] },
      });
      expect(await installed.tools[3]?.call({ n: "0" })).toEqual({
        ok: true,
        data: { status: "ok", rows: [{ label: "one", pair: ["x", 3] }] },
      });
      const answer = await harness.request(subscription, { n: "0" });
      if (!answer.ok || answer.data.status !== "empty")
        throw new Error("Missing union answer");
      const reason: "none" | "filtered" = answer.data.reason;
      expect(reason).toBe("filtered");
      expect(
        await harness.request(transformedSubscription, { n: "0" }),
      ).toEqual({ ok: true, data: 7 });
      expect(await installed.tools[0]?.call({ n: "1" })).toEqual({
        ok: true,
        data: { status: "ok", n: 1 },
      });
      expect(await installed.tools[1]?.call({ n: "2" })).toEqual({
        ok: true,
        data: { status: "ok", n: 2 },
      });
      expect(await installed.tools[2]?.call({ n: "3" })).toEqual({
        ok: true,
        data: 7,
      });
    } finally {
      await harness.reset();
    }
  });

  it("hands every subscription family scoped entity access rather than the full entity service", async () => {
    const note = defineEntity({
      type: "note",
      purpose: "A reader probe",
      metadata: z.object({}),
    });
    for (const family of ["service", "interface", "message"]) {
      const subscription = defineSubscription({
        topic: "reader:probe",
        payload: z.object({}),
        response: z.object({
          keys: z.array(z.string()),
          identityKeys: z.array(z.string()),
          content: z.string(),
          count: z.number(),
          known: z.boolean(),
        }),
        handle: async ({ entities, identity }) => {
          // @ts-expect-error A subscription does not read host deployment metadata.
          void identity.getAppInfo;
          expect(identity.getProfile()).toBeDefined();
          expect(entities).not.toHaveProperty("createEntity");
          expect(entities).not.toHaveProperty("updateEntity");
          expect(entities).not.toHaveProperty("deleteEntity");
          expect(entities).not.toHaveProperty("registerEntityType");
          expect(Object.isFrozen(entities)).toBe(true);
          // @ts-expect-error Scoped mutations do not expose the host's unrestricted writer.
          void entities.createEntity;
          // @ts-expect-error Host registration is not part of a subscription reader.
          void entities.registerEntityType;
          const refusal = await entities
            .create(note, { content: "Denied", metadata: {} })
            .then(
              () => null,
              (cause: unknown): unknown => cause,
            );
          expect(refusal).toBeInstanceOf(Error);
          expect(refusal).toMatchObject({
            message: expect.stringContaining(
              family === "service" ? "may only write" : "cannot write one",
            ),
          });
          const entity = await entities.get(note, "one");
          return {
            keys: Object.keys(entities).sort(),
            identityKeys: Object.keys(identity).sort(),
            content: entity?.content ?? "missing",
            count: (await entities.list(note)).length,
            known: entities.getEntityTypes().includes("note"),
          };
        },
      });
      const header = { id: "reader", config: z.object({}) };
      const behavior = {
        subscriptions: (): AnySubscriptionDefinition[] => [subscription],
      };
      const definition =
        family === "service"
          ? defineServicePlugin(header, behavior)
          : family === "interface"
            ? defineInterface(header, behavior)
            : defineMessageInterface(
                {
                  ...header,
                  channel: {
                    type: "reader",
                    displayName: "Reader",
                    subjectLabel: "Recipient",
                    recipient: z.string(),
                  },
                },
                behavior,
              );
      const harness = createBrainTestHarness();
      try {
        harness.addEntities([
          { id: "one", entityType: "note", content: "Read me", metadata: {} },
        ]);
        await harness.installPackage(definition);
        expect(await harness.request(subscription, {})).toEqual({
          ok: true,
          data: {
            keys: [
              "count",
              "create",
              "createPending",
              "delete",
              "get",
              "getEntity",
              "getEntityCounts",
              "getEntityTypes",
              "list",
              "listEntities",
              "saveProcessed",
              "search",
              "update",
            ],
            identityKeys: ["get", "getProfile"],
            content: "Read me",
            count: 1,
            known: true,
          },
        });
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
