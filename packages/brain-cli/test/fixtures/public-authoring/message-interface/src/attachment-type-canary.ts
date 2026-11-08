import { defineMessageInterface, z } from "@rizom/brain/interfaces";

const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);

// Included by the standalone/packed consumer typecheck, not loaded by the brain.
export const attachmentTypeCanary = defineMessageInterface(
  {
    id: "attachment-canary",
    config: z.object({}),
    channel: {
      type: "attachment-canary",
      displayName: "Canary",
      subjectLabel: "Room",
      recipient: z.string(),
    },
  },
  {
    async listen({ messages, health }) {
      health.ready();
      const sender = { id: "reader" };
      const channel = { id: "room" };
      // An attachment is a link the brain fetches or bytes the interface reads.
      await messages.receiveAuthenticated({
        sender,
        channel,
        text: "Both forms",
        attachments: async () => [
          {
            name: "notes.txt",
            mediaType: "text/plain",
            url: "https://example.com/notes.txt",
          },
          {
            name: "report.pdf",
            mediaType: "application/pdf",
            read: async (): Promise<Uint8Array> => bytes,
          },
        ],
      });
      await messages.receiveAuthenticated({
        sender,
        channel,
        text: "Neither form",
        // @ts-expect-error An attachment needs a link or bytes to read.
        attachments: async () => [
          { name: "lost.pdf", mediaType: "application/pdf" },
        ],
      });
      await messages.receiveAuthenticated({
        sender,
        channel,
        text: "Both at once",
        // @ts-expect-error A link and bytes to read are two forms, never one.
        attachments: async () => [
          {
            name: "both.pdf",
            mediaType: "application/pdf",
            url: "https://example.com/both.pdf",
            read: async (): Promise<Uint8Array> => bytes,
          },
        ],
      });
      await messages.receiveAuthenticated({
        sender,
        channel,
        text: "Text for bytes",
        // @ts-expect-error A read answers with bytes, not text.
        attachments: async () => [
          {
            name: "note.txt",
            mediaType: "text/plain",
            read: async (): Promise<string> => "text",
          },
        ],
      });
      await messages.receiveAuthenticated({
        sender,
        channel,
        text: "Unnamed",
        // @ts-expect-error Every attachment is named.
        attachments: async () => [
          {
            mediaType: "text/plain",
            read: async (): Promise<Uint8Array> => bytes,
          },
        ],
      });
    },
    send: () => undefined,
  },
);
