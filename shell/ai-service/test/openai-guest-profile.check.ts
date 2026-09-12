import { describe, expect, it } from "bun:test";
import {
  createOpenAiGuestProfile,
  openAiGuestContextTokens,
} from "../src/openai-guest-profile";
import { GuestTurnBudget, type GuestModelCall } from "../src/guest-turn-budget";
import { z } from "@brains/utils/zod";
import { createBrainAgentFactory } from "../src/brain-agent";
import { MockLanguageModelV3 } from "ai/test";
import { createMockMessageBus } from "@brains/messaging-service/test";
import type { Tool } from "@brains/mcp-service";
import { testGuestExecution } from "./fixtures/guest-execution";
import { guestInterfaceType } from "@brains/contracts/chat";

async function expectFailure(
  result: Promise<unknown>,
  message?: string,
): Promise<void> {
  const failure = await result.then(
    () => undefined,
    (error: unknown) => error,
  );
  expect(failure).toBeInstanceOf(Error);
  if (message) expect(failure).toMatchObject({ message });
}

const params: GuestModelCall = {
  prompt: [
    { role: "user", content: [{ type: "text", text: "Public question" }] },
  ],
  maxOutputTokens: 1200,
};
function reply(): Response {
  return Response.json({
    id: "resp_guest",
    created_at: 1,
    model: "gpt-5.6-luna",
    status: "completed",
    error: null,
    incomplete_details: null,
    output: [
      {
        id: "msg_guest",
        type: "message",
        role: "assistant",
        status: "completed",
        content: [
          { type: "output_text", text: "Public answer", annotations: [] },
        ],
      },
    ],
    usage: {
      input_tokens: 10,
      output_tokens: 6,
      total_tokens: 16,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 0 },
    },
    service_tier: "default",
  });
}
const wire = z.looseObject({
  model: z.string(),
  store: z.boolean(),
  service_tier: z.string(),
  prompt_cache_options: z.strictObject({ mode: z.literal("explicit") }),
  max_output_tokens: z.number(),
  reasoning: z.strictObject({ effort: z.literal("low") }),
  input: z.array(z.unknown()),
});

describe("fixed OpenAI guest profile (no live API)", () => {
  it("serializes the real SDK request with the priced endpoint/tier, no storage or cache writes", async () => {
    const requests: RequestInit[] = [];
    const profile = createOpenAiGuestProfile({
      apiKey: "test-only-key",
      embeddingsEnabled: true,
      fetch: async (url, init): Promise<Response> => {
        expect(String(url)).toBe("https://api.openai.com/v1/responses");
        if (!init) throw new Error("Missing request");
        requests.push(init);
        return reply();
      },
    });
    const quote = await profile.accounting.model({
      provider: profile.model.provider,
      modelId: profile.model.modelId,
      params,
    });
    expect(quote).toEqual({
      inputTokens: openAiGuestContextTokens,
      maxCostMicroUsd: 422160,
    });
    expect(requests).toHaveLength(0);
    const result = await profile.model.doGenerate(params);
    expect(result.content).toContainEqual(
      expect.objectContaining({ type: "text", text: "Public answer" }),
    );
    expect(requests).toHaveLength(1);
    const request = requests[0];
    expect(request?.redirect).toBe("error");
    const body = wire.parse(JSON.parse(String(request?.body)));
    expect(body).toMatchObject({
      model: "gpt-5.6-luna",
      store: false,
      service_tier: "default",
      prompt_cache_options: { mode: "explicit" },
      max_output_tokens: 1200,
      reasoning: { effort: "low" },
    });
    expect(body).not.toHaveProperty("previous_response_id");
    expect(body).not.toHaveProperty("conversation");
    expect(body).not.toHaveProperty("stream");
  });

  it("runs a bounded guest tool loop through the actual SDK without using the authenticated model", async () => {
    const bodies: unknown[] = [];
    let reads = 0;
    let embeddingCalls = 0;
    let embeddingSucceeded = false;
    const profile = createOpenAiGuestProfile({
      apiKey: "test",
      embeddingsEnabled: true,
      fetch: async (_url, init): Promise<Response> => {
        if (String(_url).endsWith("/embeddings")) {
          embeddingCalls++;
          expect(JSON.parse(String(init?.body))).toMatchObject({
            model: "text-embedding-3-small",
            input: ["public"],
            dimensions: 1536,
          });
          return Response.json({
            model: "text-embedding-3-small",
            data: [{ index: 0, embedding: Array(1536).fill(0) }],
            usage: { prompt_tokens: 5, total_tokens: 5 },
          });
        }
        bodies.push(JSON.parse(String(init?.body)));
        if (bodies.length === 1)
          return Response.json({
            service_tier: "default",
            id: "resp_tool",
            created_at: 1,
            model: "gpt-5.6-luna",
            status: "completed",
            output: [
              {
                type: "function_call",
                id: "fc_1",
                call_id: "call_1",
                name: "system_search",
                arguments: '{"query":"public"}',
              },
            ],
            usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
          });
        return reply();
      },
    });
    const tool: Tool = {
      name: "system_search",
      description: "Search public knowledge",
      visibility: "public",
      sideEffects: "none",
      inputSchema: { query: z.string() },
      handler: async (_args, context) => {
        reads++;
        if (!context.guestQueryEmbedding || !context.signal)
          throw new Error("Missing prepaid query capability");
        const vector = await context.guestQueryEmbedding(
          "public",
          context.signal,
        );
        expect(vector.length).toBe(1536);
        const repeated = await context
          .guestQueryEmbedding("public", context.signal)
          .catch((error: unknown) => error);
        expect(repeated).toBeInstanceOf(Error);
        embeddingSucceeded = true;
        return {
          success: true as const,
          data: { content: "Public source evidence" },
        };
      },
    };
    const agent = createBrainAgentFactory({
      model: new MockLanguageModelV3({
        doGenerate: async (): Promise<never> => {
          throw new Error("Authenticated model must not run");
        },
      }),
      modelId: "gpt-5.6-luna",
      guestProfile: profile,
      messageBus: createMockMessageBus(),
    })({
      identity: {
        name: "Private identity",
        role: "Private role",
        purpose: "Private purpose",
        values: [],
      },
      tools: [tool],
      getToolsForPermission: () => [tool],
      pluginInstructions: [],
      agentInstructions: [],
      stepLimit: 3,
    });
    const result = await agent.generate({
      messages: [{ role: "user", content: "Find public evidence" }],
      options: {
        conversationId: "guest-test",
        interfaceType: guestInterfaceType,
        userPermissionLevel: "public",
        isAnchor: false,
        guestExecution: {
          ...testGuestExecution,
          maxCostMicroUsd: 2000000,
          limits: {
            ...testGuestExecution.limits,
            contextTokens: openAiGuestContextTokens,
          },
        },
      },
    });
    expect(result.text).toBe("Public answer");
    expect(reads).toBe(1);
    expect(embeddingCalls).toBe(1);
    expect(embeddingSucceeded).toBe(true);
    expect(bodies).toHaveLength(2);
    expect(JSON.stringify(bodies)).toContain("Public source evidence");
    expect(JSON.stringify(bodies)).not.toContain("Private identity");
    for (const body of bodies)
      expect(wire.parse(body)).toMatchObject({
        store: false,
        service_tier: "default",
        prompt_cache_options: { mode: "explicit" },
      });
  });

  it("leaves authenticated generation on its original model", async () => {
    const profile = createOpenAiGuestProfile({
      apiKey: "test",
      embeddingsEnabled: true,
      fetch: async (): Promise<never> => {
        throw new Error("Guest transport must not run");
      },
    });
    const model = new MockLanguageModelV3({
      doGenerate: {
        content: [{ type: "text", text: "Authenticated answer" }],
        finishReason: { unified: "stop", raw: "stop" },
        warnings: [],
        usage: {
          inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 1, text: 1, reasoning: 0 },
        },
      },
    });
    const agent = createBrainAgentFactory({
      model,
      guestProfile: profile,
      messageBus: createMockMessageBus(),
    })({
      identity: {
        name: "Brain",
        role: "Assistant",
        purpose: "Help",
        values: [],
      },
      tools: [],
      getToolsForPermission: () => [],
      pluginInstructions: [],
      agentInstructions: [],
    });
    expect(
      (
        await agent.generate({
          messages: [{ role: "user", content: "Hello" }],
          options: {
            conversationId: "auth",
            interfaceType: "web-chat",
            userPermissionLevel: "admin",
            isAnchor: true,
          },
        })
      ).text,
    ).toBe("Authenticated answer");
    expect(model.doGenerateCalls).toHaveLength(1);
  });

  it("reserves search embeddings before dispatch and retains failed reservations without retries", async () => {
    let calls = 0;
    const profile = createOpenAiGuestProfile({
      apiKey: "test",
      embeddingsEnabled: true,
      fetch: async (): Promise<Response> => {
        calls++;
        return new Response("private provider error", { status: 503 });
      },
    });
    for (const cap of [163, 164]) {
      const budget = new GuestTurnBudget(
        { ...testGuestExecution, maxCostMicroUsd: cap },
        profile.accounting,
      );
      try {
        const run = (): Promise<unknown> =>
          budget.executeTool("system_search", { query: "public" }, () =>
            profile.queryEmbedding("public", budget.signal),
          );
        await expectFailure(
          run(),
          cap === 163
            ? "Guest cost limit exceeded"
            : "Guest query embedding unavailable",
        );
        expect(calls).toBe(cap === 163 ? 0 : 1);
        await expectFailure(run(), "Guest cost limit exceeded");
        expect(calls).toBe(cap === 163 ? 0 : 1);
      } finally {
        budget.dispose();
      }
    }
  });

  it("rejects cancelled and oversized queries before fetch and validates embedding model/usage", async () => {
    let calls = 0;
    let model = "unexpected-model";
    let tokens = 5;
    let value = 0;
    const profile = createOpenAiGuestProfile({
      apiKey: "test",
      embeddingsEnabled: true,
      fetch: async (): Promise<Response> => {
        calls++;
        return Response.json({
          model,
          data: [{ index: 0, embedding: Array(1536).fill(value) }],
          usage: { prompt_tokens: tokens, total_tokens: tokens },
        });
      },
    });
    await expectFailure(profile.queryEmbedding("public", AbortSignal.abort()));
    await expectFailure(
      profile.queryEmbedding("x".repeat(4001), new AbortController().signal),
      "Guest query embedding unavailable",
    );
    expect(calls).toBe(0);
    await expectFailure(
      profile.queryEmbedding("public", new AbortController().signal),
      "Guest query embedding unavailable",
    );
    model = "text-embedding-3-small";
    tokens = 8193;
    await expectFailure(
      profile.queryEmbedding("public", new AbortController().signal),
      "Guest query embedding unavailable",
    );
    tokens = 5;
    value = 1e300;
    await expectFailure(
      profile.queryEmbedding("public", new AbortController().signal),
      "Guest query embedding unavailable",
    );
    expect(calls).toBe(3);
  });

  it("rejects late embedding completion after cancellation without retrying", async () => {
    const cancellation = new AbortController();
    let calls = 0;
    const profile = createOpenAiGuestProfile({
      apiKey: "test",
      embeddingsEnabled: true,
      fetch: async (): Promise<Response> => {
        calls++;
        cancellation.abort(new Error("Fixture cancelled"));
        return Response.json({
          model: "text-embedding-3-small",
          data: [{ index: 0, embedding: Array(1536).fill(0) }],
          usage: { prompt_tokens: 5, total_tokens: 5 },
        });
      },
    });
    const budget = new GuestTurnBudget(
      { ...testGuestExecution, maxCostMicroUsd: 164 },
      profile.accounting,
      cancellation.signal,
    );
    try {
      const run = (): Promise<unknown> =>
        budget.executeTool("system_search", { query: "public" }, () =>
          profile.queryEmbedding("public", budget.signal),
        );
      await expectFailure(run(), "Fixture cancelled");
      await expectFailure(run(), "Fixture cancelled");
      expect(calls).toBe(1);
    } finally {
      budget.dispose();
    }
  });

  it("quotes locally, rounds up, and refuses other models and unsupported output limits", async () => {
    const profile = createOpenAiGuestProfile({
      apiKey: "test",
      embeddingsEnabled: true,
      fetch: async (): Promise<never> => {
        throw new Error("Unexpected network request");
      },
    });
    const request = {
      provider: profile.model.provider,
      modelId: profile.model.modelId,
      params: { ...params, maxOutputTokens: 1 },
    };
    expect(await profile.accounting.model(request)).toEqual({
      inputTokens: 1050000,
      maxCostMicroUsd: 420002,
    });
    expect(
      profile.accounting.model({ ...request, modelId: "another-model" }),
    ).rejects.toThrow("Guest accounting unavailable");
    expect(
      profile.accounting.model({ ...request, provider: "another-provider" }),
    ).rejects.toThrow("Guest accounting unavailable");
    expect(
      profile.accounting.model({
        ...request,
        params: { ...params, maxOutputTokens: 1201 },
      }),
    ).rejects.toThrow("Guest accounting unavailable");
    expect(
      await profile.accounting.tool({
        name: "system_search",
        input: { query: "public" },
        signal: new AbortController().signal,
      }),
    ).toEqual({ maxCostMicroUsd: 164 });
    expect(
      profile.accounting.tool({
        name: "remote_search",
        input: {},
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow("Guest accounting unavailable");
  });

  it("blocks native options, remote tools, images, structured output and streaming before fetch", async () => {
    let calls = 0;
    const profile = createOpenAiGuestProfile({
      apiKey: "test",
      embeddingsEnabled: true,
      fetch: async (): Promise<Response> => {
        calls++;
        return reply();
      },
    });
    const denied: GuestModelCall[] = [
      { ...params, headers: { "OpenAI-Project": "unreviewed-project" } },
      {
        ...params,
        providerOptions: { openai: { store: true, serviceTier: "priority" } },
      },
      {
        ...params,
        tools: [
          {
            type: "provider",
            id: "openai.web_search",
            name: "web_search",
            args: {},
          },
        ],
      },
      {
        ...params,
        prompt: [
          {
            role: "user",
            content: [
              {
                type: "file",
                data: new URL("https://private.invalid/image"),
                mediaType: "image/png",
              },
            ],
          },
        ],
      },
      { ...params, responseFormat: { type: "json" } },
      { ...params, maxOutputTokens: 1201 },
      {
        ...params,
        prompt: [
          {
            role: "user",
            content: [{ type: "text", text: "x".repeat(32000) }],
          },
        ],
      },
    ];
    for (const input of denied) {
      const failure = await Promise.resolve(
        profile.model.doGenerate(input),
      ).catch((error: unknown): unknown => error);
      expect(failure).toBeInstanceOf(Error);
    }
    expect(Promise.resolve(profile.model.doStream(params))).rejects.toThrow(
      "Guest provider request denied",
    );
    expect(calls).toBe(0);
  });

  it("does not retry provider failures, follow redirects, or expose diagnostic bodies", async () => {
    let calls = 0;
    for (const response of [
      new Response("private diagnostic", { status: 500 }),
      new Response(null, {
        status: 307,
        headers: { Location: "https://private.invalid" },
      }),
    ]) {
      const profile = createOpenAiGuestProfile({
        apiKey: "test",
        embeddingsEnabled: true,
        fetch: async (): Promise<Response> => {
          calls++;
          return response;
        },
      });
      const error = await Promise.resolve(
        profile.model.doGenerate(params),
      ).catch((failure: unknown): unknown => failure);
      expect(String(error)).toBe("Error: Guest provider unavailable");
      expect(error).not.toHaveProperty("cause");
    }
    expect(calls).toBe(2);
  });

  it("rejects a response with unverified processing-tier metadata", async () => {
    const payload: unknown = await reply().json();
    const parsed = z.record(z.string(), z.unknown()).parse(payload);
    const profile = createOpenAiGuestProfile({
      apiKey: "test",
      embeddingsEnabled: true,
      fetch: async (): Promise<Response> =>
        Response.json({ ...parsed, service_tier: "priority" }),
    });
    expect(Promise.resolve(profile.model.doGenerate(params))).rejects.toThrow(
      "Guest provider unavailable",
    );
  });

  it("requires semantic search and respects already-aborted calls", async () => {
    const input = { apiKey: "test", embeddingsEnabled: false };
    expect(() => createOpenAiGuestProfile(input)).toThrow(
      "Guest profile unavailable",
    );
    const profile = createOpenAiGuestProfile({
      apiKey: "test",
      embeddingsEnabled: true,
      fetch: async (): Promise<never> => {
        throw new Error("Unexpected network request");
      },
    });
    const signal = AbortSignal.abort();
    expect(
      Promise.resolve(
        profile.model.doGenerate({ ...params, abortSignal: signal }),
      ),
    ).rejects.toThrow();
    expect(
      profile.accounting.model({
        provider: profile.model.provider,
        modelId: profile.model.modelId,
        params: { ...params, abortSignal: signal },
      }),
    ).rejects.toThrow();
  });
});
