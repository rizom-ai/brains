import { describe, expect, it } from "bun:test";
import { createMockEntityPluginContext } from "@brains/plugins/test";
import {
  createMockProgressReporter,
  createSilentLogger,
} from "@brains/test-utils";
import type { FetchLike } from "@brains/utils/fetch-like";
import { AgentGenerationJobHandler } from "../src/handlers/agent-generation-handler";

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

function setup(fetchFn: FetchLike): {
  handler: AgentGenerationJobHandler;
  context: ReturnType<typeof createMockEntityPluginContext>;
} {
  const context = createMockEntityPluginContext({
    returns: {
      entityService: {
        createEntity: { entityId: "a.example", jobId: "job", skipped: false },
      },
    },
  });
  const handler = new AgentGenerationJobHandler(
    createSilentLogger("agent-generation"),
    context,
    fetchFn,
  );
  return { handler, context };
}

describe("AgentGenerationJobHandler", () => {
  it("creates the agent under the host its verified card is served from", async () => {
    const network = cardFetch({ name: "A", url: "https://a.example/a2a" });
    const { handler, context } = setup(network.fetch);

    const result = await handler.process(
      { url: "https://a.example" },
      "job-1",
      createMockProgressReporter(),
    );

    expect(result).toMatchObject({ success: true });
    expect(context.entityService.createEntity).toHaveBeenCalledWith(
      expect.objectContaining({
        entity: expect.objectContaining({ id: "a.example" }),
      }),
    );
    expect(network.calls.map((call) => call.url)).toEqual([
      "https://a.example/.well-known/agent-card.json",
    ]);
    expect(network.calls[0]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("refuses a card that claims another host and creates nothing", async () => {
    const network = cardFetch({ name: "B", url: "https://b.example/a2a" });
    const { handler, context } = setup(network.fetch);

    const result = await handler.process(
      { url: "a.example" },
      "job-2",
      createMockProgressReporter(),
    );

    expect(result).toEqual({
      success: false,
      error:
        "Agent Card for a.example has an endpoint URL on another host, b.example (https://b.example/a2a). The endpoint must be https:// on a.example.",
    });
    expect(context.entityService.createEntity).not.toHaveBeenCalled();
  });
});
