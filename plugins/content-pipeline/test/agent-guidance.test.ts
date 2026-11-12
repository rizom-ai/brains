import { describe, expect, it } from "bun:test";
import {
  createMockShell,
  createServicePluginContext,
} from "@brains/plugins/test";
import { createContentPipelinePlugins } from "./content-pipeline-plugins";
import { ProviderRegistry } from "../src/provider-registry";
import { QueueManager } from "../src/queue-manager";
import { createPublishingManageTool } from "../src/tools";

// Publishing guidance travels with publishing_manage: its description reaches
// the model only when the caller may publish, and once per step.
describe("content-pipeline agent guidance", () => {
  it("adds no prompt section beside the publishing_manage description", async () => {
    const shell = createMockShell();
    const instructions = [];
    for (const plugin of createContentPipelinePlugins()) {
      instructions.push((await plugin.register(shell)).instructions);
    }
    expect(instructions).toEqual([undefined]);
  });

  it("describes publishing on publishing_manage", () => {
    const { description } = createPublishingManageTool(
      createServicePluginContext(createMockShell(), "content-pipeline"),
      {
        queueManager: QueueManager.createFresh(),
        providerRegistry: ProviderRegistry.createFresh(),
      },
    );

    expect(description).toContain("(e.g. LinkedIn, Buttondown)");
    expect(description).toContain(
      "Follow-ups like 'publish it now' target the entity just read, generated, or updated in the conversation, including a post just changed to draft.",
    );
    expect(description).toContain(
      "Missing publish assets such as generated OG images are reconciled during publishing",
    );
  });
});
