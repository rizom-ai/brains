import { z } from "@brains/utils/zod";
import { defineBusContract, type BusContract } from "./bus-contract";

type PublishRequestSchema = z.ZodObject<{
  entityType: z.ZodString;
  id: z.ZodString;
  userId: z.ZodString;
  permissionLevel: z.ZodEnum<{
    admin: "admin";
    trusted: "trusted";
    public: "public";
  }>;
}>;

/**
 * Publish one entry now, as a person: what the publish action of
 * `publishing_manage` does once it is confirmed, asked by a way in that has
 * its own confirmation (a command the person chose). The pipeline decides
 * whether they may and whether the entry is ready.
 */
export const publishRequestSchema: PublishRequestSchema = z.object({
  entityType: z.string().min(1),
  id: z.string().min(1),
  /** Who is publishing, as the way in authenticated them. */
  userId: z.string().min(1),
  permissionLevel: z.enum(["admin", "trusted", "public"]),
});

export type PublishRequest = z.output<typeof publishRequestSchema>;

type PublishRequestResponseSchema = z.ZodObject<{
  published: z.ZodLiteral<true>;
  url: z.ZodOptional<z.ZodString>;
}>;

export const publishRequestResponseSchema: PublishRequestResponseSchema =
  z.object({
    published: z.literal(true),
    /** Where the provider says it is published, when it says. */
    url: z.string().optional(),
  });

export type PublishRequestResponse = z.output<
  typeof publishRequestResponseSchema
>;

export const publishRequestContract: BusContract<
  PublishRequestSchema,
  PublishRequestResponseSchema,
  "request"
> = defineBusContract({
  channel: "publish:request",
  request: publishRequestSchema,
  response: publishRequestResponseSchema,
  delivery: "request",
});
