import { storedSourceSchema } from "@brains/content-formatters";
import { baseEntityParserSchema } from "@brains/sdk/internal/entity-runtime";
import { z } from "@brains/utils/zod";

/**
 * Seminar status
 * - draft: held, awaiting the owner's reading
 * - published: read and published by the owner
 */
export const seminarStatusSchema: z.ZodEnum<{
  draft: "draft";
  published: "published";
}> = z.enum(["draft", "published"]);

export type SeminarStatus = z.output<typeof seminarStatusSchema>;

/** The rounds of a seminar; an opening answers the question itself. */
export const seminarRoundSchema: z.ZodEnum<{ opening: "opening" }> = z.enum([
  "opening",
]);

export type SeminarRound = z.output<typeof seminarRoundSchema>;

type SeminarTurnSchema = z.ZodObject<{
  round: typeof seminarRoundSchema;
  speaker: z.ZodString;
  name: z.ZodString;
  text: z.ZodOptional<z.ZodString>;
  sources: z.ZodOptional<z.ZodArray<typeof storedSourceSchema>>;
  failed: z.ZodOptional<z.ZodString>;
}>;

/**
 * One turn of a seminar: who spoke, in which round, and either what they
 * said, verbatim, with the sources they returned, or why they did not
 * answer. A turn with neither is no turn.
 */
export const seminarTurnSchema: SeminarTurnSchema = z
  .object({
    round: seminarRoundSchema,
    /** The peer's agent id: its domain. */
    speaker: z.string().min(1),
    /** The peer's name, as the directory holds it. */
    name: z.string().min(1),
    text: z.string().min(1).optional(),
    sources: z.array(storedSourceSchema).min(1).optional(),
    failed: z.string().min(1).optional(),
  })
  .refine((turn) => (turn.text === undefined) !== (turn.failed === undefined), {
    error: "A turn states its text or why there is none, never both",
  });

export type SeminarTurn = z.output<typeof seminarTurnSchema>;

type SeminarBodySchema = z.ZodObject<{
  turns: z.ZodArray<SeminarTurnSchema>;
}>;

/** A seminar's body: its turns, in the order they were taken. */
export const seminarBodySchema: SeminarBodySchema = z.object({
  turns: z.array(seminarTurnSchema).min(1),
});

export type SeminarBody = z.output<typeof seminarBodySchema>;

type SeminarFrontmatterSchema = z.ZodObject<{
  question: z.ZodString;
  asked: z.ZodISODate;
  status: typeof seminarStatusSchema;
  language: z.ZodString;
}>;

/**
 * A seminar's header, which is its metadata: the question, the day it was
 * asked, whether the owner has published it, and the language the peers
 * were asked to answer in.
 */
export const seminarFrontmatterSchema: SeminarFrontmatterSchema = z.object({
  question: z.string().min(1),
  asked: z.iso.date(),
  status: seminarStatusSchema,
  language: z.string().min(1),
});

export type SeminarFrontmatter = z.output<typeof seminarFrontmatterSchema>;

export const seminarMetadataSchema: SeminarFrontmatterSchema =
  seminarFrontmatterSchema;

export type SeminarMetadata = z.output<typeof seminarMetadataSchema>;

export const seminarSchema: ReturnType<
  typeof baseEntityParserSchema.extend<{
    entityType: z.ZodLiteral<"seminar">;
    metadata: SeminarFrontmatterSchema;
  }>
> = baseEntityParserSchema.extend({
  entityType: z.literal("seminar"),
  metadata: seminarMetadataSchema,
});

export type SeminarEntity = z.output<typeof seminarSchema>;
