import { defineMessageInterface, z } from "@rizom/brain/interfaces";
import { CampfireClient } from "./campfire-client.js";

export default defineMessageInterface(
  {
    id: "campfire",
    config: z.object({
      baseUrl: z.url().default("http://127.0.0.1:4020"),
      workspace: z.string().default("reading-club"),
      token: z.string().min(1),
    }),

    // The channel declaration owns display metadata and recipient validation.
    channel: {
      type: "campfire",
      displayName: "Campfire",
      subjectLabel: "Room",
      recipient: z.object({ roomId: z.string() }),
    },

    // Setup builds what every behavior slot reads, once, at registration.
    setup({ config, runtimeState }) {
      return {
        client: new CampfireClient(
          config.baseUrl,
          config.workspace,
          config.token,
        ),
        // The last message handed to the brain, kept under this package, so
        // a restart resumes after it instead of replaying the room.
        cursor: runtimeState({
          namespace: "cursor",
          schema: z.object({ messageId: z.string() }),
        }),
      };
    },
  },
  {
    async listen({ config, state, signal, health, messages }) {
      const resumed = await state.cursor.get(config.workspace);
      await state.client.listen({
        signal,
        after: resumed?.messageId,
        onReady: () => health.ready(),
        onWarning: (message) => health.warning(message),
        async onMessage(incoming) {
          // Brain owns caller access, conversation continuity, and attachment policy.
          await messages.receiveAuthenticated({
            sender: {
              id: incoming.userId,
              displayName: incoming.userName,
            },
            channel: {
              id: incoming.roomId,
              threadId: incoming.threadId,
            },
            text: incoming.text,
            // Campfire's media needs the token, so the interface reads the
            // bytes itself; the brain checks and keeps them.
            attachments: async () =>
              (await state.client.attachments(incoming.id)).map((file) => ({
                name: file.name,
                mediaType: file.mediaType,
                read: (): Promise<Uint8Array> =>
                  state.client.download(file.url),
              })),
          });
          // Only once the brain has it, so a message lost in a crash is read again.
          await state.cursor.set(config.workspace, { messageId: incoming.id });
        },
      });
    },

    // Returning a provider ID enables later progress edits when edit() exists.
    async send({ state, channel, message }) {
      return state.client.send(channel.id, message.text);
    },

    async edit({ state, channel, messageId, message }) {
      await state.client.edit(channel.id, messageId, message.text);
    },

    async deliver({ state, recipient, message }) {
      return state.client.send(recipient.roomId, message.text);
    },
  },
);
