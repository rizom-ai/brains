import { createMockShell } from "../src/test/mock-shell";
import { describe, expect, expectTypeOf, it, mock } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { PermissionService } from "@brains/templates";
import {
  MAX_GENERATION_REQUEST_BYTES,
  MAX_GENERATION_TARGETS,
} from "@brains/content-service";
import { z } from "@brains/utils/zod";
import { PluginManager } from "../src/manager/pluginManager";
import { PluginStatus } from "../src/manager/types";
import { createPluginHarness } from "../src/test/harness";
import {
  defineAccountSettings,
  defineDashboardWidget,
  defineEntity,
  defineEntityPackage,
  defineJob,
  defineServicePlugin,
  defineTool,
  instantiatePluginPackageDefinition,
} from "../src";

const digestInput = z.object({ bookmarkId: z.string() });
const digestOutput = z.object({ bookmarkId: z.string(), words: z.number() });

const digestJob = defineJob({
  name: "compile-digest",
  input: digestInput,
  output: digestOutput,
  retry: { attempts: 2 },
  deadline: "30s",
});

describe("declarative service definitions", () => {
  it("bounds target construction and admission after ingress normalization", async () => {
    let validations = 0;
    const section = defineEntity({
      type: "bounded-section",
      purpose: "Bounded generation test",
      metadata: z.object({
        title: z.string().refine(() => {
          validations++;
          return true;
        }),
      }),
    });
    const definition = defineServicePlugin(
      {
        id: "bounded-content",
        config: z.object({}),
        entities: [section],
      },
      {
        templates: {
          chapter: {
            schema: z.string(),
            generation: { prompt: "Write" },
            format: ({ value }) => value,
          },
        },
        tools: ({ content }) => [
          defineTool({
            name: "generate",
            description: "Generate bounded sections",
            sideEffects: "writes",
            input: z.object({
              count: z.number(),
              text: z.string().transform((value) => value.repeat(3)),
              dryRun: z.boolean(),
            }),
            output: z.object({ queuedTargets: z.number() }),
            async execute({ input }) {
              const target = content.target({
                template: "chapter",
                destination: {
                  entity: section,
                  idPath: ["section"],
                  metadata: { title: input.text },
                },
              });
              const result = await content.generate({
                dryRun: input.dryRun,
                targets: Array.from({ length: input.count }, () => target),
              });
              return { queuedTargets: result.queuedTargets };
            },
          }),
        ],
      },
    );
    const [plugin] = instantiatePluginPackageDefinition(
      definition,
      {},
      { name: "@fixture/bounded-content", version: "0.1.0" },
    );
    if (!plugin) throw new Error("Missing service");
    const harness = createPluginHarness({ logger: createSilentLogger() });
    const capabilities = await harness.installPlugin(plugin);
    for (const dryRun of [false, true]) {
      // Each target's metadata is validated once at construction; the single
      // admission check then measures the ingress-normalized request as submitted.
      for (const [count, text, expectedValidations] of [
        [MAX_GENERATION_TARGETS + 1, "small", 1],
        [1, "x".repeat(MAX_GENERATION_REQUEST_BYTES), 1],
        [1, "x".repeat(MAX_GENERATION_REQUEST_BYTES / 2), 1],
        [4, "x".repeat(100_000), 1],
      ] as const) {
        validations = 0;
        const outcome = await capabilities.tools[0]?.handler(
          { count, text, dryRun },
          {
            interfaceType: "test",
            actor: { kind: "service", serviceId: "test" },
            userPermissionLevel: "admin",
          },
        );
        expect(outcome).toMatchObject({
          success: false,
          code: "handler_failed",
          error: "The operation failed",
        });
        if (!outcome) throw new Error("Missing tool response");
        expect(harness.getToolFailureCause(outcome)).toMatchObject({
          message: expect.stringContaining("exceeds"),
        });
        expect(validations).toBe(expectedValidations);
      }
    }
    expect(
      await harness.getMockShell().getJobQueueService().getRecentJobs(),
    ).toHaveLength(0);
  });
  it("generates structured entity paths through a no-layout template", async () => {
    const bookSection = defineEntity({
      type: "book-section",
      purpose: "A generated section of a book.",
      metadata: z.object({
        bookId: z.string(),
        sectionId: z.string(),
        order: z.number().int().nonnegative(),
      }),
    });
    const definition = defineServicePlugin(
      {
        id: "book-content",
        config: z.object({}),
        entities: [bookSection],
      },
      {
        templates: {
          chapter: {
            schema: z.object({ title: z.string(), body: z.string() }),
            generation: {
              prompt: "Write the requested chapter.",
              useKnowledgeContext: true,
            },
            format: ({ value }) => `# ${value.title}\n\n${value.body}`,
          },
        },
        tools: ({ content }) => [
          defineTool({
            name: "generate-chapter",
            description: "Generate one chapter.",
            input: z.object({}),
            output: z.object({
              batchId: z.string(),
              queuedTargets: z.number(),
            }),
            sideEffects: "writes",
            async execute() {
              const result = await content.generate({
                targets: [
                  content.target({
                    template: "chapter",
                    context: { data: { chapterTitle: "Arrival" } },
                    destination: {
                      entity: bookSection,
                      idPath: ["book-1", "part-1", "chapter-2"],
                      metadata: {
                        bookId: "book-1",
                        sectionId: "chapter-2",
                        order: 2,
                      },
                    },
                  }),
                ],
              });
              if (!result.batchId) throw new Error("Generation was not queued");
              return {
                batchId: result.batchId,
                queuedTargets: result.queuedTargets,
              };
            },
          }),
        ],
      },
    );
    const [plugin] = instantiatePluginPackageDefinition(
      definition,
      {},
      { name: "@fixture/book-content", version: "0.1.0" },
    );
    if (!plugin) throw new Error("Service plugin was not created");

    const harness = createPluginHarness({ logger: createSilentLogger() });
    harness.setPermissionService(
      new PermissionService({ admins: ["service:test"] }),
    );
    const entityPlugins = instantiatePluginPackageDefinition(
      defineEntityPackage({ id: "book-entities", entities: [bookSection] }),
      {},
      { name: "@fixture/book-entities", version: "0.1.0" },
    );
    for (const entityPlugin of entityPlugins)
      await harness.installPlugin(entityPlugin);
    const capabilities = await harness.installPlugin(plugin);
    const result = await capabilities.tools[0]?.handler(
      {},
      {
        interfaceType: "test",
        actor: { kind: "service", serviceId: "test" },
        userPermissionLevel: "admin",
      },
    );

    const admission = z
      .object({ data: z.object({ batchId: z.string() }) })
      .parse(result);
    expect(result).toMatchObject({
      success: true,
      data: {
        batchId: admission.data.batchId,
        queuedTargets: 1,
      },
    });
    // The shared root job ID is the durable handle for the admitted children.
    expect(
      await harness
        .getMockShell()
        .getJobQueueService()
        .getJobsByRootJobId(admission.data.batchId),
    ).toHaveLength(1);
    const cancelled = await capabilities.tools[0]?.handler(
      {},
      {
        interfaceType: "test",
        actor: { kind: "service", serviceId: "test" },
        userPermissionLevel: "admin",
        signal: AbortSignal.abort(new Error("Cancelled before generation")),
      },
    );
    expect(cancelled).toMatchObject({ success: false });
    expect(
      await harness.getMockShell().getJobQueueService().getRecentJobs(),
    ).toHaveLength(1);
  });

  it("infers config, state, jobs, templates, and plain tool output", async () => {
    let cleaned = false;
    const definition = defineServicePlugin(
      {
        id: "reading-insights",
        config: z.object({ prefix: z.string().default("Digest") }),
        setup({ config, lifecycle }) {
          expectTypeOf(config.prefix).toEqualTypeOf<string>();
          lifecycle.onCleanup(() => {
            cleaned = true;
          });
          return {
            summarize(bookmarkId: string): {
              bookmarkId: string;
              words: number;
            } {
              return { bookmarkId, words: 3 };
            },
          };
        },
      },
      {
        templates: {
          digest: {
            schema: digestOutput,
            format: ({ value }) => `${value.bookmarkId}: ${value.words}`,
          },
        },
        jobs: ({ state }) => [
          digestJob.handle(async ({ input, templates }) => {
            const output = state.summarize(input.bookmarkId);
            expect(templates.format("digest", output)).toBe("saved: 3");
            return output;
          }),
        ],
        resources: ({ config }) => ({
          guide: {
            uri: "reading://guide",
            read: (): string => config.prefix,
          },
        }),
        tools: ({ jobs }) => [
          defineTool({
            name: "compile-digest",
            description: "Compile a reading digest.",
            input: digestInput,
            output: z.object({ jobId: z.string() }),
            confirmation: "Compile this digest?",
            async execute({ input }) {
              const job = await jobs.enqueue(digestJob, input);
              return { jobId: job.id };
            },
          }),
        ],
      },
    );

    const [plugin] = instantiatePluginPackageDefinition(
      definition,
      {},
      { name: "@fixture/reading-insights", version: "0.1.0" },
    );
    if (!plugin) throw new Error("Service plugin was not created");

    const harness = createPluginHarness();
    const capabilities = await harness.installPlugin(plugin);
    expect(capabilities.instructions).toBeUndefined();
    expect(capabilities.tools.map(({ name }) => name)).toEqual([
      "reading-insights_compile-digest",
    ]);
    expect(capabilities.resources.map(({ uri }) => uri)).toEqual([
      "reading://guide",
    ]);
    expect(await capabilities.resources[0]?.handler()).toEqual({
      contents: [
        {
          uri: "reading://guide",
          mimeType: "text/plain",
          text: "Digest",
        },
      ],
    });

    const confirmation = await harness.executeTool(
      "reading-insights_compile-digest",
      { bookmarkId: "saved" },
    );
    expect(confirmation).toMatchObject({
      needsConfirmation: true,
      toolName: "reading-insights_compile-digest",
      summary: "Compile this digest?",
    });
    if (!("needsConfirmation" in confirmation)) {
      throw new Error("Tool did not request confirmation");
    }
    const result = await capabilities.tools[0]?.handler(confirmation.args, {
      interfaceType: "test",
      actor: { kind: "service", serviceId: "test" },
      userPermissionLevel: "admin",
    });
    expect(result).toMatchObject({
      success: true,
      data: { jobId: expect.stringContaining("job-") },
    });

    await plugin.shutdown?.();
    expect(cleaned).toBeTrue();
  });

  it("fails finalization when service account settings have no auth backend", async () => {
    const settings = defineAccountSettings({
      title: "Reading provider",
      schema: z.object({ token: z.string() }),
      fields: { token: { label: "Token", secret: true } },
    });
    const definition = defineServicePlugin({
      id: "account-service",
      config: z.object({}),
      accountSettings: settings,
    });
    const [plugin] = instantiatePluginPackageDefinition(
      definition,
      {},
      { name: "@fixture/account-service", version: "0.1.0" },
    );
    if (!plugin) throw new Error("Service plugin was not created");
    const harness = createPluginHarness();
    await harness.installPlugin(plugin);
    expect(harness.finalizeRegistration()).rejects.toThrow(
      "require auth-service and an account settings encryption key",
    );
  });

  it("rolls back durable registrations when service registration fails", async () => {
    const binding = digestJob.handle(async ({ input }) => ({
      bookmarkId: input.bookmarkId,
      words: 1,
    }));
    const definition = defineServicePlugin(
      {
        id: "failing-service",
        config: z.object({}),
        setup: () => ({}),
      },
      {
        jobs: () => [binding, binding],
      },
    );
    const [plugin] = instantiatePluginPackageDefinition(
      definition,
      {},
      { name: "@fixture/failing-service", version: "0.1.0" },
    );
    if (!plugin) throw new Error("Service plugin was not created");

    const logger = createSilentLogger("service-rollback-test");
    const shell = createMockShell({ logger });
    const queue = shell.getJobQueueService();
    const registerHandler = mock(queue.registerHandler);
    const unregisterHandlers = mock(queue.unregisterPluginHandlers);
    queue.registerHandler = registerHandler;
    queue.unregisterPluginHandlers = unregisterHandlers;
    shell.getJobQueueService = (): typeof queue => queue;
    const unregisterCapabilities = mock(async () => {});
    shell.unregisterPluginCapabilities = unregisterCapabilities;

    const manager = PluginManager.createFresh(
      logger,
      shell.getDaemonRegistry(),
    );
    manager.setShell(shell);
    manager.registerPlugin(plugin);
    await manager.initializePlugins();

    expect(registerHandler).toHaveBeenCalledTimes(1);
    expect(unregisterHandlers).toHaveBeenCalledWith(plugin.id);
    expect(unregisterCapabilities).toHaveBeenCalledWith(plugin.id);
    expect(manager.getPluginStatus(plugin.id)).toBe(PluginStatus.ERROR);
  });

  it("replays confirmations statelessly and attributes enqueued jobs", async () => {
    const attributedJob = defineJob({
      name: "attributed-job",
      input: digestInput,
      output: digestOutput,
    });
    const definition = defineServicePlugin(
      {
        id: "replay-service",
        config: z.object({}),
        setup: () => ({}),
      },
      {
        jobs: () => [
          attributedJob.handle(async ({ input }) => ({
            bookmarkId: input.bookmarkId,
            words: 1,
          })),
        ],
        tools: ({ jobs }) => [
          defineTool({
            name: "compile",
            description: "Compile a digest.",
            input: digestInput,
            output: z.object({ jobId: z.string() }),
            confirmation: "Compile this digest?",
            async execute({ input }) {
              const job = await jobs.enqueue(attributedJob, input);
              return { jobId: job.id };
            },
          }),
        ],
      },
    );
    const makePlugin = (): NonNullable<
      ReturnType<typeof instantiatePluginPackageDefinition>[number]
    > => {
      const [plugin] = instantiatePluginPackageDefinition(
        definition,
        {},
        {
          name: "@fixture/replay-service",
          version: "0.1.0",
        },
      );
      if (!plugin) throw new Error("Service plugin was not created");
      return plugin;
    };

    const toolContext = {
      interfaceType: "test",
      actor: { kind: "service", serviceId: "test" },
      userPermissionLevel: "admin",
    } as const;

    const harness = createPluginHarness();
    const shell = harness.getMockShell();
    const queue = shell.getJobQueueService();
    const enqueue = mock(queue.enqueue);
    queue.enqueue = enqueue;
    shell.getJobQueueService = (): typeof queue => queue;
    const capabilities = await harness.installPlugin(makePlugin());
    const tool = capabilities.tools[0];
    if (!tool) throw new Error("Tool was not registered");

    const confirmation = await tool.handler(
      { bookmarkId: "saved" },
      toolContext,
    );
    if (!("needsConfirmation" in confirmation)) {
      throw new Error("Tool did not request confirmation");
    }

    // Tampered replays are rejected against the stored proposal.
    const confirmationArgs = z
      .record(z.string(), z.unknown())
      .parse(confirmation.args);
    const tampered = await tool.handler(
      { ...confirmationArgs, bookmarkId: "other" },
      toolContext,
    );
    expect(tampered).toMatchObject({
      success: false,
      error: expect.stringContaining("do not match the pending approval"),
    });

    // A faithful replay executes and the job carries plugin attribution
    // even though the job declares no retry policy.
    const second = await tool.handler({ bookmarkId: "saved" }, toolContext);
    if (!("needsConfirmation" in second)) {
      throw new Error("Tool did not request confirmation");
    }
    const replayed = await tool.handler(second.args, toolContext);
    expect(replayed).toMatchObject({ success: true });
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          source: expect.stringContaining("replay-service"),
          metadata: expect.objectContaining({
            pluginId: expect.stringContaining("replay-service"),
          }),
        }),
      }),
    );

    // A replay in another runtime instance has no pending proposal to
    // prove — confirmations are process-local by design.
    const fresh = createPluginHarness();
    const freshCapabilities = await fresh.installPlugin(makePlugin());
    const rejected = await freshCapabilities.tools[0]?.handler(
      second.args,
      toolContext,
    );
    expect(rejected).toMatchObject({
      success: false,
      error: expect.stringContaining("confirmation found"),
    });
  });

  it("rejects invalid retry and deadline declarations", () => {
    expect(() =>
      defineJob({
        name: "invalid-retry",
        input: z.object({}),
        output: z.object({}),
        retry: { attempts: 0 },
      }),
    ).toThrow("retry attempts must be at least 1");

    expect(() =>
      defineJob({
        name: "invalid-deadline",
        input: z.object({}),
        output: z.object({}),
        deadline: "0s",
      }),
    ).toThrow("must be positive");
  });

  it("does not bind operator declarations when their hosts are absent", async () => {
    const widget = defineDashboardWidget({
      id: "library",
      title: "Library",
      group: "knowledge",
      placement: "secondary",
      permission: "trusted",
      data: z.object({ count: z.number() }),
      view: () => ({ blocks: [] }),
    });

    const install = async (
      behavior: NonNullable<Parameters<typeof defineServicePlugin>[1]>,
    ): Promise<void> => {
      const definition = defineServicePlugin(
        { id: "reading-operator", config: z.object({}) },
        behavior,
      );
      const [plugin] = instantiatePluginPackageDefinition(
        definition,
        {},
        { name: "@fixture/reading-operator", version: "0.1.0" },
      );
      if (!plugin) throw new Error("Service plugin was not created");
      const harness = createPluginHarness();
      await harness.installPlugin(plugin);
      await harness.finalizeRegistration();
    };

    let loads = 0;
    expect(
      install({
        dashboardWidgets: (context) => [
          widget.bind(context, ({ settings }) => {
            expectTypeOf(settings).toEqualTypeOf<null>();
            loads += 1;
            return { count: 0 };
          }),
        ],
      }),
    ).resolves.toBeUndefined();
    expect(loads).toBe(0);

    let studioFactories = 0;
    expect(
      install({
        studioWorkspaces: () => {
          studioFactories += 1;
          return [];
        },
      }),
    ).resolves.toBeUndefined();
    expect(studioFactories).toBe(0);
  });
});

describe("a tool and who called it", () => {
  it("hands execute the caller, so a grant can be attributed", async () => {
    let seen: unknown;
    const definition = defineServicePlugin(
      {
        id: "trust-desk",
        config: z.object({}),
        setup: () => ({}),
      },
      {
        tools: () => [
          defineTool({
            name: "record",
            description: "Record who asked.",
            input: z.object({}),
            output: z.object({ actor: z.string() }),
            execute: ({ caller }) => {
              seen = caller;
              return { actor: caller?.actor.kind ?? "anonymous" };
            },
          }),
        ],
      },
    );

    const [plugin] = instantiatePluginPackageDefinition(
      definition,
      {},
      { name: "@fixture/trust-desk", version: "0.1.0" },
    );
    if (!plugin) throw new Error("Service plugin was not created");

    const harness = createPluginHarness();
    const capabilities = await harness.installPlugin(plugin);
    const tool = capabilities.tools[0];
    if (!tool) throw new Error("Tool was not registered");

    const result = await tool.handler(
      {},
      {
        interfaceType: "cli",
        actor: { kind: "user", userId: "u-42" },
        userPermissionLevel: "admin",
      },
    );

    expect(result).toMatchObject({ success: true, data: { actor: "user" } });
    expect(seen).toMatchObject({
      actor: { kind: "user", userId: "u-42" },
      userPermissionLevel: "admin",
    });
  });
});

describe("a tool the agent must not wield", () => {
  it("carries agentTool through, so a human-only tool stays out of the agent's set", async () => {
    const definition = defineServicePlugin(
      {
        id: "metrics-desk",
        config: z.object({}),
        setup: () => ({}),
      },
      {
        tools: () => [
          defineTool({
            name: "readout",
            description: "Read metrics.",
            input: z.object({}),
            output: z.object({ ok: z.boolean() }),
            agentTool: false,
            execute: () => ({ ok: true }),
          }),
          defineTool({
            name: "everyday",
            description: "An ordinary tool.",
            input: z.object({}),
            output: z.object({ ok: z.boolean() }),
            execute: () => ({ ok: true }),
          }),
        ],
      },
    );

    const [plugin] = instantiatePluginPackageDefinition(
      definition,
      {},
      { name: "@fixture/metrics-desk", version: "0.1.0" },
    );
    if (!plugin) throw new Error("Service plugin was not created");

    const harness = createPluginHarness();
    const capabilities = await harness.installPlugin(plugin);
    const readout = capabilities.tools.find((tool) =>
      tool.name.endsWith("_readout"),
    );
    const everyday = capabilities.tools.find((tool) =>
      tool.name.endsWith("_everyday"),
    );
    expect(readout?.agentTool).toBe(false);
    if (!everyday) throw new Error("The everyday tool was not registered");
    expect(everyday.agentTool).toBeUndefined();
  });
});

describe("what a confirmation says", () => {
  it("can name the subject, so a person sees what they are agreeing to", async () => {
    const definition = defineServicePlugin(
      {
        id: "trust-gate",
        config: z.object({}),
        setup: () => ({}),
      },
      {
        tools: () => [
          defineTool({
            name: "grant",
            description: "Grant access.",
            input: z.object({ agent: z.string(), level: z.string() }),
            output: z.object({ granted: z.string() }),
            confirmation: ({ agent, level }) =>
              `Grant ${level} access to ${agent}?`,
            execute: ({ input }) => ({ granted: input.agent }),
          }),
        ],
      },
    );

    const [plugin] = instantiatePluginPackageDefinition(
      definition,
      {},
      { name: "@fixture/trust-gate", version: "0.1.0" },
    );
    if (!plugin) throw new Error("Service plugin was not created");

    const harness = createPluginHarness();
    const capabilities = await harness.installPlugin(plugin);
    const tool = capabilities.tools[0];
    if (!tool) throw new Error("Tool was not registered");

    const confirmation = await tool.handler(
      { agent: "vale.example", level: "trusted" },
      {
        interfaceType: "cli",
        actor: { kind: "user", userId: "u-1" },
        userPermissionLevel: "admin",
      },
    );

    expect(confirmation).toMatchObject({
      needsConfirmation: true,
      summary: "Grant trusted access to vale.example?",
    });
  });
});
