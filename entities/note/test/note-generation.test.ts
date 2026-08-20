import { describe, it, expect } from "bun:test";
import type { JobHandler } from "@brains/plugins";
import type { Plugin } from "@brains/plugins";
import { instantiatePluginPackageDefinition } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import {
  createMockProgressReporter,
  createSilentLogger,
  createTestEntity,
  stubMethod,
} from "@brains/test-utils";
import notes from "../src";
import type { Note } from "../src/schemas/note";

/**
 * Install the package and hand back its generation job, the way the queue
 * reaches it.
 */
async function installGeneration(): Promise<{
  harness: ReturnType<typeof createPluginHarness>;
  handler: JobHandler;
}> {
  const harness = createPluginHarness({
    logger: createSilentLogger("note-generation"),
  });
  const handlers = new Map<string, JobHandler>();
  const queue = harness.getMockShell().getJobQueueService();
  stubMethod(queue, "registerHandler", (name, handler) => {
    handlers.set(name, handler);
  });
  harness.getMockShell().getJobQueueService = (): typeof queue => queue;

  const plugins = instantiatePluginPackageDefinition(
    notes,
    {},
    { name: "@brains/note", version: "0.1.0" },
  );
  for (const plugin of plugins as Plugin[]) await harness.installPlugin(plugin);

  const entry = [...handlers.entries()].find(([name]) =>
    name.endsWith(":generation"),
  );
  if (!entry) throw new Error("Note generation handler was not registered");
  return { harness, handler: entry[1] };
}

async function run(handler: JobHandler, data: unknown): Promise<unknown> {
  return handler.process(
    data,
    "job-123",
    createMockProgressReporter(),
    new AbortController().signal,
  );
}

describe("note generation", () => {
  it("rejects job data that does not match its declared input", async () => {
    const { harness, handler } = await installGeneration();

    expect(handler.validateAndParse({ prompt: "Write a note" })).not.toBeNull();
    expect(
      handler.validateAndParse({ prompt: "Write a note", title: "My Note" }),
    ).not.toBeNull();
    expect(handler.validateAndParse({})).toBeNull();

    harness.reset();
  });

  it("generates in the brain's own voice, not a represented identity", async () => {
    const { harness, handler } = await installGeneration();
    const shell = harness.getMockShell();
    const calls: unknown[] = [];
    stubMethod(shell, "generateContent", async (config) => {
      calls.push(config);
      return { title: "Neutral Note", body: "Body text" } as never;
    });

    await run(handler, { prompt: "Write a note" });

    expect(calls[0]).toMatchObject({
      prompt: "Write a note",
      templateName: "@brains/note:note:generation",
      representedIdentity: "none",
    });

    harness.reset();
  });

  it("derives the id from the title, so two notes never become one", async () => {
    const { harness, handler } = await installGeneration();
    const shell = harness.getMockShell();
    stubMethod(shell, "generateContent", async () => {
      return { title: "My Fancy Note!", body: "Body text" } as never;
    });

    await run(handler, { prompt: "Write a note" });

    expect(
      await harness
        .getEntityService()
        .getEntity({ entityType: "note", id: "my-fancy-note" }),
    ).toMatchObject({ metadata: { title: "My Fancy Note!" } });

    harness.reset();
  });

  it("asks for a different title when the derived id is already taken", async () => {
    const { harness, handler } = await installGeneration();
    const shell = harness.getMockShell();
    stubMethod(shell, "generateContent", async () => {
      return { title: "Taken Title", body: "Body text" } as never;
    });
    stubMethod(shell, "generateObject", async () => ({
      object: { title: "Fresh Title" } as never,
    }));

    // An existing note under the derived id is the collision.
    await harness.getEntityService().createEntity({
      entity: createTestEntity<Note>("note", {
        id: "taken-title",
        content: "Existing note",
        metadata: { title: "Taken Title" },
      }),
    });

    await run(handler, { prompt: "Write a note" });

    expect(
      await harness
        .getEntityService()
        .getEntity({ entityType: "note", id: "fresh-title" }),
    ).toMatchObject({ metadata: { title: "Fresh Title" } });

    harness.reset();
  });
});
