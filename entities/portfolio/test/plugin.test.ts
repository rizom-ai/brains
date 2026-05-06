import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { PortfolioPlugin } from "../src/plugin";
import { createPluginHarness } from "@brains/plugins/test";
import type { PluginCapabilities } from "@brains/plugins/test";

describe("PortfolioPlugin", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  let plugin: PortfolioPlugin;
  let capabilities: PluginCapabilities;

  beforeEach(async () => {
    harness = createPluginHarness({ dataDir: "/tmp/test-datadir" });

    plugin = new PortfolioPlugin({});
    capabilities = await harness.installPlugin(plugin);
  });

  afterEach(() => {
    harness.reset();
  });

  describe("Plugin Registration", () => {
    it("should register plugin with correct metadata", () => {
      expect(plugin.id).toBe("portfolio");
      expect(plugin.type).toBe("entity");
      expect(plugin.version).toBeDefined();
    });

    it("should not provide tools (entity creation via system_create)", () => {
      expect(capabilities.tools).toHaveLength(0);
    });

    it("should not provide any resources", () => {
      expect(capabilities.resources).toEqual([]);
    });

    it("should enqueue generation with a year parsed from the prompt", async () => {
      const localHarness = createPluginHarness({
        dataDir: "/tmp/test-datadir-portfolio-enqueue",
        logContext: "portfolio-plugin-test",
      });
      try {
        const mockShell = localHarness.getMockShell();
        const origJobQueue = mockShell.getJobQueueService();
        const enqueued: Array<{ type: string; data: unknown }> = [];
        mockShell.getJobQueueService = (): ReturnType<
          typeof mockShell.getJobQueueService
        > => ({
          ...origJobQueue,
          enqueue: async ({ type, data }): Promise<string> => {
            enqueued.push({ type, data });
            return "job-123";
          },
        });

        await localHarness.installPlugin(new PortfolioPlugin({}));

        const interceptor = localHarness
          .getEntityRegistry()
          .getCreateInterceptor("project");
        if (!interceptor)
          throw new Error("Expected project create interceptor");

        const result = await interceptor(
          {
            entityType: "project",
            prompt:
              "Create a portfolio case study for my API Gateway project from 2024",
            title: "API Gateway",
          },
          {
            interfaceType: "test",
            userId: "test-user",
          },
        );

        expect(result).toMatchObject({
          kind: "handled",
          result: {
            success: true,
            data: { status: "generating" },
          },
        });

        expect(enqueued).toEqual([
          {
            type: "project:generation",
            data: {
              prompt:
                "Create a portfolio case study for my API Gateway project from 2024",
              title: "API Gateway",
              year: 2024,
            },
          },
        ]);
      } finally {
        localHarness.reset();
      }
    });

    it("should continue when no year can be parsed", async () => {
      const interceptor = harness
        .getEntityRegistry()
        .getCreateInterceptor("project");
      if (!interceptor) throw new Error("Expected project create interceptor");

      const input = {
        entityType: "project",
        prompt: "Create a portfolio case study for my API Gateway project",
      };
      const result = await interceptor(input, {
        interfaceType: "test",
        userId: "test-user",
      });

      expect(result).toEqual({ kind: "continue", input });
    });
  });
});
