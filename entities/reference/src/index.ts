import {
  defineServicePlugin,
  z,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import type { ReferenceNetwork } from "./lib/network";
import { referenceEntity } from "./reference";

const emptyConfigSchema: z.ZodObject<Record<string, never>> = z.object({});

/**
 * References: pointers to what other brains publish, reaching those brains
 * as `network` says.
 */
export function createReferencePackage(
  network: ReferenceNetwork = {},
): ServicePackageDefinition<typeof emptyConfigSchema> {
  return defineServicePlugin({
    id: "references",
    config: emptyConfigSchema,
    entities: [referenceEntity(network)],
    setup: async (): Promise<Record<never, never>> => ({}),
  });
}

/** References, reaching other brains through the globals. */
export const referencePackage: ServicePackageDefinition<
  typeof emptyConfigSchema
> = createReferencePackage();

export default referencePackage;

export { referenceEntity, type ReferenceDefinition } from "./reference";
export type { ReferenceNetwork } from "./lib/network";
export {
  referenceMetadataSchema,
  referenceSourceStateSchema,
  referenceStatusSchema,
  type ReferenceMetadata,
  type ReferenceSourceState,
  type ReferenceStatus,
} from "./schemas/reference";
