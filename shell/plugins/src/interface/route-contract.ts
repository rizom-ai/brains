import type { UserPermissionLevel } from "@brains/templates";
import type { z } from "@brains/utils/zod";

/**
 * The route vocabulary, as a leaf.
 *
 * Interfaces and services both declare routes, and their definition
 * contracts import each other's job types — so the vocabulary they share
 * lives below both rather than in either. Everything here is re-exported
 * from the interface contract, which is where authors read it.
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

/**
 * The two permission questions asked about someone who is not a person yet.
 *
 * A route resolves them per request from whoever authenticated; a protocol
 * host resolves them once from its transport. Structural, so the interface
 * and service contexts both satisfy it without a shared nominal type.
 */
export interface RoutePermissions {
  getUserLevel(declarationId: string, userId: string): UserPermissionLevel;
  isAnchor(declarationId: string, userId: string): boolean;
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

/**
 * A route whose answer is the response itself, sent as written.
 *
 * Almost every route returns data and lets the runtime encode it, which is
 * what keeps a declared route from inventing its own error shapes. A route
 * hosting somebody else's protocol is the exception: an event stream, the
 * status code the protocol specifies, the session header its clients read
 * back. None of that survives a JSON envelope, and none of it is this
 * interface's to shape. Named consumer: @brains/mcp.
 */
export interface VerbatimResponse {
  readonly kind: "rizom-verbatim-response";
}

export const verbatim: VerbatimResponse = Object.freeze({
  kind: "rizom-verbatim-response",
});

export function isVerbatimResponse(value: unknown): value is VerbatimResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    Reflect.get(value, "kind") === "rizom-verbatim-response"
  );
}

export type RouteResponse = InterfaceSchema | VerbatimResponse;

export type RouteOutput<TResponse extends RouteResponse> =
  TResponse extends VerbatimResponse ? Response : unknown;

export interface InterfaceRouteInput<
  TMethod extends RouteMethod = RouteMethod,
  TBodySchema extends InterfaceSchema | undefined = InterfaceSchema | undefined,
  TResponseSchema extends RouteResponse = RouteResponse,
  TSecurity extends RouteSecurity = RouteSecurity,
> {
  readonly method: TMethod;
  readonly path: string;
  readonly security: TSecurity;
  readonly body?: TBodySchema | undefined;
  readonly response: TResponseSchema;
  handle(context: {
    readonly request: Request;
    readonly body: RouteBody<TBodySchema>;
    readonly caller: RouteCaller<TSecurity>;
  }): RouteOutput<TResponseSchema> | Promise<RouteOutput<TResponseSchema>>;
}

export interface InterfaceRouteDefinition<
  TMethod extends RouteMethod = RouteMethod,
  TBodySchema extends InterfaceSchema | undefined = InterfaceSchema | undefined,
  TResponseSchema extends RouteResponse = RouteResponse,
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
  RouteResponse,
  RouteSecurity
>;
