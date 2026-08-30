import {
  defineMessageInterface,
  defineSubscription,
  z,
} from "@rizom/brain/interfaces";
import { CampfireClient } from "./campfire-client.js";

export default defineMessageInterface({
  id: "campfire",
  config: z.object({
    baseUrl: z.url().default("http://127.0.0.1:4020"),
    workspace: z.string().default("reading-club"),
    token: z.string().optional(),
  }),

  // The channel declaration owns display metadata and recipient validation.
  channel: {
    type: "campfire",
    displayName: "Campfire",
    subjectLabel: "Room",
    // A room id is what a person types; the recipient below is the payload a
    // caller hands deliver.
    subjectPattern: { source: "^[a-z0-9-]+$", flags: "i" },
    recipient: z.object({ roomId: z.string() }),
  },

  // Configured without a token the room still exists and still receives, it
  // just cannot be delivered to.
  available: ({ config }) => Boolean(config.token),

  // Something has to be able to ask the interface that delivered a message
  // for the message back.
  subscriptions: ({ state: client }) => [
    defineSubscription({
      topic: "campfire:source-read",
      payload: z.object({ messageId: z.string() }),
      handle: ({ payload }) => client.read(payload.messageId),
    }),
  ],

  async setup({ config, runtimeState }) {
    // Where the last read got to, so a restart resumes rather than replays.
    const cursor = runtimeState({
      namespace: "cursor",
      schema: z.strictObject({ lastMessageId: z.string() }),
    });
    const client = new CampfireClient(
      config.baseUrl,
      config.workspace,
      config.token ?? "",
    );
    await cursor.get("room");
    return Object.assign(client, { cursor });
  },

  async listen({ state: client, signal, health, messages }) {
    await client.listen({
      signal,
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
          attachments: () => client.attachments(incoming.id),
        });
      },
    });
  },

  // Returning a provider ID enables later progress edits when edit() exists.
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
