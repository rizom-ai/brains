import { describe, expect, it } from "bun:test";
import type { Channel } from "@brains/contracts";
import {
  ATPROTO_BRAIN_CARD_CONFLICT,
  ATPROTO_BRAIN_CARD_DISCOVERED,
  ATPROTO_BRAIN_CARD_REFRESHED,
  ATPROTO_BRAIN_CARD_UNAVAILABLE,
  ATPROTO_BRAIN_DISCOVERED,
  ATPROTO_JETSTREAM_GAP,
  atprotoBrainCardConflictChannel,
  atprotoBrainCardDiscoveredChannel,
  atprotoBrainCardRefreshedChannel,
  atprotoBrainCardUnavailableChannel,
  atprotoBrainDiscoveredChannel,
  atprotoJetstreamGapChannel,
} from "../src";

const discovery = {
  agentId: "remote.example",
  name: "Remote",
  url: "https://remote.example",
  status: "discovered",
};

interface ChannelCase {
  channel: Channel<unknown>;
  name: string;
  valid: Record<string, unknown>;
}

const cases: ChannelCase[] = [
  {
    channel: atprotoBrainCardUnavailableChannel,
    name: ATPROTO_BRAIN_CARD_UNAVAILABLE,
    valid: {
      repoDid: "did:plc:remote",
      observedAt: "2026-11-07T12:00:00.000Z",
      reason: "deleted",
    },
  },
  {
    channel: atprotoBrainCardConflictChannel,
    name: ATPROTO_BRAIN_CARD_CONFLICT,
    valid: {
      domain: "remote.example",
      candidateRepoDid: "did:plc:remote",
      observedAt: "2026-11-07T12:00:00.000Z",
      reason: "A different repo DID claimed an existing agent domain",
    },
  },
  {
    channel: atprotoBrainDiscoveredChannel,
    name: ATPROTO_BRAIN_DISCOVERED,
    valid: discovery,
  },
  {
    channel: atprotoBrainCardRefreshedChannel,
    name: ATPROTO_BRAIN_CARD_REFRESHED,
    valid: discovery,
  },
  {
    channel: atprotoJetstreamGapChannel,
    name: ATPROTO_JETSTREAM_GAP,
    valid: {
      previousCursorTimeUs: 1,
      clampedCursorTimeUs: 2,
      observedAt: "2026-11-07T12:00:00.000Z",
    },
  },
];

describe("ATProto discovery event channels", () => {
  it.each(cases)(
    "$name carries its event name and admits only its payload",
    ({ channel, name, valid }) => {
      expect(channel.name).toBe(name);
      expect(channel.schema.safeParse(valid).success).toBe(true);
      expect(
        channel.schema.safeParse({ ...valid, unexpected: true }).success,
      ).toBe(false);
    },
  );

  it("refuses a discovered card whose record is not a brain card", () => {
    expect(atprotoBrainCardDiscoveredChannel.name).toBe(
      ATPROTO_BRAIN_CARD_DISCOVERED,
    );
    expect(
      atprotoBrainCardDiscoveredChannel.schema.safeParse({
        repoDid: "did:plc:remote",
        uri: "at://did:plc:remote/ai.rizom.brain.card/self",
        cid: "bafy",
        record: { $type: "ai.rizom.brain.note" },
      }).success,
    ).toBe(false);
  });
});
