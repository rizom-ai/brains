import type { AnyServiceJobDefinition } from "./service-definition-contract";

const runtimeTypes = new WeakMap<AnyServiceJobDefinition, string>();

export function bindServiceJobRuntimeType(
  definition: AnyServiceJobDefinition,
  runtimeType: string,
): void {
  const existing = runtimeTypes.get(definition);
  if (existing && existing !== runtimeType) {
    throw new Error(
      `Job "${definition.name}" is registered as both "${existing}" and "${runtimeType}"`,
    );
  }
  runtimeTypes.set(definition, runtimeType);
}

export function unbindServiceJobRuntimeType(
  definition: AnyServiceJobDefinition,
  runtimeType: string,
): void {
  if (runtimeTypes.get(definition) === runtimeType) {
    runtimeTypes.delete(definition);
  }
}

export function getServiceJobRuntimeType(
  definition: AnyServiceJobDefinition,
): string {
  const runtimeType = runtimeTypes.get(definition);
  if (!runtimeType) {
    throw new Error(
      `Job "${definition.name}" is not registered by an active declarative service`,
    );
  }
  return runtimeType;
}
