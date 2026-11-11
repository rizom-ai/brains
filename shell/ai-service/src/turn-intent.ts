import {
  generateText,
  Output,
  type LanguageModel,
  type ModelMessage,
} from "ai";
import { z } from "@brains/utils/zod";

const turnIntentSchema: z.ZodObject<{
  asksToRead: z.ZodBoolean;
  asksToChange: z.ZodBoolean;
}> = z.object({
  asksToRead: z
    .boolean()
    .describe(
      "The message asks to read, show, check or verify stored content, such as a note or post, from storage.",
    ),
  asksToChange: z
    .boolean()
    .describe(
      "The message asks to save, create, update, delete, generate, publish, approve or otherwise change something.",
    ),
});

export type TurnIntent = z.output<typeof turnIntentSchema>;

const textOf = (message: ModelMessage | undefined): string => {
  if (!message) return "";
  if (typeof message.content === "string") return message.content;
  return message.content
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n");
};

/**
 * What the user's newest message asks of the brain, read in light of the
 * brain's reply before it: to read stored content, to change something, both
 * or neither. A bare word or name that only answers the brain's question
 * about an upload asks neither. Undefined when it cannot be read.
 */
export async function readTurnIntent(
  model: LanguageModel,
  messages: ModelMessage[],
): Promise<TurnIntent | undefined> {
  const userIndex = messages
    .map((message, index) => (message.role === "user" ? index : -1))
    .filter((index) => index >= 0)
    .at(-1);
  if (userIndex === undefined) return undefined;
  const previous = messages
    .slice(0, userIndex)
    .filter((message) => message.role === "assistant")
    .at(-1);
  try {
    const { output } = await generateText({
      model,
      output: Output.object({ schema: turnIntentSchema }),
      instructions:
        "Classify the user's newest message to an assistant that keeps notes, posts and other entities. A bare word or name that only answers the assistant's question about what to do with an upload asks neither to read nor to change.",
      prompt: [
        ...(previous ? [`Assistant: ${textOf(previous)}`] : []),
        `User: ${textOf(messages[userIndex])}`,
      ].join("\n\n"),
    });
    return output;
  } catch {
    // An intent that cannot be read restricts nothing: the turn runs as any.
    return undefined;
  }
}
