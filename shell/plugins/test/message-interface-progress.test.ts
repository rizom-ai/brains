import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import {
  defineMessageInterface,
  instantiatePluginPackageDefinition,
} from "../src";
import { JOB_CHANNELS } from "@brains/contracts";

/**
 * A channel that streams renders progress itself.
 *
 * The pipeline turns a progress event into text and hands it to `send`, which
 * is right for a terminal — a status line is a line. It is wrong for a client
 * on the other end of an event stream: `@brains/web-chat` writes a structured
 * `data-progress` frame carrying the job's id, status and percentage, and its
 * page renders a bar from that. Given only prose it would have to parse the
 * sentence back apart.
 *
 * So an interface may declare `progress`, and then it is handed the event.
 * Omitting it keeps the rendered text going through `send`, which is what
 * every declared interface did before.
 */

function instantiate(
  definition: Parameters<typeof instantiatePluginPackageDefinition>[0],
  config: unknown,
): NonNullable<ReturnType<typeof instantiatePluginPackageDefinition>[number]> {
  const [plugin] = instantiatePluginPackageDefinition(definition, config, {
    name: "@fixture/streaming-channel",
    version: "0.1.0",
  });
  if (!plugin) throw new Error("Message interface plugin was not created");
  return plugin;
}

describe("a channel that streams", () => {
  it("is handed the progress event, not a sentence about it", async () => {
    const frames: Array<{ id: string; status: string; percent?: number }> = [];
    const sent: string[] = [];

    const definition = defineMessageInterface({
      id: "streaming-channel",
      config: z.object({}),
      channel: {
        type: "streaming-channel",
        displayName: "Stream",
        subjectLabel: "Session",
        recipient: z.string().min(1),
      },
      send: ({ message }) => {
        sent.push(message.text);
      },
      progress: ({ event }) => {
        frames.push({
          id: event.id,
          status: event.status,
          ...(event.progress !== undefined
            ? { percent: event.progress.percentage }
            : {}),
        });
      },
    });

    const harness = createPluginHarness();
    await harness.installPlugin(instantiate(definition, {}));

    await harness.sendMessage(JOB_CHANNELS.progress, {
      id: "job-1",
      type: "job",
      status: "processing",
      message: "Building the site",
      progress: { current: 2, total: 4, percentage: 50 },
      metadata: {
        operationType: "content_operations",
        rootJobId: "job-1",
        interfaceType: "streaming-channel",
        channelId: "session-1",
        conversationId: "session-1",
      },
    });

    expect(frames).toEqual([
      { id: "job-1", status: "processing", percent: 50 },
    ]);
    // The rendered sentence is not also sent: an interface that renders
    // progress itself would otherwise show it twice.
    expect(sent).toEqual([]);
  });
});
