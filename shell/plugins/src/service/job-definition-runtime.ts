interface RuntimeJobDefinition {
  readonly name: string;
}

const runtimeTypes = new WeakMap<object, string>();

export function bindServiceJobRuntimeType(
  definition: RuntimeJobDefinition,
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
  definition: RuntimeJobDefinition,
  runtimeType: string,
): void {
  if (runtimeTypes.get(definition) === runtimeType) {
    runtimeTypes.delete(definition);
  }
}

export function getServiceJobRuntimeType(
  definition: RuntimeJobDefinition,
): string {
  const runtimeType = runtimeTypes.get(definition);
  if (!runtimeType) {
    throw new Error(
      `Job "${definition.name}" is not registered by an active declarative service`,
    );
  }
  return runtimeType;
}
