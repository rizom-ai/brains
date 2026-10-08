import { afterEach, expect, it, spyOn } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { createMockMessageBus } from "@brains/messaging-service/test";
import { guestInterfaceType } from "@brains/contracts/chat";
import { z } from "@brains/utils/zod";
import { AIService } from "../src/aiService";
import { createBrainAgentFactory } from "../src/brain-agent";
import { testGuestExecution } from "./fixtures/guest-execution";

const inputSchema = z.array(
  z
    .object({
      role: z.string().optional(),
      type: z.enum(["function_call", "function_call_output"]).optional(),
    })
    .passthrough()
    .refine((part) => part.role !== undefined || part.type !== undefined),
);
const requestSchema = z.discriminatedUnion("model", [
  z.object({
    model: z.literal("gpt-6-luna"),
    reasoning: z.object({ effort: z.literal("low") }),
    temperature: z.never().optional(),
    input: inputSchema,
  }),
  z.object({
    model: z.literal("gpt-4o-mini"),
    reasoning: z.never().optional(),
    temperature: z.literal(0.7),
    input: inputSchema,
  }),
]);

const fetchSpy = spyOn(globalThis, "fetch");
afterEach(() => fetchSpy.mockReset());

function captureRequests(text: string): Array<z.output<typeof requestSchema>> {
  const requests: Array<z.output<typeof requestSchema>> = [];
  const fetchRequest = async (
    _input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ): Promise<Response> => {
    if (typeof init?.body !== "string")
      throw new Error("Expected JSON request");
    const request = requestSchema.parse(JSON.parse(init.body));
    requests.push(request);
    return Response.json({
      id: "resp_test",
      object: "response",
      created_at: 0,
      model: request.model,
      status: "completed",
      output: [
        {
          type: "message",
          id: "msg_test",
          role: "assistant",
          content: [{ type: "output_text", text, annotations: [] }],
        },
      ],
      usage: {
        input_tokens: 10,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens: 5,
        output_tokens_details: { reasoning_tokens: 2 },
      },
    });
  };
  fetchSpy.mockImplementation(
    Object.assign(fetchRequest, {
      preconnect: (): never => {
        throw new Error("Unexpected fetch preconnect");
      },
    }),
  );
  return requests;
}

for (const model of ["gpt-6-luna", "openai:gpt-6-luna"]) {
  it(`sends low reasoning without temperature for text generation (${model})`, async () => {
    const requests = captureRequests("Answer");
    const service = AIService.createFresh(
      { apiKey: "test-key", model, reasoningEffort: "low", temperature: 0.7 },
      createSilentLogger(),
    );
    expect((await service.generateText("System", "Question")).text).toBe(
      "Answer",
    );
    expect(requests).toHaveLength(1);
    expect(requests[0]?.input[0]?.role).toBe("developer");
  });
}

it("does not force a non-reasoning model when effort is inherited", async () => {
  const requests = captureRequests("Answer");
  const warnings = spyOn(console, "warn").mockImplementation(() => undefined);
  try {
    const service = AIService.createFresh(
      { apiKey: "test-key", model: "gpt-4o-mini", reasoningEffort: "low" },
      createSilentLogger(),
    );
    expect((await service.generateText("System", "Question")).text).toBe(
      "Answer",
    );
    expect(requests).toHaveLength(1);
    expect(requests[0]?.input[0]?.role).toBe("system");
    expect(warnings).toHaveBeenCalled();
  } finally {
    warnings.mockRestore();
  }
});

it("sends low reasoning without temperature for structured generation", async () => {
  const requests = captureRequests('{"answer":"Answer"}');
  const service = AIService.createFresh(
    { apiKey: "test-key", model: "gpt-6-luna", reasoningEffort: "low" },
    createSilentLogger(),
  );
  expect(
    (
      await service.generateObject(
        "System",
        "Question",
        z.object({ answer: z.string() }),
      )
    ).object,
  ).toEqual({ answer: "Answer" });
  expect(requests).toHaveLength(1);
  expect(requests[0]?.input[0]?.role).toBe("developer");
});

for (const guest of [false, true]) {
  for (const model of ["gpt-6-luna", "gpt-4o-mini"]) {
    it(`uses reasoning capabilities on the real agent wire (${model}, guest=${guest})`, async () => {
      const requests = captureRequests("Answer");
      const warnings =
        model === "gpt-4o-mini"
          ? spyOn(console, "warn").mockImplementation(() => undefined)
          : undefined;
      try {
        const service = AIService.createFresh(
          { apiKey: "test-key", model },
          createSilentLogger(),
        );
        const agent = createBrainAgentFactory({
          model: service.getModel(),
          modelId: model,
          reasoningEffort: "low",
          temperature: 0.7,
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
        });
        const result = await agent.generate({
          messages: [{ role: "user", content: "Question" }],
          options: {
            interfaceType: guest ? guestInterfaceType : "evaluation",
            userPermissionLevel: "public",
            isAnchor: false,
            conversationId: "test",
            ...(guest ? { guestExecution: testGuestExecution } : {}),
          },
        });
        expect(result.text).toBe("Answer");
        expect(requests).toHaveLength(1);
        expect(requests[0]?.input[0]?.role).toBe(
          model === "gpt-6-luna" ? "developer" : "system",
        );
      } finally {
        warnings?.mockRestore();
      }
    });
  }
}
