import { describe, expect, test } from "bun:test";
import { decodeFileModelCall } from "../src/file-model-request";
import {
  decodeFileModelPart,
  decodeFileModelResult,
  encodeFileModelPart,
  encodeFileModelResult,
  FILE_MODEL_FRAME_BYTES,
  type FileModelResult,
} from "../src/file-model-result";

function result(): FileModelResult {
  return {
    content: [{ type: "text", text: "Extracted answer" }],
    finishReason: { unified: "stop", raw: "end_turn" },
    usage: {
      inputTokens: {
        total: 20,
        noCache: 20,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: { total: 5, text: 5, reasoning: undefined },
    },
    warnings: [],
  };
}

describe("native file model control wire", () => {
  test("never reads SDK request or raw response bodies", () => {
    const encoded = encodeFileModelResult({
      ...result(),
      get request(): never {
        throw new Error("Source bytes read from request diagnostic");
      },
      response: {
        id: "response-1",
        timestamp: new Date("2026-01-01T00:00:00.000Z"),
        headers: { "x-request-id": "native-1" },
        get body(): never {
          throw new Error("Raw response diagnostic read");
        },
      },
    });
    const decoded = decodeFileModelResult(encoded);
    expect(decoded.content).toEqual(result().content);
    expect(decoded.request).toBeUndefined();
    expect(decoded.response).toEqual({
      id: "response-1",
      timestamp: new Date("2026-01-01T00:00:00.000Z"),
      headers: { "x-request-id": "native-1" },
    });
    expect(decoded.usage).toEqual(result().usage);
  });

  test("rejects binary output before accessing the payload", () => {
    expect(() =>
      encodeFileModelResult({
        ...result(),
        content: [
          {
            type: "file",
            mediaType: "image/png",
            get data(): never {
              throw new Error("Payload getter entered");
            },
          },
        ],
      }),
    ).toThrow("Binary model output requires a separate asset boundary");
    expect(() =>
      encodeFileModelPart({
        type: "file",
        mediaType: "image/png",
        get data(): never {
          throw new Error("Payload getter entered");
        },
      }),
    ).toThrow("Binary and raw model output require a separate asset boundary");
    expect(() =>
      encodeFileModelPart({
        type: "raw",
        get rawValue(): never {
          throw new Error("Raw getter entered");
        },
      }),
    ).toThrow("Binary and raw model output require a separate asset boundary");
  });

  test("round-trips text, tool calls, finish and timestamp metadata", () => {
    const parts = [
      { type: "text-delta", id: "text-1", delta: "Hello" },
      {
        type: "tool-call",
        toolCallId: "call-1",
        toolName: "system_create",
        input: '{"entityType":"note"}',
        providerExecuted: false,
      },
      {
        type: "finish",
        finishReason: result().finishReason,
        usage: result().usage,
      },
      {
        type: "response-metadata",
        id: "response-1",
        timestamp: new Date("2026-01-01T00:00:00.000Z"),
      },
    ];
    for (const part of parts) {
      const encoded = JSON.stringify(part);
      expect(
        JSON.parse(encodeFileModelPart(decodeFileModelPart(encoded))),
      ).toEqual(JSON.parse(encoded));
    }
  });

  test("retains distinct failure causes without transporting SDK request bodies", () => {
    const source = new Error("source failed");
    const retirement = new Error("retirement failed");
    const part = decodeFileModelPart(
      encodeFileModelPart({
        type: "error",
        error: new AggregateError([source, retirement], "native failure", {
          cause: source,
        }),
      }),
    );
    expect(part.type).toBe("error");
    if (part.type !== "error" || !(part.error instanceof AggregateError))
      throw new Error("Missing native aggregate error");
    expect(part.error.errors.map((error: Error) => error.message)).toEqual([
      "source failed",
      "retirement failed",
    ]);
    expect(part.error.cause).toBe(part.error.errors[0]);
  });

  test("enforces frame bounds on both sides", () => {
    expect(() =>
      encodeFileModelPart({
        type: "text-delta",
        id: "1",
        delta: "x".repeat(FILE_MODEL_FRAME_BYTES),
      }),
    ).toThrow("control frame limit");
    expect(() =>
      decodeFileModelPart(" ".repeat(FILE_MODEL_FRAME_BYTES + 1)),
    ).toThrow("control frame limit");
  });

  test("retains tool and provider settings while reconstructing URL metadata", () => {
    const call = decodeFileModelCall({
      prompt: [
        {
          role: "user",
          content: [
            {
              type: "file",
              mediaType: "application/pdf",
              data: "brains-upload:example",
              filename: "input.pdf",
            },
          ],
        },
      ],
      tools: [
        {
          type: "function",
          name: "system_create",
          strict: true,
          inputSchema: { type: "object" },
          inputExamples: [{ input: { entityType: "note" } }],
        },
      ],
      providerOptions: {
        anthropic: { thinking: { type: "enabled", budgetTokens: 1000 } },
      },
      headers: { "x-request-id": "call-1" },
    });
    expect(call.tools?.[0]).toEqual({
      type: "function",
      name: "system_create",
      strict: true,
      inputSchema: { type: "object" },
      inputExamples: [{ input: { entityType: "note" } }],
    });
    expect(call.providerOptions).toEqual({
      anthropic: { thinking: { type: "enabled", budgetTokens: 1000 } },
    });
    expect(call.prompt).toEqual([
      {
        role: "user",
        content: [
          {
            type: "file",
            mediaType: "application/pdf",
            data: new URL("brains-upload:example"),
            filename: "input.pdf",
          },
        ],
      },
    ]);
  });

  test("rejects inline, filesystem and raw requests rather than falling back", () => {
    for (const data of [
      "data:application/pdf;base64,JVBERi0=",
      "JVBERi0=",
      "file:///private/input.pdf",
      new Uint8Array([1, 2, 3]),
    ]) {
      expect(() =>
        decodeFileModelCall({
          prompt: [
            {
              role: "user",
              content: [{ type: "file", mediaType: "application/pdf", data }],
            },
          ],
        }),
      ).toThrow();
    }
    expect(() =>
      decodeFileModelCall({ prompt: [], includeRawChunks: true }),
    ).toThrow();
    expect(() =>
      decodeFileModelPart(
        '{"type":"file","mediaType":"image/png","data":"bytes"}',
      ),
    ).toThrow();
  });
});
