import { defineJob } from "@brains/sdk/services";
import type { ServiceJobDefinition } from "@brains/sdk/services";
import {
  siteBuildJobSchema,
  siteBuildJobResultSchema,
} from "../types/job-types";

/**
 * Rendering the whole site into a directory.
 *
 * At most one per environment waits at a time: a build that is already
 * queued will render whatever the brain says when it runs, so a second
 * request adds a duplicate render and nothing else. A build already in
 * progress does not block a new request, because that one cannot see what
 * changed after it started.
 */
export const siteBuildJob: ServiceJobDefinition<
  "site-build",
  typeof siteBuildJobSchema,
  typeof siteBuildJobResultSchema
> = defineJob({
  name: "site-build",
  input: siteBuildJobSchema,
  output: siteBuildJobResultSchema,
  oncePending: (input) => `site-build:${input.environment ?? "preview"}`,
});
