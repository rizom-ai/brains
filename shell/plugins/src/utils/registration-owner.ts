/** The plugin a registration belongs to; a registry refuses one without an owner. */
export function registrationOwner(pluginId: string, registry: string): string {
  const owner = pluginId.trim();
  if (!owner) {
    throw new Error(`${registry} registration plugin id is required`);
  }
  return owner;
}
