import { z } from "@brains/utils/zod";

type SpaceNoticeRequestSchema = z.ZodObject<{
  channelId: z.ZodString;
  interfaceType: z.ZodString;
  title: z.ZodString;
  lines: z.ZodArray<z.ZodString>;
  actions: z.ZodArray<z.ZodObject<{ label: z.ZodString; value: z.ZodString }>>;
  actionChannel: z.ZodString;
  reactions: z.ZodArray<
    z.ZodObject<{ messageId: z.ZodString; emoji: z.ZodString }>
  >;
}>;

/**
 * The most lines and buttons one notice holds: Discord renders each line and
 * button as a component and allows 40 per message.
 */
export const SPACE_NOTICE_ITEM_LIMIT = 10;

/**
 * The longest action value: Discord's 100-character custom_id carries the
 * button's action id (`chat.space-notice`), a newline and the value.
 */
export const SPACE_NOTICE_VALUE_LIMIT = 82;

/**
 * A short note a plugin asks a chat interface to post into a configured
 * space, with one button per action and reactions on the messages it is
 * about. A click is forwarded to `actionChannel` with the action's value.
 */
export const spaceNoticeRequestSchema: SpaceNoticeRequestSchema = z.object({
  /** The space's channel, as its conversation records it (the chat SDK's id). */
  channelId: z.string().min(1),
  interfaceType: z.string().min(1),
  title: z.string().min(1).max(200),
  lines: z.array(z.string().min(1)).min(1).max(SPACE_NOTICE_ITEM_LIMIT),
  actions: z
    .array(
      z.object({
        label: z.string().min(1).max(80),
        value: z.string().min(1).max(SPACE_NOTICE_VALUE_LIMIT),
      }),
    )
    .max(SPACE_NOTICE_ITEM_LIMIT),
  actionChannel: z.string().min(1),
  reactions: z.array(
    z.object({ messageId: z.string().min(1), emoji: z.string().min(1) }),
  ),
});

export type SpaceNoticeRequest = z.output<typeof spaceNoticeRequestSchema>;

/** The posted notice, so its poster can mark it posted and edit it later. */
export const spaceNoticeResultSchema: z.ZodObject<{
  messageId: z.ZodString;
}> = z.object({ messageId: z.string().min(1) });

export type SpaceNoticeResult = z.output<typeof spaceNoticeResultSchema>;
