import { defineMessageInterface, z } from "@rizom/brain/interfaces";

const delivered = z.object({ count: z.string().transform(Number) });

// Included by the standalone/packed consumer typecheck, not loaded by the brain.
export const messageSetupTypeCanary = defineMessageInterface(
  {
    id: "message-setup-canary",
    config: z.object({ prefix: z.string().default("note") }),
    channel: {
      type: "message-setup-canary",
      displayName: "Canary",
      subjectLabel: "Room",
      recipient: z.object({ room: z.string() }),
    },
    // The header fixes the state and the recipient before behavior is checked.
    setup: ({ config, lifecycle, runtimeState }) => {
      const counts = runtimeState({
        namespace: "delivered",
        schema: delivered,
      });
      lifecycle.onCleanup(async () => {
        await counts.clear();
      });
      return { prefix: config.prefix, counts };
    },
  },
  {
    // Behavior slots read that state in whatever order they are written.
    async deliver({ state, recipient, message }) {
      await state.counts.set(recipient.room, { count: "1" });
      const read = await state.counts.get(recipient.room);
      const count: number | undefined = read?.count;
      void count;
      const rejected = (): void => {
        // @ts-expect-error Writes take the schema's input, not its transformed output.
        void state.counts.set(recipient.room, { count: 1 });
        // @ts-expect-error The recipient is the channel's parsed recipient.
        void recipient.roomId;
      };
      void rejected;
      return `${state.prefix}:${message.text}`;
    },
    async send({ state, channel, message }) {
      return `${state.prefix}:${channel.id}:${message.text}`;
    },
  },
);

export function misplacedTransport(): void {
  defineMessageInterface({
    id: "misplaced",
    config: z.object({}),
    channel: {
      type: "misplaced",
      displayName: "Misplaced",
      subjectLabel: "Room",
      recipient: z.string(),
    },
    // @ts-expect-error Behavior is the second argument, not part of the header.
    deliver: () => undefined,
  });
}
