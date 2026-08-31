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
  handle(context: {
    readonly request: Request;
    readonly body: RouteBody<TBodySchema>;
    readonly caller: RouteCaller<TSecurity>;
  }): unknown | Promise<unknown>;
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
