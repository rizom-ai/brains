import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import {
  defineMessageInterface,
  instantiatePluginPackageDefinition,
  type ToolStatusUpdate,
} from "../src";

/**
 * A client that draws tool activity has to be given the activity.
 *
 * Job progress reaches a declared interface either as a rendered sentence or,
 * with the `progress` slot, as the event. Tool activity had neither: the base
 * default is silence, so a declared interface could not show that a tool was
 * running at all. web-chat draws a row per tool and replaces it when the tool
 * finishes, which is the whole of why this slot exists.
 */

function statusReader(
  seen: ToolStatusUpdate[],
  sent: string[],
): ReturnType<typeof defineMessageInterface> {
  return defineMessageInterface({
    id: "status-reader",
    config: z.object({}),
    channel: {
      type: "status-reader",
      displayName: "Status Reader",
      subjectLabel: "Room",
      recipient: z.string(),
    },
    send: async ({ message }) => {
      sent.push(message.text);
      return "message-1";
    },
    toolStatus: ({ update }) => {
      seen.push(update);
    },
  });
}

/** The same interface without the slot, which should see nothing. */
function silentReader(
  sent: string[],
): ReturnType<typeof defineMessageInterface> {
  return defineMessageInterface({
    id: "status-reader",
    config: z.object({}),
    channel: {
      type: "status-reader",
      displayName: "Status Reader",
      subjectLabel: "Room",
      recipient: z.string(),
    },
    send: async ({ message }) => {
      sent.push(message.text);
      return "message-1";
    },
  });
}

async function invokeTool(
  definition: Parameters<typeof instantiatePluginPackageDefinition>[0],
): Promise<void> {
  const [plugin] = instantiatePluginPackageDefinition(
    definition,
    {},
    { name: "@fixture/status-reader", version: "0.1.0" },
  );
  if (!plugin) throw new Error("Message interface plugin was not created");

  const harness = createPluginHarness();
  await harness.installPlugin(plugin);
  await harness.finalizeRegistration();
  await harness.sendMessage("tool:invoking", {
    toolName: "system_publish",
    interfaceType: plugin.id,
    conversationId: "room-1",
    channelId: "room-1",
  });
}

describe("a declared interface that draws tool activity", () => {
  it("is handed the update rather than a sentence about it", async () => {
    const seen: ToolStatusUpdate[] = [];
    const sent: string[] = [];
    await invokeTool(statusReader(seen, sent));

    expect(seen).toMatchObject([
      {
        toolName: "system_publish",
        state: "running",
        conversationId: "room-1",
      },
    ]);
    // Not both: an interface drawing its own row must not also print the line.
    expect(sent).toEqual([]);
  });

  it("shows nothing when it declares no slot, as before", async () => {
    const sent: string[] = [];
    await invokeTool(silentReader(sent));

    // There is no rendered-sentence fallback for tool activity the way there
    // is for job progress: an interface that wants to show it says so.
    expect(sent).toEqual([]);
  });
});
