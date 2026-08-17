/**
 * Link package.
 *
 * A `link` entity to store saved URLs, plus the work of actually fetching
 * one — which needs a Jina API key and so belongs to the service half of
 * the package rather than to the entity.
 */

import {
  defineJob,
  defineServicePlugin,
  type ServicePackageDefinition,
} from "@brains/plugins";
import { linkConfigSchema } from "./schemas/link-config";
import { link } from "./link-entity";
import { LINK_CAPTURE_JOB } from "./job-names";
import {
  LinkCaptureJobHandler,
  linkCaptureJobSchema,
  linkCaptureResultSchema,
} from "./handlers/capture-handler";
import { UrlFetcher } from "./lib/url-fetcher";
import { extractContentEval } from "./lib/extract-content-eval";

const captureJob = defineJob({
  name: LINK_CAPTURE_JOB,
  input: linkCaptureJobSchema,
  output: linkCaptureResultSchema,
});

const linkPackage: ServicePackageDefinition<typeof linkConfigSchema> =
  defineServicePlugin({
    id: "capture",
    config: linkConfigSchema,
    entities: [link],
    setup: ({ config }) => ({
      fetcherOptions: config.jinaApiKey
        ? { jinaApiKey: config.jinaApiKey }
        : undefined,
    }),
    jobs: ({ state }) => [
      captureJob.handle(async ({ input, entities, ai, logger, progress }) => {
        const handler = new LinkCaptureJobHandler(
          logger,
          { entities, ai },
          state.fetcherOptions,
        );
        return handler.process(input, LINK_CAPTURE_JOB, progress);
      }),
    ],
    // Its test cases fetch a live URL, so the eval needs the same key the
    // capture job does.
    evals: ({ state }) => ({
      extractContent: async (input: unknown) =>
        extractContentEval(input, new UrlFetcher(state.fetcherOptions)),
    }),
  });

export default linkPackage;

export { link } from "./link-entity";
export { LINK_CAPTURE_JOB } from "./job-names";
export {
  buildLinkAtprotoRecord,
  createLinkAtprotoProjection,
} from "./atproto-projection";

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

// Adapter exports
export { LinkAdapter, linkAdapter } from "./adapters/link-adapter";

// Service exports
export { LinkService } from "./lib/link-service";
