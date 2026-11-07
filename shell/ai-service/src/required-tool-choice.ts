import { generateId, type LanguageModelMiddleware } from "ai";

type GenerateResult = Awaited<
  ReturnType<NonNullable<LanguageModelMiddleware["wrapGenerate"]>>
>;
type Usage = GenerateResult["usage"];

/**
 * Gives a required tool choice its meaning on a runtime that ignores it:
 * when a step that must call a tool comes back without a call, the model is
 * asked again with its output constrained to a call of one of the step's
 * tools, which the runtime enforces.
 */
export const requiredToolChoice: LanguageModelMiddleware = {
  specificationVersion: "v3",
  wrapGenerate: async ({ doGenerate, params, model }) => {
    const result = await doGenerate();
    const tools = (params.tools ?? []).flatMap((tool) =>
      tool.type === "function" ? [tool] : [],
    );
    if (
      params.toolChoice?.type !== "required" ||
      tools.length === 0 ||
      result.content.some((part) => part.type === "tool-call")
    )
      return result;

    const constrained = await model.doGenerate({
      ...params,
      responseFormat: {
        type: "json",
        name: "tool_call",
        schema: {
          anyOf: tools.map((tool) => ({
            type: "object",
            properties: {
              tool: { const: tool.name },
              input: tool.inputSchema,
            },
            required: ["tool", "input"],
            additionalProperties: false,
          })),
        },
      },
    });
    const call = parseCall(
      constrained.content.flatMap((part) =>
        part.type === "text" ? [part.text] : [],
      ),
      tools.map((tool) => tool.name),
    );
    if (!call) return result;
    return {
      ...constrained,
      content: [
        {
          type: "tool-call",
          toolCallId: generateId(),
          toolName: call.tool,
          input: JSON.stringify(call.input),
        },
      ],
      finishReason: { unified: "tool-calls", raw: "tool_calls" },
      usage: addUsage(result.usage, constrained.usage),
    };
  },
};

function parseCall(
  text: string[],
  toolNames: string[],
): { tool: string; input: unknown } | undefined {
  try {
    const parsed: unknown = JSON.parse(text.join(""));
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "tool" in parsed &&
      "input" in parsed &&
      typeof parsed.tool === "string" &&
      toolNames.includes(parsed.tool)
    )
      return { tool: parsed.tool, input: parsed.input };
    return undefined;
  } catch {
    // Output that is not JSON is no call: the step keeps its first result.
    return undefined;
  }
}

const sum = (a?: number, b?: number): number | undefined =>
  a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0);

function addUsage(a: Usage, b: Usage): Usage {
  return {
    inputTokens: {
      total: sum(a.inputTokens.total, b.inputTokens.total),
      noCache: sum(a.inputTokens.noCache, b.inputTokens.noCache),
      cacheRead: sum(a.inputTokens.cacheRead, b.inputTokens.cacheRead),
      cacheWrite: sum(a.inputTokens.cacheWrite, b.inputTokens.cacheWrite),
    },
    outputTokens: {
      total: sum(a.outputTokens.total, b.outputTokens.total),
      text: sum(a.outputTokens.text, b.outputTokens.text),
      reasoning: sum(a.outputTokens.reasoning, b.outputTokens.reasoning),
    },
  };
}
