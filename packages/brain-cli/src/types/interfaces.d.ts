import type { z } from "./utils";

export const UserPermissionLevelSchema: z.ZodSchema<UserPermissionLevel>;
export type UserPermissionLevel = "public" | "trusted" | "anchor";
export interface PermissionRule {
  pattern: string;
  level: UserPermissionLevel;
}
export interface PermissionConfig {
  rules: PermissionRule[];
}
export interface WithVisibility {
  visibility?: UserPermissionLevel;
}

export interface DaemonHealth {
  healthy: boolean;
  message?: string;
}
export interface DaemonStatusInfo {
  name: string;
  status: string;
  healthy?: boolean;
  message?: string;
}
export type DaemonInfo = DaemonStatusInfo;
export interface Daemon {
  start(): Promise<void> | void;
  stop(): Promise<void> | void;
  health?(): Promise<DaemonHealth> | DaemonHealth;
}

export const NavigationSlots: readonly ["primary", "secondary"];
export type NavigationSlot = (typeof NavigationSlots)[number];
export interface EntityDisplayEntry {
  label: string;
  pluralName?: string;
  layout?: string;
  paginate?: boolean;
  pageSize?: number;
  navigation?: { show?: boolean; slot?: NavigationSlot; priority?: number };
}
export interface SectionDefinition {
  id: string;
  template: string;
  content?: unknown;
  dataQuery?: Record<string, unknown>;
  order?: number;
}
export interface RouteDefinition {
  id: string;
  path: string;
  title: string;
  description: string;
  sections: SectionDefinition[];
  layout: string;
  fullscreen?: boolean;
  pluginId?: string;
  sourceEntityType?: string;
  external?: boolean;
  navigation?: {
    show?: boolean;
    label?: string;
    slot?: NavigationSlot;
    priority?: number;
  };
}
export type RouteDefinitionInput = Partial<RouteDefinition> &
  Pick<RouteDefinition, "id" | "path">;
export interface NavigationItem {
  label: string;
  href: string;
  priority: number;
}
export const RouteDefinitionSchema: z.ZodSchema<RouteDefinition>;
export const RegisterRoutesPayloadSchema: z.ZodSchema<unknown>;
export const UnregisterRoutesPayloadSchema: z.ZodSchema<unknown>;
export const ListRoutesPayloadSchema: z.ZodSchema<unknown>;
export const GetRoutePayloadSchema: z.ZodSchema<unknown>;

export interface ApiRouteDefinition {
  path: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  tool: string;
  public?: boolean;
  successRedirect?: string;
  errorRedirect?: string;
}
export interface RegisteredApiRoute {
  pluginId: string;
  fullPath: string;
  definition: ApiRouteDefinition;
}
export type WebRouteMethod = "GET" | "POST" | "PUT" | "DELETE" | "OPTIONS";
export type WebRouteHandler = (
  request: Request,
) => Response | Promise<Response>;
export interface WebRouteDefinition {
  path: string;
  method?: WebRouteMethod;
  public?: boolean;
  handler: WebRouteHandler;
}
export interface RegisteredWebRoute {
  pluginId: string;
  fullPath: string;
  definition: WebRouteDefinition;
}

export interface MessageResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
export type MessageSender = <T = unknown, R = unknown>(
  channel: string,
  payload: T,
) => Promise<MessageResponse<R>>;
export interface MessageWithPayload<T = unknown> {
  channel: string;
  payload: T;
  timestamp?: number;
}
export interface MessageContext {
  interfaceType?: string;
  userId?: string;
  channelId?: string;
  [key: string]: unknown;
}
