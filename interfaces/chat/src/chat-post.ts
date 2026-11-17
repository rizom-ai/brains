import type { MessageTransportSend } from "@brains/sdk/internal/interface-runtime";
import { toPlatformPostOutput } from "./chat-output";
import { chunkForChannel, toPlatformText } from "./chat-platform";

/** What a thread is handed to post: a card, or one chunk of text. */
type PlatformPost =
  | NonNullable<ReturnType<typeof toPlatformPostOutput>>
  | ReturnType<typeof toPlatformText>;

/**
 * Posts a message to a thread: a card as one post, text as the chunks the
 * platform's limit cuts it into. Each chunk is posted once the one before it
 * has landed, so a long message arrives in the order it was written.
 */
export async function postToThread<TSent>(
  thread: { post(message: PlatformPost): Promise<TSent> },
  channelId: string | null,
  message: MessageTransportSend["message"],
  options: { onSent?: (sent: TSent) => void } = {},
): Promise<TSent | undefined> {
  const post = async (output: PlatformPost): Promise<TSent> => {
    const sent = await thread.post(output);
    options.onSent?.(sent);
    return sent;
  };
  const card = toPlatformPostOutput(channelId, message);
  if (card !== undefined) return post(card);
  if (typeof message !== "string") return undefined;
  return chunkForChannel(channelId, message).reduce<Promise<TSent | undefined>>(
    (previous, chunk) =>
      previous.then(() => post(toPlatformText(channelId, chunk))),
    Promise.resolve(undefined),
  );
}
