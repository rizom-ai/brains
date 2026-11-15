import { describe, expect, it } from "bun:test";
import type { JobHandler } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { createMockProgressReporter } from "@brains/test-utils";
import type { FetchLike } from "@brains/utils/fetch-like";
import { agentDiscoveryPlugins, installAll } from "./agent-discovery-plugins";

/**
 * `agent:generation` makes an agent from its Agent Card, as the agent
 * generation handler did: the card fetched and verified from the domain
 * the request names, through the fetch the package was given (here a
 * spied one on `.example` hosts), the agent saved under that host.
 */

function cardFetch(card: Record<string, unknown>): {
  fetch: FetchLike;
  calls: Array<{ url: string; signal: AbortSignal | undefined }>;
} {
  const calls: Array<{ url: string; signal: AbortSignal | undefined }> = [];
  return {
    calls,
    fetch: async (input, init): Promise<Response> => {
      calls.push({ url: String(input), signal: init?.signal ?? undefined });
      return Response.json(card);
    },
  };
}

/** A job the agent type queued for itself, as the runtime queues it. */
function asPackage(input: unknown): unknown {
  return {
    authority: {
      actor: { kind: "service", serviceId: "agent-discovery" },
      permissionCeiling: "public",
    },
    input,
    byPackage: true,
  };
}

async function generation(fetch: FetchLike): Promise<{
  run: (input: unknown) => Promise<unknown>;
  stored: (id: string) => Promise<string | undefined>;
}> {
  const harness = createPluginHarness({});
  await installAll(harness, agentDiscoveryPlugins({ fetch }));
  const handler: JobHandler | undefined = harness
    .getMockShell()
    .getJobQueueService()
    .getHandler("agent:generation");
  if (!handler) throw new Error("No agent generation");
  return {
    run: (input) =>
      handler.process(
        handler.validateAndParse(asPackage(input)),
        "job-1",
        createMockProgressReporter(),
        new AbortController().signal,
      ),
    stored: async (id) =>
      (
        await harness.getEntityService().getEntity({
          entityType: "agent",
          id,
          visibilityScope: "restricted",
        })
      )?.id,
  };
}

describe("agent:generation", () => {
  it("creates the agent under the host its verified card is served from", async () => {
    const network = cardFetch({ name: "A", url: "https://a.example/a2a" });
    const { run, stored } = await generation(network.fetch);

    expect(await run({ url: "https://a.example" })).toEqual({
      success: true,
      entityId: "a.example",
    });
    expect(await stored("a.example")).toBe("a.example");
    expect(network.calls.map((call) => call.url)).toEqual([
      "https://a.example/.well-known/agent-card.json",
    ]);
    expect(network.calls[0]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("refuses a card that claims another host and creates nothing", async () => {
    const network = cardFetch({ name: "B", url: "https://b.example/a2a" });
    const { run, stored } = await generation(network.fetch);

    expect(await run({ url: "a.example" })).toEqual({
      success: false,
      error:
        "Agent Card for a.example has an endpoint URL on another host, b.example (https://b.example/a2a). The endpoint must be https:// on a.example.",
    });
    expect(await stored("a.example")).toBeUndefined();
  });
});
