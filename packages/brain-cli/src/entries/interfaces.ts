/** Curated public interface plugin contract surface. */

export {
  BaseMessageSchema,
  MessageResponseSchema,
} from "@brains/plugins/contracts/messaging";
export type {
  BaseMessage,
  MessageContext,
  MessageResponse,
  MessageSendOptions,
  MessageSender,
  MessageWithPayload,
} from "@brains/plugins/contracts/messaging";

export {
  NavigationSlots,
  RouteDefinitionSchema,
  RegisterRoutesPayloadSchema,
  UnregisterRoutesPayloadSchema,
  ListRoutesPayloadSchema,
  GetRoutePayloadSchema,
} from "@brains/plugins/contracts/routes";
export type {
  EntityDisplayEntry,
  NavigationItem,
  NavigationSlot,
  RouteDefinition,
  RouteDefinitionInput,
  SectionDefinition,
} from "@brains/plugins/contracts/routes";

export type {
  ApiRouteDefinition,
  RegisteredApiRoute,
} from "@brains/plugins/contracts/api-routes";

export type {
  RegisteredWebRoute,
  WebRouteDefinition,
  WebRouteHandler,
  WebRouteMethod,
} from "@brains/plugins/contracts/web-routes";

export type {
  Daemon,
  DaemonHealth,
  DaemonInfo,
  DaemonStatusInfo,
} from "@brains/plugins/contracts/daemons";

export { UserPermissionLevelSchema } from "@brains/templates";
export type {
  PermissionConfig,
  PermissionRule,
  UserPermissionLevel,
  WithVisibility,
} from "@brains/templates";
