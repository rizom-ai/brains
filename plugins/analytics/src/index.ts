import { createAnalyticsPackage } from "./plugin";

export {
  createAnalyticsPackage,
  type AnalyticsDeps,
  type AnalyticsState,
} from "./plugin";
export { trafficSnapshotEntity } from "./entity/traffic-snapshot-entity";
export { trafficSnapshotAdapter } from "./entity/adapter";
export {
  trafficSnapshotSchema,
  type TrafficDay,
  type TrafficSnapshot,
} from "./entity/schema";

/**
 * Traffic analytics, as a brain composes it: the traffic-snapshot type and
 * the service that captures and reports traffic.
 */
const analyticsPackage: ReturnType<typeof createAnalyticsPackage> =
  createAnalyticsPackage();
export default analyticsPackage;

// Export types and schemas
export type {
  AnalyticsConfig,
  AnalyticsConfigInput,
  CloudflareConfig,
} from "./config";
export { analyticsConfigSchema, cloudflareConfigSchema } from "./config";
