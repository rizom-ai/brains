/** Browser-safe auth administration vocabulary and response contracts. */
export const AUTH_USER_ROLES = ["admin", "trusted", "public"] as const;
export const AUTH_USER_STATUSES = ["active", "invited", "suspended"] as const;
export const AUTH_BRAIN_ANCHOR_KINDS = ["person", "collective"] as const;
export const AUTH_BRAIN_ANCHOR_CONFIG_KINDS = [
  "person",
  "team",
  "organization",
] as const;
export const AUTH_ADMIN_MUTATION_ACTIONS = {
  cancelInvitation: "cancelInvitation",
  confirmManualInvitationDelivery: "confirmManualInvitationDelivery",
  createInvitation: "createInvitation",
  createUser: "createUser",
  inviteExternalPeerPerson: "inviteExternalPeerPerson",
  linkExternalPeer: "linkExternalPeer",
  unlinkExternalPeer: "unlinkExternalPeer",
  updateUserRole: "updateUserRole",
  updateUserStatus: "updateUserStatus",
  deleteUser: "deleteUser",
  attachIdentity: "attachIdentity",
  detachIdentity: "detachIdentity",
  resendInvitation: "resendInvitation",
  revokePasskey: "revokePasskey",
  startPasskeyRegistration: "startPasskeyRegistration",
  revokeUserSessions: "revokeUserSessions",
} as const;

export type AuthAdminRole = (typeof AUTH_USER_ROLES)[number];
export type AuthAdminStatus = (typeof AUTH_USER_STATUSES)[number];
export type AuthBrainAnchorKind = (typeof AUTH_BRAIN_ANCHOR_KINDS)[number];
export type AuthBrainAnchorConfigKind =
  (typeof AUTH_BRAIN_ANCHOR_CONFIG_KINDS)[number];
export type AuthAdminIdentityType = string;
export type AuthAdminMutationAction =
  (typeof AUTH_ADMIN_MUTATION_ACTIONS)[keyof typeof AUTH_ADMIN_MUTATION_ACTIONS];
export type AuthInvitationState =
  | "pending"
  | "sending"
  | "sent"
  | "claimed"
  | "expired"
  | "cancelled"
  | "failed";
export type AuthIdentityVisibility = "private" | "trusted" | "public";
export type AuthIdentitySourceKind =
  "admin" | "agent" | "migration" | "provider";

export interface AuthAdminPrincipal {
  userId: string;
  personId: string;
  displayName: string;
  role: AuthAdminRole;
  status: AuthAdminStatus;
  permissionLevel: AuthAdminRole;
  isAnchor: boolean;
  canonicalId?: string | undefined;
}

export interface AuthIdentitySummary {
  id: string;
  personId: string;
  userId: string;
  type: AuthAdminIdentityType;
  visibility: AuthIdentityVisibility;
  evidence: Array<{
    sourceKind: AuthIdentitySourceKind;
    sourceId?: string | undefined;
    assurance: "asserted" | "verified";
    verifiedAt?: number | undefined;
  }>;
  issuer?: string | undefined;
  label?: string | undefined;
  verifiedAt?: number | undefined;
  revokedAt?: number | undefined;
  createdAt: number;
}

export interface AuthAuditEventSummary {
  id: string;
  actorUserId?: string | undefined;
  action: string;
  targetType?: string | undefined;
  targetId?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
  createdAt: number;
}

export interface AuthPasskeySummary {
  id: string;
  userId: string;
  transports?: string[] | undefined;
  credentialDeviceType?: string | undefined;
  credentialBackedUp: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface AuthExternalPeerSummary {
  peerId: string;
  personId: string;
  verificationStatus: "unverified" | "verified";
  createdByUserId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface AuthInvitationSummary {
  id: string;
  userId: string;
  state: AuthInvitationState;
  failureCode?: string | undefined;
  createdAt: number;
  updatedAt: number;
  /** Current single-use setup-link expiry, in epoch milliseconds. */
  expiresAt?: number | undefined;
  sentAt?: number | undefined;
  claimedAt?: number | undefined;
  expiredAt?: number | undefined;
  cancelledAt?: number | undefined;
}

export interface AuthAdminUserSummary extends AuthAdminPrincipal {
  profileEntityId?: string | undefined;
  invitation?: AuthInvitationSummary | undefined;
  identities: AuthIdentitySummary[];
  passkeys: AuthPasskeySummary[];
  externalPeers: AuthExternalPeerSummary[];
}

export interface AuthBrainAnchorSummary {
  /** Mechanical ownership kind persisted in auth runtime state. */
  kind: AuthBrainAnchorKind;
  /** Config/profile flavor declared by brain.yaml. */
  configuredKind: AuthBrainAnchorConfigKind;
  subjectId: string;
  displayName: string;
  personId?: string | undefined;
  profileEntityId?: string | undefined;
  administeredBy: number;
}

export type AuthInvitationDeliveryMode = "automatic" | "manual";

export interface AuthInvitationChannelSummary {
  type: string;
  displayName: string;
  subjectLabel: string;
  subjectPattern?: { source: string; flags?: string | undefined } | undefined;
  deliveryModes: AuthInvitationDeliveryMode[];
}

export interface AuthSetupDeliveryInput {
  type: string;
  subject: string;
  label?: string | undefined;
  mode?: AuthInvitationDeliveryMode | undefined;
}

export interface AuthIdentityProposalInput {
  type: string;
  subject: string;
  issuer?: string | undefined;
  label?: string | undefined;
  visibility?: AuthIdentityVisibility | undefined;
}

export interface AuthIdentityReconciliationOwner {
  personId: string;
  userId?: string | undefined;
  displayName?: string | undefined;
  status?: AuthAdminStatus | undefined;
}

export interface AuthIdentityClaimReconciliation {
  index: number;
  type: AuthIdentityProposalInput["type"];
  label?: string | undefined;
  state: "unbound" | "asserted_match" | "verified_match";
  owner?: AuthIdentityReconciliationOwner | undefined;
}

export interface AuthIdentityReconciliationResponse {
  state:
    "unique_verified_match" | "cross_person_conflict" | "no_verified_match";
  suggestedUserId?: string | undefined;
  claims: AuthIdentityClaimReconciliation[];
}
