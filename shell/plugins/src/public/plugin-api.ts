export * from "./types";
export { EntityPlugin } from "./entity-plugin";
export { InterfacePlugin } from "./interface-plugin";
export { MessageInterfacePlugin } from "./message-interface-plugin";
export { ServicePlugin } from "./service-plugin";
export {
  inboxActionSchema,
  inboxActorSchema,
  inboxEntityRefSchema,
  inboxItemListSchema,
  inboxItemSchema,
  inboxSourceMetadataSchema,
} from "../inbox-registry";
export { defineProjectionRule } from "../entity/projection-rule";
