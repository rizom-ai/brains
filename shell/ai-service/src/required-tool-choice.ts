import { generateId, type JSONSchema7, type LanguageModelMiddleware } from "ai";
import { isPlainRecord } from "@brains/utils/predicates";
import { z } from "@brains/utils/zod";

/** A JSON Schema is any object: its keywords are checked by the runtime. */
const jsonSchemaObject = z.custom<JSONSchema7>(isPlainRecord);

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

    // A tool's schema refers to its own definitions from its own root: in
    // the call's schema they move to its root, named for the tool.
    const definitions: Record<string, JSONSchema7> = {};
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
              input: withDefinitionsAt(
                tool.inputSchema,
                tool.name,
                definitions,
              ),
            },
            required: ["tool", "input"],
            additionalProperties: false,
          })),
          ...(Object.keys(definitions).length > 0 && { definitions }),
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

/**
 * A tool's input schema without its definitions, which join `definitions`
 * named `<tool>__<name>`, its references rewritten to match.
 */
function withDefinitionsAt(
  schema: unknown,
  toolName: string,
  definitions: Record<string, JSONSchema7>,
): JSONSchema7 {
  const rename = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(rename);
    if (!isPlainRecord(node)) return node;
    return Object.fromEntries(
      Object.entries(node).map(([key, value]) => [
        key,
        key === "$ref" && typeof value === "string"
          ? value.replace(
              /^#\/(?:definitions|\$defs)\//,
              `#/definitions/${toolName}__`,
            )
          : rename(value),
      ]),
    );
  };
  if (!isPlainRecord(schema)) return {};
  const { definitions: own, $defs, ...rest } = schema;
  for (const group of [own, $defs])
    if (isPlainRecord(group))
      for (const [name, definition] of Object.entries(group))
        definitions[`${toolName}__${name}`] = jsonSchemaObject.parse(
          rename(definition),
        );
  return jsonSchemaObject.parse(rename(rest));
}

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
