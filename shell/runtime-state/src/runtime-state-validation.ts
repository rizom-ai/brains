const namespacePattern = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/;
const maxKeyLength = 512;

export function assertValidRuntimeStateNamespace(namespace: string): void {
  if (!namespacePattern.test(namespace)) {
    throw new Error(
      `Invalid runtime state namespace: ${namespace}. Use 1-128 alphanumeric, _, ., :, or - characters.`,
    );
  }
}

export function normalizeRuntimeStateKey(key: string): string {
  if (key.length === 0 || key.length > maxKeyLength) {
    throw new Error("Runtime state keys must be 1-512 characters long");
  }
  return key;
}

export function normalizeRuntimeStateKeyPrefix(keyPrefix: string): string {
  if (keyPrefix.length > maxKeyLength) {
    throw new Error(
      "Runtime state key prefixes must be 512 characters or shorter",
    );
  }
  return keyPrefix;
}
