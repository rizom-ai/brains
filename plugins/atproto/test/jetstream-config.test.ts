import { describe, expect, it } from "bun:test";
import { atprotoConfigSchema, atprotoJetstreamConfigSchema } from "../src";

describe("ATProto Jetstream config", () => {
  it("is disabled by default and supplies bounded resource defaults", () => {
    const config = atprotoConfigSchema.parse({});

    expect(config.jetstream).toMatchObject({
      enabled: false,
      endpoint: "wss://jetstream2.us-east.bsky.network/subscribe",
      queueLimit: 256,
      concurrency: 2,
      fetchBudgetPerMinute: 60,
      newAgentsPerHour: 20,
      pendingCandidateCeiling: 200,
    });
  });

  it("exports the nested schema for config tooling", () => {
    expect(atprotoJetstreamConfigSchema.parse({})).toEqual(
      atprotoConfigSchema.parse({}).jetstream,
    );
  });

  it("requires a secure websocket endpoint", () => {
    expect(() =>
      atprotoConfigSchema.parse({
        jetstream: { enabled: true, endpoint: "ws://localhost:6008/subscribe" },
      }),
    ).toThrowError(/wss/i);
  });

  it("rejects unbounded queue and concurrency values", () => {
    expect(() =>
      atprotoConfigSchema.parse({
        jetstream: { queueLimit: 0 },
      }),
    ).toThrowError();
    expect(() =>
      atprotoConfigSchema.parse({
        jetstream: { concurrency: 1000 },
      }),
    ).toThrowError();
  });
});
