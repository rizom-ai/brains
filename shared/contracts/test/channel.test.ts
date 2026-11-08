import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import {
  PUBLISH_CHANNELS,
  defineBusContract,
  defineChannel,
  isChannel,
  publishCompletedChannel,
  publishFailedChannel,
} from "../src";

describe("defineChannel", () => {
  it("declares a channel by its name and the schema its payloads pass", () => {
    const schema = z.object({ id: z.string() });
    const channel = defineChannel("test:channel", schema);

    expect(channel.name).toBe("test:channel");
    expect(channel.schema).toBe(schema);
  });

  it("recognizes a channel, and a bus contract as one", () => {
    expect(isChannel(defineChannel("test:channel", z.object({})))).toBe(true);
    expect(
      isChannel(
        defineBusContract({
          channel: "test:contract",
          request: z.object({}),
          response: z.void(),
          delivery: "command",
        }),
      ),
    ).toBe(true);
  });

  it.each([["test:channel"], [null], [undefined], [{ name: "x" }]])(
    "does not take %p for a channel",
    (value) => {
      expect(isChannel(value)).toBe(false);
    },
  );
});

// What content-pipeline broadcasts after a publish succeeds or fails.
describe("publish channels", () => {
  it("names the publish events", () => {
    expect(publishCompletedChannel.name).toBe(PUBLISH_CHANNELS.completed);
    expect(publishFailedChannel.name).toBe(PUBLISH_CHANNELS.failed);
  });

  it("takes a completed publish with its result", () => {
    const parsed = publishCompletedChannel.schema.safeParse({
      entityType: "post",
      entityId: "hello",
      result: { id: "remote-1", url: "https://example.com/hello" },
    });

    expect(parsed).toEqual({
      success: true,
      data: {
        entityType: "post",
        entityId: "hello",
        result: { id: "remote-1", url: "https://example.com/hello" },
      },
    });
  });

  it.each([
    ["no entity id", { entityType: "post", result: { id: "remote-1" } }],
    ["no result", { entityType: "post", entityId: "hello" }],
    [
      "a result without its id",
      { entityType: "post", entityId: "hello", result: {} },
    ],
  ])("refuses a completed publish with %s", (_case, payload) => {
    expect(publishCompletedChannel.schema.safeParse(payload).success).toBe(
      false,
    );
  });

  it("takes a failed publish with its retry state", () => {
    const payload = {
      entityType: "post",
      entityId: "hello",
      error: "provider down",
      retryCount: 2,
      willRetry: false,
    };

    expect(publishFailedChannel.schema.safeParse(payload)).toEqual({
      success: true,
      data: payload,
    });
  });

  it("refuses a failed publish without its error", () => {
    expect(
      publishFailedChannel.schema.safeParse({
        entityType: "post",
        entityId: "hello",
        retryCount: 1,
        willRetry: false,
      }).success,
    ).toBe(false);
  });
});
