import {
  defineEntityPackage,
  type EntityPackageDefinition,
} from "@brains/sdk/entities";
import { z } from "@brains/utils/zod";
import { derivedSwot, swot } from "./swot-entity";

export const assessmentConfigSchema: z.ZodObject<
  { enableSwotDerivation: z.ZodDefault<z.ZodBoolean> },
  z.core.$strict
> = z
  .object({
    enableSwotDerivation: z
      .boolean()
      .default(true)
      .describe(
        "Derive SWOT assessments from agent and skill evidence using AI",
      ),
  })
  .strict();

export type AssessmentConfig = z.output<typeof assessmentConfigSchema>;
export type AssessmentConfigInput = z.input<typeof assessmentConfigSchema>;

/**
 * The SWOT, derived from the brain's agents and skills. A brain installs it
 * under the id its class had, swot; with derivation off it installs
 * `swotPackage`, the same type without the rule.
 */
export const derivedSwotPackage: EntityPackageDefinition<
  readonly [typeof derivedSwot]
> = defineEntityPackage({ id: "swot", entities: [derivedSwot] });

/** The SWOT with derivation off: none is derived. */
export const swotPackage: EntityPackageDefinition<readonly [typeof swot]> =
  defineEntityPackage({ id: "swot", entities: [swot] });
