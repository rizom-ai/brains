import type { FileUIPart } from "ai";

export type PromptInputFile = FileUIPart & { id: string };

export function preparePromptSubmitFiles(
  files: readonly PromptInputFile[],
): FileUIPart[] {
  return files.map(({ id: _id, ...file }) => file);
}
