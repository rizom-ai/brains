import { describe, expect, it, mock } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { PermissionService } from "@brains/templates";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import { createTempDataDir } from "../src/test/temp-dir";
import {
  defineMessageInterface,
  instantiatePluginPackageDefinition,
  sharedUploadScope,
  type ScopedRuntimeUploadStore,
} from "../src";
import type { MessageReceiver } from "../src/public/interface-definition";

/** A PNG's signature, which is what the upload policy checks of one. */
const pngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
]);

interface Room {
  readonly receiver: MessageReceiver;
  readonly sent: string[];
  readonly chat: ReturnType<typeof mock>;
  readonly harness: ReturnType<typeof createPluginHarness>;
}

/**
 * A message interface over one room, its listener running, with an admin
 * (`reader-1`) and anyone else at public.
 */
async function openRoom(): Promise<Room> {
  let receiver: MessageReceiver | undefined;
  const sent: string[] = [];
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
    },
  );
  const harness = createPluginHarness({
    logger: createSilentLogger(),
    dataDir: await createTempDataDir("message-attachments-"),
  });
  harness.setPermissionService(
    new PermissionService({ admins: ["campfire:reader-1"] }),
  );
  const chat = mock(async () => ({
    text: "Read it",
    usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
  }));
  harness.setAgentService({
    chat,
    confirmPendingAction: async () => ({
      text: "Confirmed",
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    }),
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
  return { receiver, sent, chat, harness };
}

/** What the agent was handed for the turn: its text and its attachments. */
function turnOf(room: Room): {
  readonly text: unknown;
  readonly attachments: readonly Record<string, unknown>[];
} {
  const call = room.chat.mock.calls.at(-1);
  if (!call) throw new Error("The agent was not asked");
  const options = z
    .object({
      attachments: z.array(z.record(z.string(), z.unknown())).optional(),
    })
    .parse(call[2]);
  return { text: call[0], attachments: options.attachments ?? [] };
}

function sharedStore(room: Room): ScopedRuntimeUploadStore {
  return room.harness
    .getMockShell()
    .getRuntimeUploadRegistry()
    .scoped(sharedUploadScope);
}

const sourceSchema = z.object({ kind: z.literal("upload"), id: z.string() });

const admin = { id: "reader-1", displayName: "Reader" };
const room = { id: "room-1", threadId: "thread-1" };

describe("a message interface's inbound attachments", () => {
  it("are kept in the shared upload store, attributed to the sender, for later turns to restore", async () => {
    const opened = await openRoom();
    await opened.receiver.receiveAuthenticated({
      sender: admin,
      channel: room,
      text: "Summarize this",
      attachments: async () => [
        {
          name: "notes.txt",
          mediaType: "text/plain",
          url: "data:text/plain,saved%20attachment",
        },
      ],
    });

    const [attachment] = turnOf(opened).attachments;
    expect(attachment).toMatchObject({
      kind: "text",
      filename: "notes.txt",
      content: "saved attachment",
    });
    // The turn's reference points into the shared store, the one the agent
    // restores a conversation's prior uploads from on a later turn.
    const source = sourceSchema.parse(attachment?.["source"]);
    const stored = await sharedStore(opened).read(source.id);
    expect(new TextDecoder().decode(stored.content)).toBe("saved attachment");
    expect(stored.record).toMatchObject({
      filename: "notes.txt",
      mediaType: "text/plain",
      ref: { kind: "upload", id: source.id },
      metadata: {
        interfaceType: "campfire",
        channelId: "room-1",
        threadId: "thread-1",
        uploaderId: "reader-1",
        uploaderUsername: "Reader",
      },
    });
    expect(opened.sent).toEqual(["Read it"]);
  });

  it("read the bytes the interface supplies, with no url", async () => {
    const opened = await openRoom();
    const read = mock(async () => pngBytes);
    await opened.receiver.receiveAuthenticated({
      sender: admin,
      channel: room,
      text: "What is this?",
      attachments: async () => [
        { name: "photo.png", mediaType: "image/png", read },
      ],
    });

    expect(read).toHaveBeenCalledTimes(1);
    const [attachment] = turnOf(opened).attachments;
    expect(attachment).toMatchObject({
      kind: "file",
      filename: "photo.png",
      mediaType: "image/png",
      sizeBytes: pngBytes.byteLength,
    });
    const source = sourceSchema.parse(attachment?.["source"]);
    expect([...(await sharedStore(opened).read(source.id)).content]).toEqual([
      ...pngBytes,
    ]);
  });

  it("refuse what chat refuses, and say so in the room", async () => {
    const opened = await openRoom();
    await opened.receiver.receiveAuthenticated({
      sender: admin,
      channel: room,
      text: "Look at these",
      attachments: async () => [
        {
          name: "big.txt",
          mediaType: "text/plain",
          read: async (): Promise<Uint8Array> =>
            new Uint8Array(100_001).fill(0x61),
        },
        {
          name: "tool.exe",
          mediaType: "application/octet-stream",
          read: async (): Promise<Uint8Array> => new Uint8Array([0x4d, 0x5a]),
        },
        // Claims to be a PNG; its bytes say otherwise.
        {
          name: "fake.png",
          mediaType: "image/png",
          read: async (): Promise<Uint8Array> =>
            new TextEncoder().encode("not an image"),
        },
        {
          name: "gone.pdf",
          mediaType: "application/pdf",
          read: async (): Promise<Uint8Array> => {
            throw new Error("The link expired");
          },
        },
      ],
    });

    expect(turnOf(opened)).toEqual({ text: "Look at these", attachments: [] });
    expect(opened.sent).toEqual([
      [
        "Some uploads were skipped:",
        "- File upload too large: big.txt",
        "- Unsupported file upload type: tool.exe",
        "- Unsupported file upload type: fake.png",
        "- Could not read file upload: gone.pdf",
      ].join("\n"),
      "Read it",
    ]);
  });

  it("are refused whole when they are neither a link nor readable bytes", async () => {
    const opened = await openRoom();
    await opened.receiver.receiveAuthenticated({
      sender: admin,
      channel: room,
      text: "And this",
      // @ts-expect-error An attachment is a link or bytes to read, not both.
      attachments: async () => [
        {
          name: "both.txt",
          mediaType: "text/plain",
          url: "data:text/plain,a",
          read: async (): Promise<Uint8Array> => new TextEncoder().encode("a"),
        },
      ],
    });

    expect(turnOf(opened).attachments).toEqual([]);
    expect(opened.sent[0]).toBe(
      "Some uploads were skipped:\n- Could not read file upload: both.txt",
    );
  });

  it("are not taken from a sender who may not upload", async () => {
    const opened = await openRoom();
    const read = mock(async () => pngBytes);
    await opened.receiver.receiveAuthenticated({
      sender: { id: "stranger" },
      channel: room,
      text: "Here you go",
      attachments: async () => [
        { name: "photo.png", mediaType: "image/png", read },
      ],
    });

    expect(read).not.toHaveBeenCalled();
    expect(turnOf(opened).attachments).toEqual([]);
    expect(opened.sent).toEqual(["Read it"]);
  });

  it("start no turn when nothing but refused uploads arrived", async () => {
    const opened = await openRoom();
    await opened.receiver.receiveAuthenticated({
      sender: admin,
      channel: room,
      text: "  ",
      attachments: async () => [
        {
          name: "tool.exe",
          mediaType: "application/octet-stream",
          read: async (): Promise<Uint8Array> => new Uint8Array([0x4d, 0x5a]),
        },
      ],
    });

    expect(opened.chat).not.toHaveBeenCalled();
    expect(opened.sent).toEqual([
      "Some uploads were skipped:\n- Unsupported file upload type: tool.exe",
    ]);
  });
});
