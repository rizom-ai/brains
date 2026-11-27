import type { LanguageModelCallStartEvent, ModelMessage } from "ai";
import { countTokens } from "gpt-tokenizer/encoding/o200k_base";
import { isRecord } from "@brains/utils/is-record";

/**
 * Token counts every model is measured by: one tokenizer (`o200k_base`)
 * over the text a model call carries, so a budget judges what the brain
 * sends and gets back rather than how a model's own tokenizer cuts it.
 *
 * Reasoning, images and files count nothing: a provider may return no
 * reasoning text at all, and each model counts an image its own way.
 */
type CallInput = Pick<
  LanguageModelCallStartEvent,
  "instructions" | "messages" | "tools"
>;

const tokensOf = (text: string): number =>
  text.length > 0 ? countTokens(text) : 0;

/** Tool arguments as the model wrote them: a string once, else as JSON. */
const jsonText = (value: unknown): string =>
  typeof value === "string"
    ? value
    : value === undefined
      ? ""
      : JSON.stringify(value);

/** The text a tool result hands back to the model. */
function toolOutputTokens(output: unknown): number {
  if (!isRecord(output)) return 0;
  switch (output["type"]) {
    case "text":
    case "error-text":
      return tokensOf(String(output["value"] ?? ""));
    case "json":
    case "error-json":
      return tokensOf(jsonText(output["value"]));
    case "content":
      return Array.isArray(output["value"])
        ? output["value"].reduce<number>(
            (sum, item) =>
              sum +
              (isRecord(item) && item["type"] === "text"
                ? tokensOf(String(item["text"] ?? ""))
                : 0),
            0,
          )
        : 0;
    default:
      return 0;
  }
}

/** One content part: its text, tool call or tool result; nothing else. */
function partTokens(part: unknown): number {
  if (!isRecord(part)) return 0;
  switch (part["type"]) {
    case "text":
      return tokensOf(String(part["text"] ?? ""));
    case "tool-call":
      return (
        tokensOf(String(part["toolName"] ?? "")) +
        tokensOf(jsonText(part["input"]))
      );
    case "tool-result":
      return (
        tokensOf(String(part["toolName"] ?? "")) +
        toolOutputTokens(part["output"])
      );
    default:
      return 0;
  }
}

const partsTokens = (parts: readonly unknown[]): number =>
  parts.reduce<number>((sum, part) => sum + partTokens(part), 0);

function messageTokens(message: ModelMessage): number {
  return typeof message.content === "string"
    ? tokensOf(message.content)
    : partsTokens(message.content);
}

function instructionsTokens(instructions: CallInput["instructions"]): number {
  if (instructions === undefined) return 0;
  if (typeof instructions === "string") return tokensOf(instructions);
  const messages = Array.isArray(instructions) ? instructions : [instructions];
  return messages.reduce((sum, message) => sum + messageTokens(message), 0);
}

/** A tool definition: its name, description and input schema. */
function toolTokens(tool: Record<string, unknown>): number {
  return (
    tokensOf(String(tool["name"] ?? "")) +
    tokensOf(String(tool["description"] ?? "")) +
    (tool["inputSchema"] === undefined
      ? 0
      : tokensOf(jsonText(tool["inputSchema"])))
  );
}

/** What a model call sends: its instructions, messages and tools. */
export function callInputTokens(call: CallInput): number {
  return (
    instructionsTokens(call.instructions) +
    call.messages.reduce((sum, message) => sum + messageTokens(message), 0) +
    (call.tools ?? []).reduce((sum, tool) => sum + toolTokens(tool), 0)
  );
}

/** What a model call returns: its text and tool calls. */
export function callOutputTokens(content: readonly unknown[]): number {
  return partsTokens(content);
}
