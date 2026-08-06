import { z } from "@brains/utils/zod";

export interface ProvenanceEntityReference {
  entityType: string;
  entityId: string;
  contentHash?: string | undefined;
}

export interface OperationProvenance {
  rootJobId: string;
  causationId: string;
  projectionId?: string | undefined;
  projectionLineage: string[];
  sourceEntity?: ProvenanceEntityReference | undefined;
  derivationDepth: number;
}

export const ProvenanceEntityReferenceSchema: z.ZodType<ProvenanceEntityReference> =
  z.object({
    entityType: z.string().min(1),
    entityId: z.string().min(1),
    contentHash: z.string().min(1).optional(),
  });

export const OperationProvenanceSchema: z.ZodType<OperationProvenance> = z
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
