/** Declarative service authoring contract. */

export { defineJob, defineServicePlugin, defineTool } from "@brains/plugins";
export type {
  ServiceJobDefinition,
  ServiceJobReference,
  ServiceJobStatus,
  ServicePackageDefinition,
} from "@brains/plugins";
export { z } from "@brains/utils/zod";
