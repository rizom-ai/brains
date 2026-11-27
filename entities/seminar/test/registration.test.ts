import { describe, expect, it } from "bun:test";
import type { Plugin, PluginCapabilities, ToolContext } from "@brains/plugins";
import {
  createMockShell,
  type MockShell,
  registerAll,
} from "@brains/plugins/test";
import { createSeminarPlugins } from "./seminar-plugins";

interface Installed {
  shell: MockShell;
  plugins: Plugin[];
  capabilities: PluginCapabilities[];
}

async function installed(): Promise<Installed> {
  const shell = createMockShell();
  const plugins = createSeminarPlugins();
  const capabilities = await registerAll(shell, plugins);
  return { shell, plugins, capabilities };
}

const owner: ToolContext = {
  interfaceType: "studio",
  actor: { kind: "user", userId: "owner" },
};

/**
 * What the seminar package registers: the seminar type, which nobody
 * creates or edits by hand, and the owner's tool that queues one.
 */
describe("the seminar package's registered surface", () => {
  it("is the seminar service beside its type", async () => {
    const { plugins } = await installed();
    expect(
      plugins.map(({ id, type, packageName }) => [id, type, packageName]),
    ).toEqual([
      ["seminar-entity", "entity", "@brains/seminar"],
      ["seminar", "service", "@brains/seminar"],
    ]);
  });

  it("registers seminars as content written only by their job and published by the owner", async () => {
    const { shell } = await installed();
    const registry = shell.getEntityRegistry();
    expect(registry.getAllEntityTypes()).toEqual(["seminar"]);
    expect(registry.getEntityTypeConfig("seminar")).toMatchObject({
      classification: "content",
      includeInBroadSearch: true,
      actionPolicy: { create: "never", update: "never", publish: "admin" },
      publish: { publishStatuses: ["published"] },
    });
  });

  it("registers the pages a site reads seminars on, and what they read", async () => {
    const { shell } = await installed();
    expect([...shell.getTemplates().keys()].sort()).toEqual([
      "seminar:seminar-detail",
      "seminar:seminar-list",
    ]);
    expect(
      shell
        .getDataSourceRegistry()
        .list()
        .map(({ id }) => id),
    ).toEqual(["seminar:entities"]);
  });

  it("offers the owner alone one tool, which holds a seminar", async () => {
    const { capabilities } = await installed();
    expect(
      capabilities
        .flatMap(({ tools }) => tools)
        .map((tool) => ({
          name: tool.name,
          visibility: tool.visibility,
          sideEffects: tool.sideEffects,
          input: Object.keys(tool.inputSchema).sort(),
        })),
    ).toEqual([
      {
        name: "seminar_hold",
        visibility: "admin",
        sideEffects: "external",
        input: ["from", "language", "question", "seminar"],
      },
    ]);
  });

  it("queues the seminar as the package, in English unless told otherwise", async () => {
    const { shell, capabilities } = await installed();
    const [tool] = capabilities.flatMap(({ tools }) => tools);
    if (!tool) throw new Error("no tool");

    const result = await tool.handler(
      { question: "  What is religion?  " },
      owner,
    );

    expect(result).toEqual({
      success: true,
      data: { jobId: "job-1", status: "holding" },
    });
    const job = await shell.getJobQueueService().getStatus("job-1");
    expect({
      type: job?.type,
      source: job?.source,
      data: JSON.parse(job?.data ?? "null"),
      // A second attempt would put the question to every peer again.
      maxRetries: job?.maxRetries,
    }).toEqual({
      type: "seminar:hold",
      source: "seminar",
      data: { question: "What is religion?", language: "English" },
      maxRetries: 0,
    });
    expect(shell.getJobQueueService().getHandler("seminar:hold")).toBeDefined();
  });

  it("queues a redo of a draft from the step named, once", async () => {
    const { shell, capabilities } = await installed();
    const [tool] = capabilities.flatMap(({ tools }) => tools);
    if (!tool) throw new Error("no tool");

    const result = await tool.handler(
      { seminar: "what-is-religion", from: "closing" },
      owner,
    );

    expect(result).toEqual({
      success: true,
      data: { jobId: "job-1", status: "redoing" },
    });
    const job = await shell.getJobQueueService().getStatus("job-1");
    expect({
      type: job?.type,
      data: JSON.parse(job?.data ?? "null"),
      maxRetries: job?.maxRetries,
    }).toEqual({
      type: "seminar:redo",
      data: { seminar: "what-is-religion", from: "closing" },
      maxRetries: 0,
    });
    expect(shell.getJobQueueService().getHandler("seminar:redo")).toBeDefined();
  });

  it("refuses a call that names neither a question nor a seminar to redo, or both", async () => {
    const { shell, capabilities } = await installed();
    const [tool] = capabilities.flatMap(({ tools }) => tools);
    if (!tool) throw new Error("no tool");

    for (const input of [
      {},
      {
        question: "What is religion?",
        seminar: "what-is-religion",
        from: "closing",
      },
      { seminar: "what-is-religion" },
      { question: "What is religion?", from: "closing" },
    ]) {
      expect(await tool.handler(input, owner)).toMatchObject({
        success: false,
      });
    }
    expect(await shell.getJobQueueService().getStatus("job-1")).toBeNull();
  });
});
