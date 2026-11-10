import { baseEntityParserSchema } from "@brains/plugins";
import {
  generateMarkdown,
  parseMarkdown,
} from "@brains/utils/markdown-frontmatter";
import { z } from "@brains/utils/zod";
import type { FormNotificationState, FormTarget } from "../src";

/** A target for engine tests: answers as frontmatter, the alert optional. */
export const noteSchema: ReturnType<
  typeof baseEntityParserSchema.extend<{
    entityType: z.ZodLiteral<"note-request">;
  }>
> = baseEntityParserSchema.extend({
  entityType: z.literal("note-request"),
});
export type NoteRequest = z.output<typeof noteSchema>;

function read(entity: NoteRequest): Record<string, unknown> {
  return parseMarkdown(entity.content).frontmatter;
}

export const noteTarget: FormTarget<NoteRequest> = {
  entityType: "note-request",
  schema: noteSchema,
  refuse: () => undefined,
  record: ({ answers, receivedAt, notify }) => {
    const fields = {
      ...answers,
      receivedAt,
      status: "new",
      notification: notify ? "pending" : "none",
    };
    return { content: generateMarkdown(fields, ""), metadata: {} };
  },
  matches: (entity, { answers, receivedAt }) => {
    const fields = read(entity);
    return (
      fields["receivedAt"] === receivedAt &&
      Object.entries(answers).every(
        ([id, value]) => JSON.stringify(fields[id]) === JSON.stringify(value),
      )
    );
  },
  notification: (entity): FormNotificationState => {
    const value = read(entity)["notification"];
    return value === "sent" || value === "failed" || value === "none"
      ? value
      : "pending";
  },
  withNotification: (entity, notification) => ({
    content: generateMarkdown({ ...read(entity), notification }, ""),
    metadata: {},
  }),
  handled: (entity) => read(entity)["status"] === "handled",
  alert: (entity) => ({
    answers: [{ label: "Name", value: String(read(entity)["name"]) }],
  }),
};
