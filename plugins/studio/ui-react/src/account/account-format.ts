export function roleLabel(value: string): string {
  return value.length === 0
    ? value
    : `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

export function initials(displayName: string): string {
  return displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.slice(0, 1).toUpperCase())
    .join("");
}

export function studioEntityHref(
  studioPath: string,
  entityReference: string,
): string | undefined {
  const separator = entityReference.indexOf("/");
  if (separator <= 0 || separator === entityReference.length - 1) {
    return undefined;
  }
  const entityType = entityReference.slice(0, separator);
  const entityId = entityReference.slice(separator + 1);
  const base = studioPath === "/" ? "" : studioPath.replace(/\/+$/, "");
  return `${base}/entities/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`;
}
