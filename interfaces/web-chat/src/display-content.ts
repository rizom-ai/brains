const entityMemoryNotePattern =
  /\n{0,2}\[Entities affected this turn: [\s\S]*? Reference these IDs directly in follow-ups instead of searching for them\.\]\s*$/;

/**
 * Remove internal assistant memory notes from text that is about to be shown in
 * web chat. The notes stay in stored conversation history for agent recall, but
 * should never hydrate into visible browser messages.
 */
export function stripInternalEntityMemoryNote(content: string): string {
  return content.replace(entityMemoryNotePattern, "").trimEnd();
}
