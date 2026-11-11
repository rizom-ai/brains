import { describe, expect, it } from "bun:test";
import { noteCaptureContract } from "@brains/contracts";
import { createPluginHarness } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import { notePlugin } from "./note-plugin";

/**
 * What the notes register, pinned as the note plugin class registered it:
 * other packages and queued jobs name these by string.
 */
async function installed(): Promise<{
  harness: ReturnType<typeof createPluginHarness>;
  evals: string[];
  capabilities: Awaited<
    ReturnType<ReturnType<typeof createPluginHarness>["installPlugin"]>
  >;
}> {
  const harness = createPluginHarness({
    logger: createSilentLogger("note-registration"),
  });
  const evals: string[] = [];
  harness.getMockShell().registerEvalHandler = (pluginId, id): void => {
    evals.push(`${pluginId}:${id}`);
  };
  const capabilities = await harness.installPlugin(notePlugin());
  return { harness, evals, capabilities };
}

describe("the notes' registered surface", () => {
  it("registers the note type under the note plugin", async () => {
    const { harness, capabilities } = await installed();
    const plugin = harness.getPlugin();
    expect(plugin.id).toBe("note");
    expect(plugin.type).toBe("entity");
    expect(plugin.packageName).toBe("@brains/note");
    expect(capabilities.tools).toEqual([]);
    expect(capabilities.resources).toEqual([]);
    expect(capabilities.instructions).toBe(
      "Note entities are editable markdown notes. Use them for durable text captures, summaries, and imported markdown; raw files remain document or image entities instead of notes.",
    );
    expect(capabilities.projectionRules).toBeUndefined();
    const registry = harness.getEntityRegistry();
    expect(registry.getEntityTypeConfig("note")).toMatchObject({
      projectionSourceRole: "primary",
      markdownImport: true,
    });
    const adapter = registry.getAdapter("note");
    expect(adapter.purpose).toBe(
      "A short, free-form captured thought, reference, or snippet the user wants to keep.",
    );
    expect(adapter.buildStub).toBeDefined();
  });

  it("registers its template, job types and eval", async () => {
    const { harness, evals } = await installed();
    expect(
      [...harness.getTemplates()]
        .filter(([name]) => name.startsWith("note:"))
        .map(([name, template]) => [name, template.dataSourceId ?? null]),
    ).toEqual([["note:generation", "shell:ai-content"]]);
    expect(
      [...harness.getDataSources().keys()].filter((id) =>
        id.startsWith("note:"),
      ),
    ).toEqual([]);
    expect(
      harness.getMockShell().getJobQueueService().getRegisteredTypes().sort(),
    ).toEqual(["note:generation", "note:upload-import"]);
    expect(evals).toEqual(["note:generateNote"]);
  });

  it("answers note capture and projects AT Protocol notes", async () => {
    const { harness } = await installed();
    const shell = harness.getMockShell();
    const captured = await shell.getMessageBus().send({
      type: noteCaptureContract.name,
      payload: { id: "pinned-capture", title: "Pinned", body: "Kept." },
      sender: "web-chat",
    });
    expect(captured).toMatchObject({
      success: true,
      data: { noteId: "pinned-capture", created: true },
    });
    expect(shell.getAtprotoProjectionRegistry().get("note")).toMatchObject({
      collection: "ai.rizom.brain.note",
      validate: false,
    });
  });
});
