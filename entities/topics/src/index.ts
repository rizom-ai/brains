import { topicsPackage } from "./plugin";

export { topicsPackage } from "./plugin";
export { topic } from "./topic-entity";
export type {
  TopicsPluginConfig,
  TopicsPluginConfigInput,
} from "./schemas/config";
export type { TopicEntity } from "./types";
export {
  buildTopicAtprotoRecord,
  createTopicAtprotoProjection,
} from "./atproto-projection";

export default topicsPackage;
