import {
  defineServicePlugin,
  z,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import { serviceRuntime } from "@brains/sdk/internal/service-runtime";
import { referenceRepos, type ReferenceNetwork } from "./lib/network";
import { recheckContextOf, recheckReferences } from "./lib/recheck";
import { referenceEntity } from "./reference";
import { referencesDataSource } from "./datasources/references-datasource";
import {
  REFERENCE_LIST_TEMPLATE,
  referenceListTemplate,
} from "./templates/reference-list";

const emptyConfigSchema: z.ZodObject<Record<string, never>> = z.object({});

/**
 * References: pointers to what other brains publish, reaching those brains
 * as `network` says.
 */
export function createReferencePackage(
  network: ReferenceNetwork = {},
): ServicePackageDefinition<typeof emptyConfigSchema> {
  const repos = referenceRepos(network);
  const reference = referenceEntity(repos);
  return defineServicePlugin({
    id: "references",
    config: emptyConfigSchema,
    entities: [reference],
    setup: async (setupContext): Promise<Record<never, never>> => {
      const runtime = serviceRuntime(setupContext);
      const context = recheckContextOf(runtime, repos);
      runtime.dataSource(referencesDataSource(reference));
      runtime.template(REFERENCE_LIST_TEMPLATE, referenceListTemplate);
      runtime.recurringCheck({
        id: "source-recheck",
        cadence: "daily",
        deliverAlerts: false,
        run: async ({ signal }) => {
          await recheckReferences(context, signal);
          return {};
        },
      });
      return {};
    },
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
  ReferenceList,
  referenceListItemSchema,
  referenceListSchema,
  referenceListTemplate,
  type ReferenceListData,
  type ReferenceListItem,
} from "./templates/reference-list";
export {
  referenceMetadataSchema,
  referenceSourceStateSchema,
  referenceStatusSchema,
  type ReferenceMetadata,
  type ReferenceSourceState,
  type ReferenceStatus,
} from "./schemas/reference";
