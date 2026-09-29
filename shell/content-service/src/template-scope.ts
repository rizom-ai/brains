/**
 * The one place that knows a scoped template name is `<pluginId>:<name>`.
 * Plugins declare local names; the runtime scopes and unscopes at its edges.
 */
export function scopeTemplateName(name: string, pluginId?: string): string {
  return !pluginId || name.includes(":") ? name : `${pluginId}:${name}`;
}

export function unscopeTemplateName(name: string, pluginId: string): string {
  const prefix = `${pluginId}:`;
  return name.startsWith(prefix) ? name.slice(prefix.length) : name;
}
