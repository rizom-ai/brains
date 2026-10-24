import { describe, expect, it, mock } from "bun:test";
import { ChannelNames } from "../src/channel-names";

const CHANNEL = "discord:guild-1:1466";

function channelThread(
  fetchMetadata: () => Promise<{ name?: string | undefined }>,
): {
  isDM: boolean;
  channelId: string;
  channel: { fetchMetadata: typeof fetchMetadata };
} {
  return { isDM: false, channelId: CHANNEL, channel: { fetchMetadata } };
}

describe("channel names", () => {
  it("names a channel as the chat app does, asking it once", async () => {
    const fetchMetadata = mock(async () => ({ name: "executive-room" }));
    const names = new ChannelNames();

    expect(await names.nameOf(channelThread(fetchMetadata))).toBe(
      "executive-room",
    );
    expect(await names.nameOf(channelThread(fetchMetadata))).toBe(
      "executive-room",
    );
    expect(fetchMetadata).toHaveBeenCalledTimes(1);
  });

  it("falls back to the channel id when the app cannot say, and asks again later", async () => {
    const fetchMetadata = mock(async (): Promise<{ name?: string }> => {
      throw new Error("Discord is down");
    });
    const names = new ChannelNames();

    expect(await names.nameOf(channelThread(fetchMetadata))).toBe(CHANNEL);
    await names.nameOf(channelThread(fetchMetadata));
    expect(fetchMetadata).toHaveBeenCalledTimes(2);
  });

  it("calls a direct message a DM", async () => {
    const fetchMetadata = mock(async () => ({ name: "whatever" }));
    const names = new ChannelNames();

    expect(
      await names.nameOf({ ...channelThread(fetchMetadata), isDM: true }),
    ).toBe("DM");
    expect(fetchMetadata).not.toHaveBeenCalled();
  });
});
