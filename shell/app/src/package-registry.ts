/**
 * Package registry for pre-bundled package references.
 *
 * In production builds, the generated entrypoint registers packages here
 * so resolvePackageRefs can find them without dynamic import.
 * In dev mode, this stays empty and dynamic import is used instead.
 */
const registry = new Map<string, unknown>();

export function registerPackage(name: string, value: unknown): void {
  registry.set(name, value);
}

export function getPackage(name: string): unknown | undefined {
  return registry.get(name);
}

export function hasPackage(name: string): boolean {
  return registry.has(name);
}
