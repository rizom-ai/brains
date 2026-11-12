import type { UserPermissionLevel } from "@brains/templates";
import type { z } from "@brains/utils/zod";
import type { SchemaValue } from "../internal/schema-value";

/**
 * The vocabulary every family declares HTTP routes with: an interface's and a
 * service's routes are the same routes, served by the same runtime.
 */
export const routeMethods = [
  "GET",
  "POST",
  "PUT",
  "DELETE",
  "OPTIONS",
] as const;
export type RouteMethod = (typeof routeMethods)[number];
export type InterfaceSchema = z.ZodType<unknown, unknown>;

export interface InterfaceActor {
  readonly id: string;
  readonly displayName?: string | undefined;
}

export interface InterfaceCaller {
  readonly actor: InterfaceActor;
  readonly permission: UserPermissionLevel;
  readonly isAnchor: boolean;
}

export interface ProtocolSecurityDefinition {
  readonly kind: "protocol";
  authenticate(context: {
    readonly request: Request;
  }): InterfaceActor | null | Promise<InterfaceActor | null>;
}

export interface PublicSecurityDefinition {
  readonly kind: "public";
}

export type RouteSecurity =
  PublicSecurityDefinition | ProtocolSecurityDefinition;
export type RouteCaller<TSecurity extends RouteSecurity> =
  TSecurity extends ProtocolSecurityDefinition ? InterfaceCaller : null;
export type RouteBody<TSchema extends InterfaceSchema | undefined> =
  TSchema extends InterfaceSchema ? z.output<TSchema> : undefined;

export interface InterfaceRouteInput<
  TMethod extends RouteMethod = RouteMethod,
  TBodySchema extends InterfaceSchema | undefined = InterfaceSchema | undefined,
  TResponseSchema extends InterfaceSchema = InterfaceSchema,
  TSecurity extends RouteSecurity = RouteSecurity,
> {
  readonly method: TMethod;
  readonly path: string;
  readonly security: TSecurity;
  readonly body?: TBodySchema | undefined;
  readonly response: TResponseSchema;
  /**
   * Answers with the response schema's input, which the runtime parses before
   * sending; written inline, an answer keeps its literal types.
   */
  handle(context: {
    readonly request: Request;
    readonly body: RouteBody<TBodySchema>;
    readonly caller: RouteCaller<TSecurity>;
  }): SchemaValue<TResponseSchema> | Promise<SchemaValue<TResponseSchema>>;
}

export interface InterfaceRouteDefinition<
  TMethod extends RouteMethod = RouteMethod,
  TBodySchema extends InterfaceSchema | undefined = InterfaceSchema | undefined,
  TResponseSchema extends InterfaceSchema = InterfaceSchema,
  TSecurity extends RouteSecurity = RouteSecurity,
> extends InterfaceRouteInput<
  TMethod,
  TBodySchema,
  TResponseSchema,
  TSecurity
> {
  readonly kind: "rizom-interface-route";
}

export type AnyInterfaceRouteDefinition = InterfaceRouteDefinition<
  RouteMethod,
  InterfaceSchema | undefined,
  InterfaceSchema,
  RouteSecurity
>;

/**
 * A Studio workspace a route returns the browser to, stated by its shape so
 * the route contract does not depend on the operator one. The runtime checks
 * it is one the declaring package binds.
 */
export interface ReturnToWorkspace {
  readonly kind: "rizom-studio-workspace";
  readonly id: string;
  readonly query?: InterfaceSchema | undefined;
}

/** The workspace's query schema, whose input a returning route answers with. */
export type ReturnToQuery<TWorkspace extends ReturnToWorkspace> = NonNullable<
  TWorkspace["query"]
>;

/** A workspace without a query has no URL state to come back with. */
type ReturnToQueryDeclared<TWorkspace extends ReturnToWorkspace> = [
  TWorkspace["query"],
] extends [undefined]
  ? { readonly query: InterfaceSchema }
  : unknown;

/**
 * A browser navigation that ends in one of the package's own Studio
 * workspaces, such as a provider's consent callback: the handler answers with
 * the workspace's query input, and the runtime sends the browser there.
 */
export interface ReturnToRouteInput<
  TSecurity extends RouteSecurity = RouteSecurity,
  TWorkspace extends ReturnToWorkspace = ReturnToWorkspace,
> {
  readonly method: "GET";
  readonly path: string;
  readonly security: TSecurity;
  /** One of this package's Studio workspaces; it must declare a query. */
  readonly returnTo: TWorkspace & ReturnToQueryDeclared<TWorkspace>;
  readonly body?: undefined;
  readonly response?: undefined;
  /**
   * Answers with the workspace's query input; written inline, it keeps its
   * literal types. The runtime checks it against the query schema.
   */
  handle(context: {
    readonly request: Request;
    readonly body: undefined;
    readonly caller: RouteCaller<TSecurity>;
  }):
    | SchemaValue<ReturnToQuery<TWorkspace>>
    | Promise<SchemaValue<ReturnToQuery<TWorkspace>>>;
}

export interface ReturnToRouteDefinition<
  TSecurity extends RouteSecurity = RouteSecurity,
  TWorkspace extends ReturnToWorkspace = ReturnToWorkspace,
> extends ReturnToRouteInput<TSecurity, TWorkspace> {
  readonly kind: "rizom-interface-route";
}

export type AnyReturnToRouteDefinition = ReturnToRouteDefinition<
  RouteSecurity,
  ReturnToWorkspace
>;

/** Every route a service declares: answering in JSON, or returning the browser. */
export type AnyDeclaredRouteDefinition =
  AnyInterfaceRouteDefinition | AnyReturnToRouteDefinition;

/** Whether a route returns the browser to a workspace, rather than answer JSON. */
export function isReturnToRoute(
  definition:
    AnyDeclaredRouteDefinition | InterfaceRouteInput | ReturnToRouteInput,
): definition is AnyReturnToRouteDefinition | ReturnToRouteInput {
  return "returnTo" in definition;
}
