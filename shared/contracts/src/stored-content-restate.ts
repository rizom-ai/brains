import { z } from "@brains/utils/zod";
import { defineBusContract, type BusContract } from "./bus-contract";

type StoredContentRestateRequestSchema = z.ZodObject<
  Record<string, never>,
  z.core.$strict
>;

const storedContentRestateRequestSchema: StoredContentRestateRequestSchema =
  z.strictObject({});

type RestatedEntitySchema = z.ZodObject<{
  entityType: z.ZodString;
  entityId: z.ZodString;
  previousHash: z.ZodString;
  contentHash: z.ZodString;
}>;

const restatedEntitySchema: RestatedEntitySchema = z.object({
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  previousHash: z.string().min(1),
  contentHash: z.string().min(1),
});

type StoredContentRestateAnswerSchema = z.ZodObject<{
  restated: z.ZodArray<RestatedEntitySchema>;
}>;

const storedContentRestateAnswerSchema: StoredContentRestateAnswerSchema =
  z.object({ restated: z.array(restatedEntitySchema) });

export type StoredContentRestateAnswer = z.output<
  typeof storedContentRestateAnswerSchema
>;

/**
 * At boot, after the rewrite on start and before startup content settles,
 * the shell asks every plugin that lays out a body its type's codec passes
 * through (a site section's template) to restate those bodies in the form
 * it writes now (docs/external-plugin-authoring.md, The stored format). Each answers with the rows
 * it restated, which the shell announces with its own.
 */
export const storedContentRestateContract: BusContract<
  StoredContentRestateRequestSchema,
  StoredContentRestateAnswerSchema,
  "collect"
> = defineBusContract({
  channel: "stored-content:restate",
  request: storedContentRestateRequestSchema,
  response: storedContentRestateAnswerSchema,
  delivery: "collect",
});
