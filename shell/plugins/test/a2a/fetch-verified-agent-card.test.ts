import { describe, expect, it } from "bun:test";
import type { FetchLike } from "@brains/utils/fetch-like";
import {
  fetchVerifiedAgentCard,
  isEndpointRefusal,
  type AgentCardRefusalReason,
} from "../../src/a2a/fetch-verified-agent-card";

interface RecordedFetch {
  fetch: FetchLike;
  calls: Array<{ url: string; signal: AbortSignal | undefined }>;
}

/** Serve one response for every request, recording what was asked. */
function serving(respond: () => Response): RecordedFetch {
  const calls: RecordedFetch["calls"] = [];
  return {
    calls,
    fetch: async (input, init): Promise<Response> => {
      calls.push({ url: String(input), signal: init?.signal ?? undefined });
      return respond();
    },
  };
}

function servingCard(card: unknown): RecordedFetch {
  return serving(() => Response.json(card));
}

/** A fetch that never answers until its signal aborts, as a real fetch does. */
function hangingUntilAborted(): FetchLike {
  return (_input, init) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) return;
      signal.addEventListener("abort", () => reject(signal.reason), {
        once: true,
      });
    });
}

describe("fetchVerifiedAgentCard", () => {
  it("fetches the card over HTTPS from the host's well-known path", async () => {
    const network = servingCard({
      name: "Remote",
      url: "https://a.example/a2a",
    });

    const result = await fetchVerifiedAgentCard("a.example", {
      fetch: network.fetch,
    });

    expect(result).toMatchObject({
      ok: true,
      card: { brainName: "Remote", url: "https://a.example/a2a" },
    });
    expect(network.calls.map((call) => call.url)).toEqual([
      "https://a.example/.well-known/agent-card.json",
    ]);
  });

  it("refuses a card whose endpoint is on another host, naming both", async () => {
    const network = servingCard({
      name: "Claimer",
      url: "https://b.example/a2a",
    });

    const result = await fetchVerifiedAgentCard("a.example", {
      fetch: network.fetch,
    });

    expect(result).toEqual({
      ok: false,
      reason: "host_mismatch",
      error:
        "Agent Card for a.example has an endpoint URL on another host, b.example (https://b.example/a2a). The endpoint must be https:// on a.example.",
    });
  });

  it("refuses a card whose endpoint is not HTTPS", async () => {
    const network = servingCard({
      name: "Plain",
      url: "http://a.example/a2a",
    });

    const result = await fetchVerifiedAgentCard("a.example", {
      fetch: network.fetch,
    });

    expect(result).toEqual({
      ok: false,
      reason: "untrusted_endpoint",
      error:
        "Agent Card for a.example has an untrusted endpoint URL (http://a.example/a2a). The endpoint must be https:// on a.example.",
    });
  });

  it("refuses a card whose endpoint is not a URL", async () => {
    const network = servingCard({ name: "Broken", url: "not a url" });

    const result = await fetchVerifiedAgentCard("a.example", {
      fetch: network.fetch,
    });

    expect(result).toEqual({
      ok: false,
      reason: "untrusted_endpoint",
      error: "Agent Card for a.example has an invalid endpoint URL.",
    });
  });

  it("refuses anything but a bare host before any request", async () => {
    const network = servingCard({ name: "Any", url: "https://a.example/a2a" });

    const results = await Promise.all(
      [
        "http://a.example",
        "https://a.example",
        "a.example/path",
        "user@a.example",
        "",
      ].map((host) => fetchVerifiedAgentCard(host, { fetch: network.fetch })),
    );

    for (const result of results) {
      expect(result).toMatchObject({ ok: false, reason: "invalid_host" });
    }
    expect(network.calls).toEqual([]);
  });

  it("reports an unreachable or failing host as unavailable", async () => {
    const failing = serving(() => new Response("gone", { status: 404 }));
    const throwing: FetchLike = async () => {
      throw new Error("connection refused");
    };

    expect(
      await fetchVerifiedAgentCard("a.example", { fetch: failing.fetch }),
    ).toEqual({
      ok: false,
      reason: "unavailable",
      error: "Could not fetch an Agent Card from https://a.example (HTTP 404).",
    });
    expect(
      await fetchVerifiedAgentCard("a.example", { fetch: throwing }),
    ).toEqual({
      ok: false,
      reason: "unavailable",
      error: "Could not fetch an Agent Card from https://a.example.",
    });
  });

  it("reports a body that is no Agent Card as an invalid card", async () => {
    const notJson = serving(() => new Response("<html>", { status: 200 }));
    const notACard = servingCard({ hello: "world" });

    for (const network of [notJson, notACard]) {
      expect(
        await fetchVerifiedAgentCard("a.example", { fetch: network.fetch }),
      ).toEqual({
        ok: false,
        reason: "invalid_card",
        error: "https://a.example serves no valid A2A Agent Card.",
      });
    }
  });

  it("times out a card fetch that never answers", async () => {
    const result = await fetchVerifiedAgentCard("a.example", {
      fetch: hangingUntilAborted(),
      timeoutMs: 10,
    });

    expect(result).toEqual({
      ok: false,
      reason: "timeout",
      error: "Agent Card from https://a.example did not arrive within 10 ms.",
    });
  });

  it("times out a fetch that ignores its signal", async () => {
    const deaf: FetchLike = () => new Promise<Response>(() => {});

    const result = await fetchVerifiedAgentCard("a.example", {
      fetch: deaf,
      timeoutMs: 10,
    });

    expect(result).toMatchObject({ ok: false, reason: "timeout" });
  });

  it("times out a card body that never finishes", async () => {
    const stalledBody = serving(
      () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller): void {
              controller.enqueue(new TextEncoder().encode('{"name":'));
            },
          }),
        ),
    );

    const result = await fetchVerifiedAgentCard("a.example", {
      fetch: stalledBody.fetch,
      timeoutMs: 10,
    });

    expect(result).toMatchObject({ ok: false, reason: "timeout" });
  });

  it("gives the request a signal, so the timeout reaches the network", async () => {
    const network = servingCard({ name: "Remote", url: "https://a.example" });

    await fetchVerifiedAgentCard("a.example", { fetch: network.fetch });

    expect(network.calls[0]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("rejects with the caller's reason when the caller cancels", async () => {
    const controller = new AbortController();
    const reason = new Error("caller stopped");

    const pending = fetchVerifiedAgentCard("a.example", {
      fetch: hangingUntilAborted(),
      timeoutMs: 5_000,
      signal: controller.signal,
    });
    controller.abort(reason);

    expect(
      await pending.then(
        () => undefined,
        (error) => error,
      ),
    ).toBe(reason);
  });

  it("counts only refusals about where a card points as endpoint refusals", () => {
    expect(isEndpointRefusal("host_mismatch")).toBe(true);
    expect(isEndpointRefusal("untrusted_endpoint")).toBe(true);
    const missing: AgentCardRefusalReason[] = [
      "invalid_host",
      "unavailable",
      "timeout",
      "invalid_card",
    ];
    for (const reason of missing) {
      expect(isEndpointRefusal(reason)).toBe(false);
    }
  });
});
