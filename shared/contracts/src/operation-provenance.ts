import { z } from "@brains/utils/zod";

type ProvenanceEntityReferenceSchema = z.ZodObject<{
  entityType: z.ZodString;
  entityId: z.ZodString;
  contentHash: z.ZodOptional<z.ZodString>;
}>;

export const ProvenanceEntityReferenceSchema: ProvenanceEntityReferenceSchema =
  z.object({
    entityType: z.string().min(1),
    entityId: z.string().min(1),
    contentHash: z.string().min(1).optional(),
  });

export type ProvenanceEntityReference = z.output<
  typeof ProvenanceEntityReferenceSchema
>;

type OperationProvenanceSchema = z.ZodObject<{
  rootJobId: z.ZodString;
  causationId: z.ZodString;
  projectionId: z.ZodOptional<z.ZodString>;
  projectionLineage: z.ZodArray<z.ZodString>;
  sourceEntity: z.ZodOptional<ProvenanceEntityReferenceSchema>;
  derivationDepth: z.ZodNumber;
}>;

export const OperationProvenanceSchema: OperationProvenanceSchema = z
  .object({
    rootJobId: z.string().min(1),
    causationId: z.string().min(1),
    projectionId: z.string().min(1).optional(),
    projectionLineage: z.array(z.string().min(1)),
    sourceEntity: ProvenanceEntityReferenceSchema.optional(),
    derivationDepth: z.number().int().nonnegative(),
  })
  .superRefine((provenance, context) => {
    if (provenance.derivationDepth !== provenance.projectionLineage.length) {
      context.addIssue({
        code: "custom",
        path: ["derivationDepth"],
        message: "Derivation depth must equal projection lineage length",
      });
    }

    const currentProjection = provenance.projectionLineage.at(-1);
    if (provenance.projectionId !== currentProjection) {
      context.addIssue({
        code: "custom",
        path: ["projectionId"],
        message:
          "Current projection must equal the final projection lineage entry",
      });
    }
  });

export type OperationProvenance = z.output<typeof OperationProvenanceSchema>;
