import { defineMessageInterface, z } from "@brains/sdk/interfaces";
import { getChatConversationId } from "./chat-metadata";
import { chatConfigSchema } from "./config";
import {
  createPlatformState,
  type ChatPlatformDependencies,
  type ChatPlatformState,
} from "./platform-state";
import { platformRoutes } from "./platform-routes";
import { ChatTurnRouter } from "./turn-router";
import type { ChatPlatform } from "./types";

const CHANNELS: Record<
  ChatPlatform,
  { displayName: string; subjectLabel: string; subjectPattern: string }
> = {
  discord: {
    displayName: "Discord",
    subjectLabel: "Discord user ID",
    subjectPattern: "^[0-9]{17,20}$",
  },
  slack: {
    displayName: "Slack",
    subjectLabel: "Slack member ID",
    subjectPattern: "^[UW][A-Z0-9]+$",
  },
};

/**
 * One chat platform as one message interface.
 *
 * Discord and Slack are each their own interface type — permission rules,
 * channel descriptors and conversation ids are keyed per platform — so each
 * is its own declaration over the package's config. The Chat SDK app, the
 * listener loop and every registry are per platform too; the class this
 * replaced held both in one object and re-routed what came back under the
 * platform's name to itself. Nothing here needs re-routing.
 */
export function platformInterface(
  platform: ChatPlatform,
  dependencies: ChatPlatformDependencies = {},
): ReturnType<typeof defineMessageInterface<typeof chatConfigSchema>> {
  const channel = CHANNELS[platform];
  return defineMessageInterface({
    id: platform,
    config: chatConfigSchema,

    channel: {
      type: platform,
      displayName: channel.displayName,
      subjectLabel: channel.subjectLabel,
      subjectPattern: { source: channel.subjectPattern },
      recipient: z.string(),
      // The key the class wrote: threads already hold conversations under it,
      // and the approvals still pending in them.
      conversationKey: ({ id }) => getChatConversationId(platform, id),
    },

    setup: (context): ChatPlatformState =>
      createPlatformState(platform, context, dependencies),

    // The adapter's inbound events become turns here. The receiver is the
    // same one `listen` gets, and the handlers must exist before the app
    // initializes — a webhook-mode Slack app receives without any loop.
    routes: ({ state, messages }) => {
      new ChatTurnRouter(state, messages).register(state.app);
      return platformRoutes(state);
    },

    listen: async ({ state, signal, health }) => {
      await state.app.initialize();
      state.running = true;
      state.loop?.start();
      health.ready();
      try {
        await new Promise<void>((resolve) => {
          if (signal.aborted) {
            resolve();
            return;
          }
          signal.addEventListener("abort", () => resolve(), { once: true });
        });
      } finally {
        await state.loop?.stop();
        state.threads.clear();
        state.uploads.clear();
        state.presenter.clear();
        await state.app.shutdown();
        state.running = false;
      }
    },

    present: ({
      state,
      channel: room,
      directives,
      permissionLevel,
      confirmation,
    }) =>
      state.presenter.present({
        channelId: room.id,
        directives,
        permissionLevel,
        confirmation,
      }),

    send: ({ state, channel: room, message, event }) =>
      state.presenter.send(room.id, message, event),

    edit: ({ state, channel: room, messageId, message, event }) =>
      state.presenter.edit(room.id, messageId, message, event),

    toolStatus: ({ state, update }) => state.presenter.toolStatus(update),
  });
}
