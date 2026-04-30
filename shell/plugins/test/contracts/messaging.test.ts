import { describe, expect, it } from "bun:test";
import {
  BaseMessageSchema,
  MessageResponseSchema,
  type MessageResponse,
  type MessageSender,
} from "../../src/contracts/messaging";

describe("public messaging contracts", () => {
  it("accepts successful, error, and noop message responses", () => {
    const success: MessageResponse<{ ok: true }> = {
      success: true,
      data: { ok: true },
    };
    const failure: MessageResponse = { success: false, error: "failed" };
    const noop: MessageResponse = { noop: true };

    expect(MessageResponseSchema.parse(success)).toEqual(success);
    expect(MessageResponseSchema.parse(failure)).toEqual(failure);
    expect(MessageResponseSchema.parse(noop)).toEqual(noop);
  });

  it("validates public base message metadata", () => {
    expect(
      BaseMessageSchema.parse({
        id: "msg-1",
        timestamp: "2026-01-01T00:00:00.000Z",
        type: "example:event",
        source: "example-plugin",
        target: "other-plugin",
        metadata: { trace: "abc" },
      }),
    ).toEqual({
      id: "msg-1",
      timestamp: "2026-01-01T00:00:00.000Z",
      type: "example:event",
      source: "example-plugin",
      target: "other-plugin",
      metadata: { trace: "abc" },
    });
  });

  it("keeps MessageSender options on the public contract", async () => {
    const sender: MessageSender<{ value: number }, { accepted: true }> = async (
      _type,
      _payload,
      options,
    ) => {
      expect(options?.broadcast).toBe(true);
      return { success: true, data: { accepted: true } };
    };

    const response = await sender(
      "example:event",
      { value: 1 },
      { broadcast: true },
    );
    expect(response).toEqual({ success: true, data: { accepted: true } });
  });
});
