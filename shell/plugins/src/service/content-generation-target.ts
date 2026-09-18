import { jsonObjectSchema } from "@brains/contracts";
import {
  contentGenerationTargetSchema,
  type ContentGenerationTarget,
} from "@brains/content-service";
import type { AnyEntityDefinition } from "../entity/entity-definition-contract";
import {
  serviceContentTargetBrand,
  type ServiceContentGenerationTarget,
  type ServiceContentGenerationTargetInput,
} from "./content-generation-contract";

/**
 * Validate an author's target against its entity definition and the service's
 * generation templates, and hand back the frozen validated value. Definitions
 * never enter the value, so it is plain JSON that `generate` re-parses; the
 * brand only gives authors a nominal type to pass around.
 */
export function createServiceContentTarget<
  TDefinition extends AnyEntityDefinition,
>(
  input: ServiceContentGenerationTargetInput<TDefinition>,
  canGenerate: (template: string) => boolean,
): ServiceContentGenerationTarget {
  if (!canGenerate(input.template)) {
    throw new Error(
      `Unknown or non-generatable service template: ${input.template}`,
    );
  }
  const target: ContentGenerationTarget = contentGenerationTargetSchema.parse({
    templateName: input.template,
    context: input.context,
    destination: {
      entityType: input.destination.entity.type,
      idPath: input.destination.idPath,
      metadata: jsonObjectSchema.parse(
        input.destination.entity.metadata.parse(input.destination.metadata),
      ),
      visibility: input.destination.visibility,
    },
  });
  return Object.freeze({
    ...target,
    [serviceContentTargetBrand]: true as const,
  });
}
