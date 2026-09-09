import type { SchemaReturn } from "../internal/schema-return";
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
  /**
   * The person behind this identity, when the authenticator knows it.
   *
   * One human reaches the brain over several identities — a passkey
   * session, a chat account, an email address. A write made in a console is
   * the same person as one made in chat, and attribution only says so if
   * the caller carries the link. Named consumer: @brains/studio.
   */
  readonly canonicalId?: string | undefined;
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

/**
 * A route somebody else's protocol reaches.
 *
 * The package knows an id on its own transport and nothing about what that
 * id is worth here, so it answers with the id and the runtime decides the
 * rest from the grants this declaration holds. What a package's code never
 * decides is a permission level: that is the runtime's, or it is nobody's.
 */
export interface ProtocolSecurityDefinition {
  readonly kind: "protocol";
  authenticate(context: {
    readonly request: Request;
  }): InterfaceActor | null | Promise<InterfaceActor | null>;
}

/**
 * A route a signed-in person reaches.
 *
 * The package declares only that a first-party session is required. The
 * runtime resolves the session against the brain's own auth service and
 * reads the person's role, anchor flag and canonical identity from there —
 * the authority that applies to a browser session, which the per-interface
 * grants a channel identity resolves through are not. Nothing the package
 * wrote is consulted about who the caller is or what they may do.
 * Named consumer: @brains/studio.
 */
export interface SessionSecurityDefinition {
  readonly kind: "session";
}

export interface PublicSecurityDefinition {
  readonly kind: "public";
}

export type RouteSecurity =
  | PublicSecurityDefinition
  | ProtocolSecurityDefinition
  | SessionSecurityDefinition;
export type RouteCaller<TSecurity extends RouteSecurity> =
  TSecurity extends PublicSecurityDefinition ? null : InterfaceCaller;
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

/**
 * What a handler answers with: a written response, or the data its declared
 * schema accepts.
 *
 * The runtime parses the return value with that schema before sending it, so
 * the static type is the schema's input side — a schema that transforms takes
 * what goes in, not what comes out.
 *
 * The helper infers a const return type constrained by this schema input.
 * Literal and enum answers stay narrow without accepting arbitrary strings.
 */
export type RouteOutput<TResponse extends RouteResponse> =
  TResponse extends VerbatimResponse
    ? Response
    : TResponse extends InterfaceSchema
      ? SchemaReturn<z.input<TResponse>>
      : never;

export interface InterfaceRouteInput<
  TMethod extends RouteMethod = RouteMethod,
  TBodySchema extends InterfaceSchema | undefined = InterfaceSchema | undefined,
  TResponseSchema extends RouteResponse = RouteResponse,
  TSecurity extends RouteSecurity = RouteSecurity,
  TOutput extends RouteOutput<TResponseSchema> = RouteOutput<TResponseSchema>,
> {
  readonly method: TMethod;
  readonly path: string;
  /**
   * Whether the path names one resource or everything beneath it. A
   * single-page app serves one shell for every path under its mount, and a
   * bundle of assets is served from one prefix; neither is a list of exact
   * paths. Defaults to exact. Named consumer: @brains/studio.
   */
  readonly match?: "exact" | "prefix" | undefined;
  readonly security: TSecurity;
  readonly body?: TBodySchema | undefined;
  readonly response: TResponseSchema;
  handle(context: {
    readonly request: Request;
    readonly body: RouteBody<TBodySchema>;
    readonly caller: RouteCaller<TSecurity>;
  }): TOutput | Promise<TOutput>;
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
