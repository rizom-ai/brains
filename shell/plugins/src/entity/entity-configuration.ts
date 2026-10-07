import type {
  AnyEntityDefinition,
  EntityCreateRoute,
  EntityCreateRouting,
  EntityEvalDeclaration,
} from "./entity-definition-contract";
import type { EntityDefinitionShape } from "./entity-shape";

/** Configured behavior only; cannot change registered types, schemas or ownership. */
export interface EntityConfigurationBinding {
  readonly entity: EntityDefinitionShape;
  readonly create?: EntityCreateRouting;
  readonly evals?: EntityEvalDeclaration;
}

function copyRoute(route: EntityCreateRoute): EntityCreateRoute {
  return Object.freeze(
    "resolve" in route
      ? {
          resolve: route.resolve,
          ...(route.mediaTypes
            ? { mediaTypes: Object.freeze([...route.mediaTypes]) }
            : {}),
        }
      : "delegate" in route
        ? { delegate: route.delegate }
        : { reject: route.reject },
  );
}
function copyRouting(routing: EntityCreateRouting): EntityCreateRouting {
  return Object.freeze({
    ...(routing.fromPrompt && { fromPrompt: copyRoute(routing.fromPrompt) }),
    ...(routing.fromContent && { fromContent: copyRoute(routing.fromContent) }),
    ...(routing.fromUpload && { fromUpload: copyRoute(routing.fromUpload) }),
    ...(routing.fromAttachment && {
      fromAttachment: copyRoute(routing.fromAttachment),
    }),
  });
}

/** Host-only composition of behavior into already-detached owned declarations. */
export function applyEntityConfiguration(
  definitions: readonly AnyEntityDefinition[],
  bindings: readonly EntityConfigurationBinding[],
): readonly AnyEntityDefinition[] {
  const configured = new Map(
    definitions.map((definition) => [definition.type, definition]),
  );
  const seen = new Set<string>();
  for (const binding of bindings) {
    const type = binding.entity.type;
    const definition = configured.get(type);
    if (!definition)
      throw new Error(`Cannot configure undeclared entity "${type}"`);
    if (seen.has(type))
      throw new Error(`Duplicate configuration for entity "${type}"`);
    seen.add(type);
    configured.set(
      type,
      Object.freeze({
        ...definition,
        ...(binding.create && { create: copyRouting(binding.create) }),
        ...(binding.evals && { evals: Object.freeze({ ...binding.evals }) }),
      }),
    );
  }
  return Object.freeze([...configured.values()]);
}
