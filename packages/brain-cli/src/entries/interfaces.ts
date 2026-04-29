/** Curated public interface plugin authoring surface. */

export { UserPermissionLevelSchema } from "@brains/templates";

export {
  RouteDefinitionSchema,
  NavigationSlots,
  RegisterRoutesPayloadSchema,
  UnregisterRoutesPayloadSchema,
  ListRoutesPayloadSchema,
  GetRoutePayloadSchema,
} from "@brains/plugins";

export type {
  Daemon,
  DaemonHealth,
  DaemonInfo,
  DaemonStatusInfo,
  ApiRouteDefinition,
  RegisteredApiRoute,
  WebRouteDefinition,
  RegisteredWebRoute,
  WebRouteMethod,
  WebRouteHandler,
  RouteDefinition,
  RouteDefinitionInput,
  SectionDefinition,
  NavigationItem,
  NavigationSlot,
  EntityDisplayEntry,
  MessageResponse,
  MessageSender,
  MessageWithPayload,
  MessageContext,
} from "@brains/plugins";

export type {
  UserPermissionLevel,
  PermissionConfig,
  PermissionRule,
  WithVisibility,
} from "@brains/templates";
