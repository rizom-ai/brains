import type { AuthIdentitySummary } from "@brains/contracts";
import type { ChannelDescriptor } from "@brains/plugins";
import type { AuthIdentityRecord } from "./identity-store";

export interface IdentitySummaryOptions {
  /**
   * What to show when an identity's only label is its channel's generic
   * subject label (for example "Email address") and it has no delivery
   * subject. The administration read surfaces keep that label; the identity
   * mutation responses omit it.
   */
  genericChannelLabel: "keep" | "omit";
  getChannelDescriptor?:
    ((channelType: string) => ChannelDescriptor | undefined) | undefined;
}

export function identitySummary(
  identity: AuthIdentityRecord,
  userId: string,
  options: IdentitySummaryOptions,
): AuthIdentitySummary {
  const label = identityLabel(identity, options);
  return {
    id: identity.id,
    personId: identity.personId,
    userId,
    type: identity.type,
    visibility: identity.visibility,
    evidence: identity.evidence.map((item) => ({
      sourceKind: item.sourceKind,
      ...(item.sourceId ? { sourceId: item.sourceId } : {}),
      assurance: item.assurance,
      ...(item.verifiedAt !== null ? { verifiedAt: item.verifiedAt } : {}),
    })),
    ...(identity.issuer ? { issuer: identity.issuer } : {}),
    ...(label ? { label } : {}),
    ...(identity.verifiedAt !== null
      ? { verifiedAt: identity.verifiedAt }
      : {}),
    ...(identity.revokedAt !== null ? { revokedAt: identity.revokedAt } : {}),
    createdAt: identity.createdAt,
  };
}

/**
 * A specific label wins, then the delivery subject; a label that only repeats
 * the channel's generic subject label is the last resort, and only where the
 * caller keeps it.
 */
function identityLabel(
  identity: AuthIdentityRecord,
  options: IdentitySummaryOptions,
): string | undefined {
  const label = identity.label?.trim();
  const deliverySubject = identity.deliverySubject?.trim();
  if (
    label &&
    label !== options.getChannelDescriptor?.(identity.type)?.subjectLabel
  ) {
    return label;
  }
  if (deliverySubject) return deliverySubject;
  return options.genericChannelLabel === "keep" && label ? label : undefined;
}
