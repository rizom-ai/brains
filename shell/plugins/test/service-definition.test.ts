import { describe, expect, expectTypeOf, it, mock } from "bun:test";
import { createMockShell, createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { PluginManager } from "../src/manager/pluginManager";
import { PluginStatus } from "../src/manager/types";
import { createPluginHarness } from "../src/test/harness";
import {
  defineAccountSettings,
  defineDashboardWidget,
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
  it("infers config, state, jobs, templates, and plain tool output", async () => {
    let cleaned = false;
    const definition = defineServicePlugin({
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
    });

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
    const definition = defineServicePlugin({
      id: "failing-service",
      config: z.object({}),
      setup: () => ({}),
      jobs: () => [binding, binding],
    });
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
    const definition = defineServicePlugin({
      id: "replay-service",
      config: z.object({}),
      setup: () => ({}),
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
    });
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

  it("keeps dashboard declarations inert without a host and still refuses CMS declarations", async () => {
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
      extra: Partial<Parameters<typeof defineServicePlugin>[0]>,
    ): Promise<void> => {
      const definition = defineServicePlugin({
        id: "reading-operator",
        config: z.object({}),
        ...extra,
      });
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

    expect(install({ cmsWorkspaces: () => [] })).rejects.toThrow(
      "CMS workspaces require the operator runtime",
    );
  });
});
