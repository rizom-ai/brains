import { z } from "@brains/utils/zod";

/**
 * Another plugin asks the note plugin to keep a piece of text as a note, for
 * example a visitor question the owner chose to save. The note is always
 * private to the owner; the sender cannot choose its visibility.
 */
export const NOTE_CAPTURE_MESSAGE = "note:capture" as const;

export const noteCaptureRequestSchema: z.ZodObject<
  { id: z.ZodString; title: z.ZodString; body: z.ZodString },
  z.core.$strict
> = z.strictObject({
  /** Deterministic, so saving the same text twice keeps one note. */
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20_000),
});
export type NoteCaptureRequest = z.output<typeof noteCaptureRequestSchema>;

export const noteCaptureResponseSchema: z.ZodObject<
  { noteId: z.ZodString; created: z.ZodBoolean },
  z.core.$strict
> = z.strictObject({
  noteId: z.string(),
  /** False when a note with this id already existed and was left unchanged. */
  created: z.boolean(),
});
export type NoteCaptureResponse = z.output<typeof noteCaptureResponseSchema>;
