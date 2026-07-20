import type { AuthIdentitySummary } from "@brains/auth-service/admin-contracts";

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

export function cmsEntityHref(entityReference: string): string | undefined {
  const separator = entityReference.indexOf("/");
  if (separator <= 0 || separator === entityReference.length - 1) {
    return undefined;
  }
  const entityType = entityReference.slice(0, separator);
  const entityId = entityReference.slice(separator + 1);
  return `/cms#/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`;
}

export function assuranceLabel(identity: AuthIdentitySummary): string {
  return identity.evidence.some(
    (evidence) =>
      evidence.assurance === "verified" && evidence.verifiedAt !== undefined,
  )
    ? "Verified"
    : "Asserted — cannot authenticate";
}

export function formatDate(value: number): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(value),
  );
}
