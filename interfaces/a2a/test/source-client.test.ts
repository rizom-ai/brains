import { describe, expect, it } from "bun:test";
import { caughtError } from "@brains/test-utils";
import { SdkError } from "@brains/sdk/interfaces";
import {
  executeAgentCall,
  agentCallError,
  parseA2AResponse,
  type A2ACallResponse,
} from "../src/client";

const source = {
  id: "post:one",
  source: "post",
  title: "Public essay",
  url: "https://peer.example/essays/one",
  entityType: "post",
  entityId: "one",
  brain: { name: "Forged", url: "https://victim.example" },
  provenance: "forged",
};
function artifact(sources: unknown[]): Record<string, unknown> {
  return { name: "sources", parts: [{ kind: "data", data: { sources } }] };
}
function update(sources: unknown[]): Record<string, unknown> {
  return { result: { kind: "artifact-update", artifact: artifact(sources) } };
}
const terminal = {
  result: {
    kind: "status-update",
    final: true,
    status: {
      state: "completed",
      message: { parts: [{ kind: "text", text: "Answer" }] },
    },
  },
};

async function call(
  events: unknown[],
  options: {
    oneShot?: boolean;
    card?: Record<string, unknown>;
    signal?: AbortSignal;
    body?: ReadableStream<Uint8Array>;
  } = {},
): Promise<{
  result: A2ACallResponse;
  posts: number;
  canceled: number;
  redirects: (RequestRedirect | undefined)[];
}> {
  let posts = 0;
  let canceled = 0;
  const redirects: (RequestRedirect | undefined)[] = [];
  const body =
    options.body ??
    new ReadableStream<Uint8Array>({
      start(controller): void {
        controller.enqueue(
          new TextEncoder().encode(
            events
              .map((event) => `data: ${JSON.stringify(event)}\n\n`)
              .join(""),
          ),
        );
      },
      cancel(): void {
        canceled++;
      },
    });
  const result = await executeAgentCall(
    { agent: "peer.example", message: "Question" },
    {
      maxNetworkAttempts: 1,
      fetch: async (url, init): Promise<Response> => {
        redirects.push(init?.redirect);
        if (String(url).endsWith("agent-card.json"))
          return Response.json(
            options.card ?? {
              name: "Contacted peer",
              url: "https://peer.example/a2a",
              skills: [],
            },
          );
        posts++;
        return new Response(body);
      },
      entities: {
        getEntity: async () =>
          options.oneShot
            ? null
            : {
                id: "peer.example",
                content: "",
                metadata: { status: "approved" },
              },
      },
    },
    { ...(options.signal ? { signal: options.signal } : {}) },
  );
  return { result, posts, canceled, redirects };
}

describe("bounded A2A citation ingestion", () => {
  for (const oneShot of [false, true])
    it(`binds ${oneShot ? "one-shot" : "saved"} sources to the contacted HTTPS origin, not supplied attribution`, async () => {
      const { result, posts, canceled, redirects } = await call(
        [update([source]), terminal],
        { oneShot },
      );
      expect(result.success).toBe(true);
      if (!result.success) throw new Error(result.error);
      expect(result.data.sources).toEqual([
        {
          id: JSON.stringify(["https://peer.example", "post:one"]),
          source: "post",
          title: "Public essay",
          url: source.url,
          entityType: "post",
          entityId: "one",
          brain: { name: "Contacted peer", url: "https://peer.example" },
        },
      ]);
      expect(posts).toBe(1);
      expect(canceled).toBe(1);
      expect(redirects).toEqual(["error", "error"]);
    });

  it("reads named task artifacts, without promoting arbitrary data parts or remote identity claims", () => {
    const result = parseA2AResponse({
      result: {
        kind: "task",
        id: "task",
        status: { state: "completed" },
        artifacts: [artifact([source])],
      },
    });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error);
    expect(result.data.sources).toEqual([
      {
        id: source.id,
        source: "post",
        title: source.title,
        url: source.url,
        entityType: "post",
        entityId: "one",
      },
    ]);
    expect(
      parseA2AResponse({
        result: {
          kind: "message",
          parts: [{ kind: "data", data: { sources: [source] } }],
        },
      }),
    ).toEqual({
      success: true,
      data: { state: "completed", response: "No response text", sources: [] },
    });
  });

  for (const url of [
    "javascript:alert(1)",
    "http://peer.example/one",
    "https://user:password@peer.example/one",
    "https://victim.example/one",
  ])
    it(`refuses unsafe or cross-origin source URL ${url}`, async () => {
      const { result, canceled } = await call([
        update([{ ...source, url }]),
        terminal,
      ]);
      expect(result.success).toBe(false);
      expect(canceled).toBe(1);
    });

  for (const events of [
    [update(Array.from({ length: 21 }, () => source)), terminal],
    [
      update(Array.from({ length: 11 }, () => source)),
      update(Array.from({ length: 10 }, () => source)),
      terminal,
    ],
    [update([{ ...source, title: "x".repeat(513) }]), terminal],
    [
      ...Array.from({ length: 17 }, () => ({
        result: {
          kind: "artifact-update",
          artifact: { name: "other", parts: [] },
        },
      })),
      terminal,
    ],
    Array.from({ length: 128 }, () => ({ result: {} })).concat([terminal]),
    [{ result: {}, padding: "x".repeat(128 * 1024) }, terminal],
    [
      ...Array.from({ length: 40 }, () => ({
        result: {},
        padding: "x".repeat(32 * 1024),
      })),
      terminal,
    ],
  ])
    it("refuses count/field/frame/response limits and closes the reader", async () => {
      const { result, posts, canceled } = await call(events);
      expect(result.success).toBe(false);
      expect(posts).toBe(1);
      expect(canceled).toBe(1);
    });

  it("bounds empty-chunk reads even when no bytes or events accumulate", async () => {
    let pulls = 0;
    let canceled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller): void {
        pulls++;
        controller.enqueue(new Uint8Array());
      },
      cancel(): void {
        canceled = true;
      },
    });
    const { result } = await call([], { body });
    expect(result.success).toBe(false);
    if (result.success) throw new Error("Expected read-limit refusal");
    expect(result.code).toBe("invalid_response");
    expect(pulls).toBeLessThanOrEqual(16_385);
    expect(canceled).toBe(true);
    expect(body.locked).toBe(false);
  });

  it("bounds card bodies before contacting the endpoint", async () => {
    const { result, posts } = await call([terminal], {
      card: {
        name: "Peer",
        url: "https://peer.example/a2a",
        padding: "x".repeat(256 * 1024),
      },
    });
    expect(result.success).toBe(false);
    expect(posts).toBe(0);
  });

  it("does not expose citations from a failed turn", async () => {
    const { result } = await call([
      update([source]),
      { result: { final: true, status: { state: "failed" } } },
    ]);
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error);
    expect(result.data.sources).toEqual([]);
  });

  it("keeps source validation diagnostics out of wire results", async () => {
    const { result } = await call([
      update([{ ...source, url: "javascript:PRIVATE" }]),
      terminal,
    ]);
    expect(result.success).toBe(false);
    if (result.success) throw new Error("Expected source refusal");
    expect(result.code).toBe("invalid_response");
    expect(Object.keys(result).sort()).toEqual(["code", "error", "success"]);
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
    const error = agentCallError(result);
    expect(error).toBeInstanceOf(SdkError);
    expect(error.cause).toBeDefined();
  });

  for (const oneShot of [false, true])
    it(`refuses ${oneShot ? "one-shot" : "saved"} completion canceled during reader cleanup`, async () => {
      const controller = new AbortController();
      const reason = new Error("Stopped during cleanup");
      const body = new ReadableStream<Uint8Array>({
        start(stream): void {
          stream.enqueue(
            new TextEncoder().encode(`data: ${JSON.stringify(terminal)}\n\n`),
          );
        },
        cancel(): void {
          controller.abort(reason);
        },
      });
      const result = await call([], {
        body,
        oneShot,
        signal: controller.signal,
      }).catch(caughtError);
      expect(result).toBe(reason);
      expect(body.locked).toBe(false);
    });

  it("preserves caller cancellation after a source artifact and discards the partial result", async () => {
    const controller = new AbortController();
    const reason = new Error("Caller stopped");
    let canceled = false;
    const body = new ReadableStream<Uint8Array>({
      start(stream): void {
        stream.enqueue(
          new TextEncoder().encode(
            `data: ${JSON.stringify(update([source]))}\n\n`,
          ),
        );
      },
      pull(): void {
        controller.abort(reason);
      },
      cancel(): void {
        canceled = true;
      },
    });
    const error = await call([], { signal: controller.signal, body }).catch(
      caughtError,
    );
    expect(error).toBe(reason);
    expect(canceled).toBe(true);
    expect(body.locked).toBe(false);
  });
});
