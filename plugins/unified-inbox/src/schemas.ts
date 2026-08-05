import {
  inboxItemSchema,
  inboxSourceMetadataSchema,
  type InboxItem,
  type InboxSourceMetadata,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";

interface InboxProjectionEntryValue {
  source: InboxSourceMetadata;
  item: InboxItem;
}

export const inboxProjectionEntrySchema: z.ZodType<
  InboxProjectionEntryValue,
  InboxProjectionEntryValue
> = z.strictObject({
  source: inboxSourceMetadataSchema,
  item: inboxItemSchema,
});

interface InboxSourceErrorValue {
  source: InboxSourceMetadata;
  error: "Source unavailable";
}

export const inboxSourceErrorSchema: z.ZodType<
  InboxSourceErrorValue,
  InboxSourceErrorValue
> = z.strictObject({
  source: inboxSourceMetadataSchema,
  error: z.literal("Source unavailable"),
});

interface InboxProjectionValue {
  entries: InboxProjectionEntryValue[];
  errors: InboxSourceErrorValue[];
}

export const inboxProjectionSchema: z.ZodType<
  InboxProjectionValue,
  InboxProjectionValue
> = z.strictObject({
  entries: z.array(inboxProjectionEntrySchema).max(10_000),
  errors: z.array(inboxSourceErrorSchema).max(1_000),
});

export type InboxProjectionEntry = z.output<typeof inboxProjectionEntrySchema>;
export type InboxSourceError = z.output<typeof inboxSourceErrorSchema>;
export type InboxProjection = z.output<typeof inboxProjectionSchema>;
