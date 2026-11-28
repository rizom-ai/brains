import { z } from "@brains/utils/zod";

/*
 * Home, the page Studio opens on: what needs the person, what they were in
 * the middle of, and what went out. The host composes it from the
 * workspaces' attention, the entries and the brain's own state.
 */

type LinkSchema = z.ZodObject<
  { label: z.ZodString; href: z.ZodString },
  z.core.$strict
>;

const linkSchema: LinkSchema = z.strictObject({
  label: z.string().min(1).max(60),
  /** A Studio path the browser opens in place. */
  href: z.string().min(1).max(1000),
});

type AttentionSchema = z.ZodObject<
  {
    id: z.ZodString;
    title: z.ZodString;
    detail: z.ZodOptional<z.ZodString>;
    severity: z.ZodEnum<{ error: "error"; warn: "warn"; info: "info" }>;
    source: z.ZodString;
    action: z.ZodOptional<LinkSchema>;
  },
  z.core.$strict
>;

const attentionSchema: AttentionSchema = z.strictObject({
  id: z.string().min(1).max(300),
  title: z.string().min(1).max(200),
  detail: z.string().max(500).optional(),
  severity: z.enum(["error", "warn", "info"]),
  /** Where it comes from, such as "Inbox" or "Jobs". */
  source: z.string().min(1).max(100),
  /** The verb that clears it. */
  action: linkSchema.optional(),
});

type EntryFields<TDate extends string> = {
  [
    K in "id" | "entityType" | "typeLabel" | "title" | "href" | TDate
  ]: K extends TDate ? z.ZodISODateTime : z.ZodString;
};

type DraftSchema = z.ZodObject<EntryFields<"updated">, z.core.$strict>;
type PublishedSchema = z.ZodObject<EntryFields<"publishedAt">, z.core.$strict>;

const entry = {
  id: z.string().min(1),
  entityType: z.string().min(1),
  /** What one entry of its type is called, such as "Post". */
  typeLabel: z.string().min(1),
  title: z.string().min(1),
  href: z.string().min(1),
};

const draftSchema: DraftSchema = z.strictObject({
  ...entry,
  updated: z.iso.datetime(),
});
const publishedSchema: PublishedSchema = z.strictObject({
  ...entry,
  publishedAt: z.iso.datetime(),
});

type HomeSchema = z.ZodObject<
  {
    now: z.ZodISODateTime;
    needsYou: z.ZodArray<AttentionSchema>;
    drafts: z.ZodArray<DraftSchema>;
    published: z.ZodArray<PublishedSchema>;
    status: z.ZodObject<
      {
        tone: z.ZodEnum<{ good: "good"; warn: "warn"; error: "error" }>;
        text: z.ZodString;
        history: LinkSchema;
      },
      z.core.$strict
    >;
  },
  z.core.$strict
>;

const homeSchema: HomeSchema = z.strictObject({
  /** When Home was composed, as an ISO timestamp; the page dates itself by it. */
  now: z.iso.datetime(),
  needsYou: z.array(attentionSchema).max(50),
  /** Drafts most recently edited first. */
  drafts: z.array(draftSchema).max(10),
  /** What went out, most recent first. */
  published: z.array(publishedSchema).max(10),
  /** The brain's health in one line, with History one click away. */
  status: z.strictObject({
    tone: z.enum(["good", "warn", "error"]),
    text: z.string().min(1).max(200),
    history: linkSchema,
  }),
});

export type StudioHome = z.output<HomeSchema>;
export type StudioHomeAttention = z.output<AttentionSchema>;

/** Home as the browser reads it; anything else is refused. */
export function parseStudioHome(value: unknown): StudioHome {
  return homeSchema.parse(value);
}
