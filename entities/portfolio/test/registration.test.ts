import { describe, expect, it } from "bun:test";
import { publishRegisterContract } from "@brains/contracts";
import { SYSTEM_CHANNELS } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import { portfolioPlugin } from "./portfolio-plugin";

/**
 * What the portfolio registers, pinned as the portfolio plugin class
 * registered it: sites, queued jobs and the content pipeline name these by
 * string.
 */
async function installed(): Promise<{
  harness: ReturnType<typeof createPluginHarness>;
  evals: string[];
  capabilities: Awaited<
    ReturnType<ReturnType<typeof createPluginHarness>["installPlugin"]>
  >;
}> {
  const harness = createPluginHarness({
    logger: createSilentLogger("portfolio-registration"),
  });
  const evals: string[] = [];
  harness.getMockShell().registerEvalHandler = (pluginId, id): void => {
    evals.push(`${pluginId}:${id}`);
  };
  const capabilities = await harness.installPlugin(portfolioPlugin());
  return { harness, evals, capabilities };
}

describe("the portfolio's registered surface", () => {
  it("registers the project type under the portfolio plugin", async () => {
    const { harness, capabilities } = await installed();
    const plugin = harness.getPlugin();
    expect(plugin.id).toBe("portfolio");
    expect(plugin.type).toBe("entity");
    expect(plugin.packageName).toBe("@brains/portfolio");
    expect(capabilities.tools).toEqual([]);
    expect(capabilities.resources).toEqual([]);
    expect(capabilities.instructions).toBeUndefined();
    expect(capabilities.projectionRules).toBeUndefined();
    const registry = harness.getEntityRegistry();
    expect(registry.getEntityTypeConfig("project")).toMatchObject({
      projectionSourceRole: "secondary",
    });
    const adapter = registry.getAdapter("project");
    expect(adapter.purpose).toBe("A portfolio project or case study.");
    expect(adapter.supportsCoverImage).toBe(true);
    expect(adapter.buildStub).toBeDefined();
    // The vault's scaffold for a new project: its four sections.
    expect(adapter.getBodyTemplate()).toBe(
      "## Context\n\n<!-- Write your context here -->\n\n## Problem\n\n<!-- Write your problem here -->\n\n## Solution\n\n<!-- Write your solution here -->\n\n## Outcome\n\n<!-- Write your outcome here -->\n",
    );
  });

  it("registers its templates under the names sites and jobs use", async () => {
    const { harness } = await installed();
    expect(
      [...harness.getTemplates()]
        .filter(([name]) => name.startsWith("portfolio:"))
        .map(([name, template]) => [name, template.dataSourceId ?? null])
        .sort(),
    ).toEqual([
      ["portfolio:from-text", "shell:ai-content"],
      ["portfolio:generation", "shell:ai-content"],
      ["portfolio:og-image", null],
      ["portfolio:project-detail", "portfolio:entities"],
      ["portfolio:project-list", "portfolio:entities"],
      ["portfolio:project-printable", null],
    ]);
  });

  it("registers its data source, job type and eval handler", async () => {
    const { harness, evals } = await installed();
    expect(
      [...harness.getDataSources().keys()].filter((id) =>
        id.startsWith("portfolio:"),
      ),
    ).toEqual(["portfolio:entities"]);
    expect(
      harness.getMockShell().getJobQueueService().getRegisteredTypes(),
    ).toEqual(["project:generation"]);
    expect(evals).toEqual(["portfolio:generateProject"]);
  });

  it("registers its attachments and its AT Protocol projection", async () => {
    const { harness } = await installed();
    const shell = harness.getMockShell();
    for (const attachmentType of ["printable", "og-image"]) {
      expect(
        shell.getAttachmentRegistry().hasProvider("project", attachmentType),
      ).toBe(true);
    }
    expect(shell.getAtprotoProjectionRegistry().get("project")).toMatchObject({
      collection: "ai.rizom.brain.project",
      validate: false,
    });
  });

  it("registers the project with the publish pipeline once plugins are in", async () => {
    const { harness } = await installed();
    const registered: unknown[] = [];
    harness.subscribe(publishRegisterContract.name, async (message) => {
      registered.push(message.payload);
      return { success: true };
    });
    await harness.sendMessage(
      SYSTEM_CHANNELS.pluginsRegistered,
      { timestamp: new Date().toISOString(), pluginCount: 1 },
      "shell",
      true,
    );
    expect(registered).toEqual([
      {
        entityType: "project",
        provider: expect.objectContaining({ name: "internal" }),
        config: { executionMode: "provider" },
      },
    ]);
  });
});
