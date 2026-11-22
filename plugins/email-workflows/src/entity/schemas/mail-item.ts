import { baseEntityParserSchema } from "@brains/sdk/internal/entity-runtime";
import { z } from "@brains/utils/zod";

// Legacy: also reads the header form written before 0.2.0-alpha.760; removed with stored-form-old-headers (docs/legacy-code-inventory.json).

const mailCategories = [
  "opportunity",
  "recruiting",
  "work",
  "administrative",
  "personal",
] as const;

export const mailCategorySchema: z.ZodEnum<{
  opportunity: "opportunity";
  recruiting: "recruiting";
  work: "work";
  administrative: "administrative";
  personal: "personal";
}> = z.enum(mailCategories);

const mailPriorities = ["high", "normal", "low"] as const;

export const mailPrioritySchema: z.ZodEnum<{
  high: "high";
  normal: "normal";
  low: "low";
}> = z.enum(mailPriorities);

const mailStatuses = ["new", "reviewed", "handled", "archived"] as const;

export const mailStatusSchema: z.ZodEnum<{
  new: "new";
  reviewed: "reviewed";
  handled: "handled";
  archived: "archived";
}> = z.enum(mailStatuses);

export const mailThreadKeySchema: z.ZodString = z
  .string()
  .regex(/^[a-f0-9]{64}$/);

export const mailThreadOrdinalSchema: z.ZodNumber = z
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER);

type MailItemSourceSchema = z.ZodObject<
  {
    ref: z.ZodString;
    threadKey: z.ZodOptional<typeof mailThreadKeySchema>;
    threadOrdinal: z.ZodOptional<typeof mailThreadOrdinalSchema>;
    personId: z.ZodOptional<z.ZodString>;
  },
  z.core.$strict
>;

export const mailItemSourceSchema: MailItemSourceSchema = z
  .strictObject({
    ref: z.string().min(1).max(1_024),
    threadKey: mailThreadKeySchema.optional(),
    threadOrdinal: mailThreadOrdinalSchema.optional(),
    personId: z.string().min(1).max(200).optional(),
  })
  .refine(
    (source) =>
      source.threadOrdinal === undefined || source.threadKey !== undefined,
    {
      path: ["threadOrdinal"],
      message: "A thread ordinal requires a thread key",
    },
  );

export const mailSenderLabelSchema: z.ZodString = z
  .string()
  .trim()
  .min(1)
  .max(300)
  .refine((value) => !value.includes("@"), {
    message: "Sender labels must not contain an email address",
  });

type MailItemFrontmatterSchema = z.ZodObject<{
  title: z.ZodString;
  category: z.ZodDefault<z.ZodNullable<typeof mailCategorySchema>>;
  priority: typeof mailPrioritySchema;
  status: typeof mailStatusSchema;
  needsReply: z.ZodBoolean;
  receivedAt: z.ZodISODateTime;
  source: typeof mailItemSourceSchema;
  senderLabel: z.ZodOptional<typeof mailSenderLabelSchema>;
  organization: z.ZodOptional<z.ZodString>;
  requestedActions: z.ZodArray<z.ZodString>;
}>;

export const mailItemFrontmatterSchema: MailItemFrontmatterSchema =
  z.strictObject({
    title: z.string().min(1).max(160),
    category: mailCategorySchema.nullable().default(null),
    priority: mailPrioritySchema,
    status: mailStatusSchema,
    needsReply: z.boolean(),
    receivedAt: z.iso.datetime().meta({ studioWidget: "provenance" }),
    source: mailItemSourceSchema.meta({ studioWidget: "provenance" }),
    senderLabel: mailSenderLabelSchema
      .optional()
      .meta({ studioWidget: "provenance" }),
    organization: z.string().min(1).max(200).optional(),
    requestedActions: z.array(z.string().min(1).max(240)).max(10),
  });

/**
 * The next form's flat source keys (docs/external-plugin-authoring.md, The stored format), each
 * with the key it holds under the nested source, in the source's order.
 */
const flatSourceKeys = {
  sourceRef: "ref",
  threadKey: "threadKey",
  threadOrdinal: "threadOrdinal",
  personId: "personId",
} as const;

/** The next form's header: the source as flat keys Obsidian shows. */
export const mailItemNextHeaderSchema: z.ZodObject = mailItemFrontmatterSchema
  .omit({ source: true })
  .extend({
    sourceRef: mailItemSourceSchema.shape.ref.meta({
      studioWidget: "provenance",
    }),
    threadKey: mailThreadKeySchema
      .optional()
      .meta({ studioWidget: "provenance" }),
    threadOrdinal: mailThreadOrdinalSchema
      .optional()
      .meta({ studioWidget: "provenance" }),
    personId: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .meta({ studioWidget: "provenance" }),
  });

/**
 * A stored header in either form with its source nested, as the readers
 * read it: a file in the next form has its flat source keys gathered under
 * `source`, and any other key is left for the schema to judge.
 */
export function withNestedSource(
  header: Record<string, unknown>,
): Record<string, unknown> {
  if (!Object.hasOwn(header, "sourceRef")) return header;
  const flat = new Map<string, string>(Object.entries(flatSourceKeys));
  const entries = Object.entries(header);
  const source = Object.fromEntries(
    entries.flatMap(([key, value]) => {
      const nested = flat.get(key);
      return nested === undefined ? [] : [[nested, value]];
    }),
  );
  // The source takes the place of its first flat key.
  const first = entries.findIndex(([key]) => flat.has(key));
  return Object.fromEntries(
    entries.flatMap(([key, value], index): [string, unknown][] =>
      index === first
        ? [["source", source]]
        : flat.has(key)
          ? []
          : [[key, value]],
    ),
  );
}

/** A header in the next form: its source as flat keys, in the source's place. */
export function mailItemNextHeader(
  frontmatter: Partial<MailItemFrontmatter>,
): Record<string, unknown> {
  const { source } = frontmatter;
  return Object.fromEntries(
    Object.entries(frontmatter).flatMap(([key, value]): [string, unknown][] =>
      key === "source" && source
        ? Object.entries(flatSourceKeys).flatMap(([flatKey, nested]) => {
            const held = source[nested];
            return held === undefined ? [] : [[flatKey, held]];
          })
        : [[key, value]],
    ),
  );
}

type MailItemMetadataSchema = z.ZodObject<
  Pick<
    MailItemFrontmatterSchema["shape"],
    "title" | "category" | "priority" | "status" | "needsReply" | "receivedAt"
  > & {
    threadKey: z.ZodOptional<typeof mailThreadKeySchema>;
    threadOrdinal: z.ZodOptional<typeof mailThreadOrdinalSchema>;
  }
>;

export const mailItemMetadataSchema: MailItemMetadataSchema =
  mailItemFrontmatterSchema
    .pick({
      title: true,
      category: true,
      priority: true,
      status: true,
      needsReply: true,
      receivedAt: true,
    })
    .extend({
      threadKey: mailThreadKeySchema.optional(),
      threadOrdinal: mailThreadOrdinalSchema.optional(),
    });

export const mailItemSchema: ReturnType<
  typeof baseEntityParserSchema.extend<{
    entityType: z.ZodLiteral<"mail-item">;
    metadata: MailItemMetadataSchema;
  }>
> = baseEntityParserSchema.extend({
  entityType: z.literal("mail-item"),
  metadata: mailItemMetadataSchema,
});

export type MailCategory = z.output<typeof mailCategorySchema>;
export type MailPriority = z.output<typeof mailPrioritySchema>;
export type MailStatus = z.output<typeof mailStatusSchema>;
export type MailItemSource = z.output<typeof mailItemSourceSchema>;
export type MailItemFrontmatter = z.output<typeof mailItemFrontmatterSchema>;
export type MailItemMetadata = z.output<typeof mailItemMetadataSchema>;
export type MailItemEntity = z.output<typeof mailItemSchema>;
