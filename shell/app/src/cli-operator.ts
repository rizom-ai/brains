import type { ActorRef } from "@brains/contracts";
import type { UserPermissionLevel } from "@brains/templates";

/**
 * The brain's own command line, run by whoever owns the data directory.
 *
 * One identity for both CLI runtimes. The app grants it admin by permission
 * rule (see buildShellConfig) so a job admitted from the CLI re-resolves the
 * same authority at write time; the level asserted here only ever lowers it.
 */
export const CLI_OPERATOR_ACTOR: Extract<ActorRef, { kind: "service" }> = {
  kind: "service",
  serviceId: "brain-cli",
};

/** The operator as a permission-grant principal. */
export const CLI_OPERATOR_PRINCIPAL: string = `${CLI_OPERATOR_ACTOR.kind}:${CLI_OPERATOR_ACTOR.serviceId}`;

export interface CliOperatorContext {
  interfaceType: "cli";
  actor: ActorRef;
  userPermissionLevel: UserPermissionLevel;
}

export function createCliOperatorContext(
  userPermissionLevel: UserPermissionLevel = "admin",
): CliOperatorContext {
  return {
    interfaceType: "cli",
    actor: CLI_OPERATOR_ACTOR,
    userPermissionLevel,
  };
}
