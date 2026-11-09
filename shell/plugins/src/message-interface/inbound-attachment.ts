import { z } from "@brains/utils/zod";

type AttachmentRead = () => Promise<Uint8Array>;

type LinkedAttachmentSchema = z.ZodObject<{
  name: z.ZodString;
  mediaType: z.ZodString;
  url: z.ZodURL;
  read: z.ZodOptional<z.ZodUndefined>;
}>;

type ReadableAttachmentSchema = z.ZodObject<{
  name: z.ZodString;
  mediaType: z.ZodString;
  read: z.ZodCustom<AttachmentRead, AttachmentRead>;
  url: z.ZodOptional<z.ZodUndefined>;
}>;

/**
 * A file that arrived with an inbound message, in one of two forms: a link
 * the runtime fetches, for a platform whose media is public, or a `read` the
 * interface answers itself, for one whose media needs its credentials. Never
 * both: each form names the other's field as absent.
 */
export const inboundMessageAttachmentSchema: z.ZodUnion<
  readonly [LinkedAttachmentSchema, ReadableAttachmentSchema]
> = z.union([
  z.object({
    name: z.string().min(1),
    mediaType: z.string(),
    url: z.url(),
    read: z.undefined().optional(),
  }),
  z.object({
    name: z.string().min(1),
    mediaType: z.string(),
    read: z.custom<AttachmentRead>(
      (value) => typeof value === "function",
      "read must be a function",
    ),
    url: z.undefined().optional(),
  }),
]);

export type InboundMessageAttachment = z.input<
  typeof inboundMessageAttachmentSchema
>;

/** What a `read` must answer with. */
export const inboundAttachmentBytesSchema: z.ZodCustom<Uint8Array, Uint8Array> =
  z.instanceof(Uint8Array);
