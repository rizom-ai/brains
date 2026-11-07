import { generateId, type LanguageModelMiddleware } from "ai";

/**
 * Gives a required tool choice its meaning on a runtime that ignores it: a
 * step that must call a tool has its output constrained to a call of one of
 * the step's tools, which the runtime enforces as it does any JSON schema.
 */
export const requiredToolChoice: LanguageModelMiddleware = {
  specificationVersion: "v3",
  wrapGenerate: async ({ doGenerate, params, model }) => {
    const tools = (params.tools ?? []).flatMap((tool) =>
      tool.type === "function" ? [tool] : [],
    );
    if (params.toolChoice?.type !== "required" || tools.length === 0)
      return doGenerate();

    const result = await model.doGenerate({
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
    if (result.content.some((part) => part.type === "tool-call")) return result;
    const call = parseCall(
      result.content.flatMap((part) =>
        part.type === "text" ? [part.text] : [],
      ),
      tools.map((tool) => tool.name),
    );
    if (!call) return result;
    return {
      ...result,
      content: [
        {
          type: "tool-call",
          toolCallId: generateId(),
          toolName: call.tool,
          input: JSON.stringify(call.input),
        },
      ],
      finishReason: { unified: "tool-calls", raw: "tool_calls" },
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
    // Output that is not JSON is no call: the SDK reports the step's
    // required call as missing.
    return undefined;
  }
}
