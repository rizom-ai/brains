import {
  generateText,
  jsonSchema,
  NoSuchToolError,
  Output,
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
  return async ({ toolCall, inputSchema, error, messages, instructions }) => {
    if (NoSuchToolError.isInstance(error)) return null;
    const schema = await inputSchema({ toolName: toolCall.toolName });
    const { output } = await generateText({
      model,
      output: Output.object({ schema: jsonSchema(schema) }),
      ...(instructions !== undefined && { instructions }),
      messages: [
        ...messages,
        {
          role: "user",
          content: `Your ${toolCall.toolName} call was rejected.\n\nArguments: ${toolCall.input}\n\n${error.message}\n\nGive the arguments again with the same intent, in the tool's input shape.`,
        },
      ],
      ...(providerOptions && { providerOptions }),
    });
    return { ...toolCall, input: JSON.stringify(output) };
  };
}
