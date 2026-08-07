import { defineMessageInterface, z } from "@rizom/brain/interfaces";
import { CampfireClient } from "./campfire-client.js";

export default defineMessageInterface({
  id: "campfire",
  config: z.object({
    baseUrl: z.url().default("http://127.0.0.1:4020"),
    workspace: z.string().default("reading-club"),
    token: z.string().min(1),
  }),

  channel: {
    type: "campfire",
    displayName: "Campfire",
    subjectLabel: "Room",
    recipient: z.object({ roomId: z.string() }),
  },

  setup({ config }) {
    return new CampfireClient(config.baseUrl, config.workspace, config.token);
  },

  async listen({ state: client, signal, health, messages }) {
    await client.listen({
      signal,
      onReady: () => health.ready(),
      onWarning: (message) => health.warning(message),
      async onMessage(incoming) {
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
          attachments: () => client.attachments(incoming.id),
        });
      },
    });
  },

  async send({ state: client, channel, message }) {
    return client.send(channel.id, message.text);
  },

  async edit({ state: client, channel, messageId, message }) {
    await client.edit(channel.id, messageId, message.text);
  },

  async deliver({ state: client, recipient, message }) {
    return client.send(recipient.roomId, message.text);
  },
});
