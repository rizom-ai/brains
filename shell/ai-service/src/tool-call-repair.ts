import {
  generateObject,
  jsonSchema,
  NoSuchToolError,
  type LanguageModel,
  type ToolCallRepairFunction,
  type ToolSet,
} from "ai";
import type { ReasoningProviderOptions } from "./generation-options";

/**
 * Repairs a tool call whose arguments fail the tool's input validation: the
 * arguments are generated again with the tool's input schema constraining the
 * output, so a model that misplaces a nested field cannot repeat it. A call
 * to a tool that does not exist is not repaired.
 */
export function createToolCallRepair(
  model: LanguageModel,
  providerOptions?: ReasoningProviderOptions,
): ToolCallRepairFunction<ToolSet> {
  return async ({ toolCall, inputSchema, error, messages, system }) => {
    if (NoSuchToolError.isInstance(error)) return null;
    const schema = await inputSchema({ toolName: toolCall.toolName });
    const { object } = await generateObject({
      model,
      schema: jsonSchema(schema),
      ...(system !== undefined && { system }),
      messages: [
        ...messages,
        {
          role: "user",
          content: `Your ${toolCall.toolName} call was rejected.\n\nArguments: ${toolCall.input}\n\n${error.message}\n\nGive the arguments again with the same intent, in the tool's input shape.`,
        },
      ],
      ...(providerOptions && { providerOptions }),
    });
    return { ...toolCall, input: JSON.stringify(object) };
  };
}
