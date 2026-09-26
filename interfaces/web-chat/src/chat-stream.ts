import type { ResponseRenderDirective } from "@brains/sdk/interfaces";
import { stripInternalEntityMemoryNote } from "./display-content";
import {
  writeDirectiveCards,
  writeDirectiveToolResults,
  writeTextPart,
  type StreamWriter,
} from "./stream-writer";

/**
 * The stream a turn is being written to, while it is open.
 *
 * A browser turn is one HTTP request that stays open, so everything the
 * runtime has to say about it — the answer, job progress, tool activity —
 * arrives while the route is still holding the writer. The route registers
 * it under the conversation id before handing the turn on, and the slots the
 * runtime calls find it here.
 */
export interface ActiveStream {
  writer: StreamWriter;
}

/**
 * An answer, as frames.
 *
 * The runtime decided what this turn is made of and in what order; what a
 * stream adds is that each piece is its own frame with its own id, so the
 * client can render text as it lands and replace a tool row when the tool
 * finishes. Text is written here rather than by the card writer because it is
 * the one piece that needs display stripping.
 */
export function writeAnswer(
  writer: StreamWriter,
  directives: readonly ResponseRenderDirective[],
  createId: (prefix: string) => string,
): void {
  for (const directive of directives) {
    if (directive.kind !== "text") continue;
    writeText(writer, directive.text, "text", createId);
  }
  writeDirectiveToolResults(writer, directives, createId);
  writeDirectiveCards(writer, directives);
}

export function writeText(
  writer: StreamWriter,
  text: string,
  prefix: string,
  createId: (prefix: string) => string,
): string {
  const id = createId(prefix);
  writeTextPart(writer, id, stripInternalEntityMemoryNote(text));
  return id;
}
