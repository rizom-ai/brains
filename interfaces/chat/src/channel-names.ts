import { getChannelName, type RoutedThread } from "./discord-routing";

/** A thread whose channel the chat app can describe, as the Chat SDK's do. */
export interface NamedChannelThread extends Pick<
  RoutedThread,
  "isDM" | "channelId"
> {
  channel?: { fetchMetadata(): Promise<{ name?: string | undefined }> };
}

/**
 * Each channel's name, asked of the chat app once and remembered. A channel
 * the app cannot name keeps its id, and is asked about again next time.
 */
export class ChannelNames {
  private readonly names = new Map<string, Promise<string | undefined>>();

  async nameOf(thread: NamedChannelThread): Promise<string> {
    const fallback = getChannelName({ ...thread, id: thread.channelId });
    if (thread.isDM || !thread.channel) return fallback;
    const channel = thread.channel;
    const known =
      this.names.get(thread.channelId) ??
      channel.fetchMetadata().then(
        (info) => {
          const name = info.name?.trim();
          return name === "" ? undefined : name;
        },
        // An unnamed channel is shown by its id; the next message asks again.
        () => undefined,
      );
    this.names.set(thread.channelId, known);
    const name = await known;
    if (!name) this.names.delete(thread.channelId);
    return name ?? fallback;
  }
}
