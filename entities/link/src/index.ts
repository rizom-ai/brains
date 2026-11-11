import {
  defineEntityPackage,
  type EntityPackageDefinition,
} from "@brains/sdk/entities";
import { linksDataSource } from "./datasources/links-datasource";
import {
  linkCaptureJob,
  linkCaptureJobContract,
  linkGenerationJobContract,
} from "./jobs/capture";
import { linkEvals } from "./lib/eval-handlers";
import { link } from "./link";
import { linkConfigSchema } from "./schemas/link-config";

/**
 * The links: one entity, a saved link, rendered by the link templates
 * through the links data source. Its capture jobs and eval read the Jina
 * Reader key from the package's config.
 */
export const linkPackage: EntityPackageDefinition<
  readonly [typeof link],
  readonly [],
  typeof linkConfigSchema
> = defineEntityPackage({
  id: "link",
  config: linkConfigSchema,
  entities: [link],
  dataSources: [linksDataSource(link)],
  configure: ({ config }) => ({
    entities: [
      {
        entity: link,
        jobs: {
          capture: linkCaptureJob(
            () => link,
            linkCaptureJobContract,
            config.jinaApiKey,
          ),
          generation: linkCaptureJob(
            () => link,
            linkGenerationJobContract,
            config.jinaApiKey,
          ),
        },
        evals: linkEvals(config.jinaApiKey),
      },
    ],
  }),
});

export default linkPackage;

export { link } from "./link";
export { buildLinkAtprotoRecord, linkAtproto } from "./atproto-projection";
export {
  linkCaptureJobContract,
  linkCaptureJobSchema,
  linkCaptureResultSchema,
  type LinkCaptureJobData,
  type LinkCaptureResult,
} from "./jobs/capture";

// Schema and type exports
export type {
  LinkEntity,
  LinkFrontmatter,
  LinkSource,
  LinkStatus,
  LinkMetadata,
} from "./schemas/link";
export {
  linkSchema,
  linkFrontmatterSchema,
  linkSourceSchema,
  linkStatusSchema,
  linkMetadataSchema,
} from "./schemas/link";
export { linkConfigSchema } from "./schemas/link-config";
export type { LinkConfig, LinkConfigInput } from "./schemas/link-config";
