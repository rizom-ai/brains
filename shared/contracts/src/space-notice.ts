import { z } from "@brains/utils/zod";

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

type SpaceNoticeContentSchema = z.ZodObject<{
  title: z.ZodString;
  lines: z.ZodArray<z.ZodString>;
  actions: z.ZodArray<z.ZodObject<{ label: z.ZodString; value: z.ZodString }>>;
}>;

/** What a space notice reads: a title, its lines and a button per action. */
export const spaceNoticeContentSchema: SpaceNoticeContentSchema = z.object({
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
});

export type SpaceNoticeContent = z.output<typeof spaceNoticeContentSchema>;

type SpaceNoticeRequestSchema = z.ZodObject<
  SpaceNoticeContentSchema["shape"] & {
    channelId: z.ZodString;
    interfaceType: z.ZodString;
    reactions: z.ZodArray<
      z.ZodObject<{ messageId: z.ZodString; emoji: z.ZodString }>
    >;
  }
>;

/**
 * A short note a plugin asks a chat interface to post into a configured
 * space, with one button per action and reactions on the messages it is
 * about. A click is sent as a `SpaceNoticeAction`.
 */
export const spaceNoticeRequestSchema: SpaceNoticeRequestSchema =
  spaceNoticeContentSchema.extend({
    /** The space's channel, as its conversation records it (the chat SDK's id). */
    channelId: z.string().min(1),
    interfaceType: z.string().min(1),
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

/**
 * A click on a space notice's button. The plugin that posted the notice
 * answers with the notice's new content; every other plugin ignores it.
 */
export const spaceNoticeActionSchema: z.ZodObject<{
  conversationId: z.ZodString;
  noticeMessageId: z.ZodString;
  value: z.ZodString;
  by: z.ZodString;
}> = z.object({
  /** The space's conversation, as the chat interface stores its messages. */
  conversationId: z.string().min(1),
  /** The notice the button is on. */
  noticeMessageId: z.string().min(1),
  /** The clicked action's value. */
  value: z.string().min(1),
  /** Who clicked, by name. */
  by: z.string().min(1),
});

export type SpaceNoticeAction = z.output<typeof spaceNoticeActionSchema>;
