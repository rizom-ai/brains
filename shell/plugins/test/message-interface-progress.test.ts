import { describe, expect, it, mock } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { PermissionService } from "@brains/templates";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import { createTempDataDir } from "../src/test/temp-dir";
import {
  defineMessageInterface,
  instantiatePluginPackageDefinition,
} from "../src";
import type { MessageReceiver } from "../src/public/interface-definition";

interface Room {
  readonly receiver: MessageReceiver;
  readonly sent: string[];
  readonly edits: { messageId: string; text: string }[];
  readonly chat: ReturnType<typeof mock>;
  readonly harness: ReturnType<typeof createPluginHarness>;
  readonly pluginId: string;
}

const usage = { promptTokens: 1, completionTokens: 1, totalTokens: 2 };

/**
 * An author-defined message interface over one room, its listener running.
 * The agent answers every turn by starting one async job, `job-1`.
 */
async function openRoom(): Promise<Room> {
  let receiver: MessageReceiver | undefined;
  const sent: string[] = [];
  const edits: { messageId: string; text: string }[] = [];
  const definition = defineMessageInterface(
    {
      id: "campfire",
      config: z.object({}),
      channel: {
        type: "campfire",
        displayName: "Campfire",
        subjectLabel: "Room",
        recipient: z.string(),
      },
    },
    {
      async listen({ signal, health, messages }) {
        receiver = messages;
        health.ready();
        await new Promise<void>((resolve) =>
          signal.addEventListener("abort", () => resolve(), { once: true }),
        );
      },
      send({ message }) {
        sent.push(message.text);
        return `message-${sent.length}`;
      },
      edit({ messageId, message }) {
        edits.push({ messageId, text: message.text });
      },
    },
  );
  const harness = createPluginHarness({
    logger: createSilentLogger(),
    dataDir: await createTempDataDir("message-progress-"),
  });
  harness.setPermissionService(
    new PermissionService({ admins: ["campfire:reader-1"] }),
  );
  const chat = mock(async () => ({
    text: "Compiling the digest",
    usage,
    toolResults: [{ toolName: "compile-digest", jobId: "job-1" }],
  }));
  harness.setAgentService({
    chat,
    confirmPendingAction: async () => ({ text: "Confirmed", usage }),
    invalidateAgent: () => {},
  });
  const [plugin] = instantiatePluginPackageDefinition(
    definition,
    {},
    { name: "@fixture/campfire", version: "0.1.0" },
  );
  if (!plugin) throw new Error("The message interface was not created");
  await harness.installPlugin(plugin);
  await harness.finalizeRegistration();
  await harness
    .getMockShell()
    .getDaemonRegistry()
    .start(`${plugin.id}:listener`);
  if (!receiver) throw new Error("The listener did not start");
  return { receiver, sent, edits, chat, harness, pluginId: plugin.id };
}

const admin = { id: "reader-1", displayName: "Reader" };

/** The job's completion as the job queue publishes it. */
function completion(routing: Record<string, string>): Record<string, unknown> {
  return {
    id: "job-1",
    type: "job",
    status: "completed",
    message: "Digest ready",
    metadata: {
      operationType: "data_processing",
      rootJobId: "job-1",
      channelId: "room-1",
      conversationId: "campfire:room-1",
      ...routing,
    },
  };
}

describe("an author-defined message interface's job progress", () => {
  it("names the installed interface on the turn it starts", async () => {
    const room = await openRoom();
    await room.receiver.receiveAuthenticated({
      sender: admin,
      channel: { id: "room-1" },
      text: "Compile the digest",
    });

    const context = z
      .object({ interfaceType: z.string(), interfaceId: z.string() })
      .parse(room.chat.mock.calls.at(-1)?.[2]);
    expect(context).toEqual({
      interfaceType: "campfire",
      interfaceId: room.pluginId,
    });
  });

  it("edits the reply that started a job when the job completes", async () => {
    const room = await openRoom();
    await room.receiver.receiveAuthenticated({
      sender: admin,
      channel: { id: "room-1" },
      text: "Compile the digest",
    });
    expect(room.sent).toEqual(["Compiling the digest"]);

    await room.harness.sendMessage(
      "job-progress",
      completion({ interfaceType: "campfire", interfaceId: room.pluginId }),
    );

    expect(room.edits).toHaveLength(1);
    expect(room.edits[0]?.messageId).toBe("message-1");
    expect(room.edits[0]?.text).toContain("Digest ready");
  });

  it("leaves a job alone that another installed interface of the same channel type started", async () => {
    const room = await openRoom();
    await room.receiver.receiveAuthenticated({
      sender: admin,
      channel: { id: "room-1" },
      text: "Compile the digest",
    });

    await room.harness.sendMessage(
      "job-progress",
      completion({
        interfaceType: "campfire",
        interfaceId: "@other/campfire:campfire",
      }),
    );

    expect(room.edits).toEqual([]);
    expect(room.sent).toEqual(["Compiling the digest"]);
  });
});
