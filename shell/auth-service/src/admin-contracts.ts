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
  canonicalId?: string;
}

export interface AuthIdentitySummary {
  id: string;
  personId: string;
  userId: string;
  type: AuthAdminIdentityType;
  visibility: AuthIdentityVisibility;
  evidence: Array<{
    sourceKind: AuthIdentitySourceKind;
    sourceId?: string;
    assurance: "asserted" | "verified";
    verifiedAt?: number;
  }>;
  issuer?: string;
  label?: string;
  verifiedAt?: number;
  revokedAt?: number;
  createdAt: number;
}

export interface AuthAuditEventSummary {
  id: string;
  actorUserId?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
}

export interface AuthPasskeySummary {
  id: string;
  userId: string;
  transports?: string[];
  credentialDeviceType?: string;
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
  failureCode?: string;
  createdAt: number;
  updatedAt: number;
  /** Current single-use setup-link expiry, in epoch milliseconds. */
  expiresAt?: number;
  sentAt?: number;
  claimedAt?: number;
  expiredAt?: number;
  cancelledAt?: number;
}

export interface AuthAdminUserSummary extends AuthAdminPrincipal {
  profileEntityId?: string;
  invitation?: AuthInvitationSummary;
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
  personId?: string;
  profileEntityId?: string;
  administeredBy: number;
}

export interface AuthBrainAnchorResponse {
  anchor: AuthBrainAnchorSummary;
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
  userId?: string;
  displayName?: string;
  status?: AuthAdminStatus;
}

export interface AuthIdentityClaimReconciliation {
  index: number;
  type: AuthIdentityProposalInput["type"];
  label?: string;
  state: "unbound" | "asserted_match" | "verified_match";
  owner?: AuthIdentityReconciliationOwner;
}

export interface AuthIdentityReconciliationRequest {
  claims: AuthIdentityProposalInput[];
}

export interface AuthIdentityReconciliationResponse {
  state:
    "unique_verified_match" | "cross_person_conflict" | "no_verified_match";
  suggestedUserId?: string;
  claims: AuthIdentityClaimReconciliation[];
}

export type AuthAdminMutation =
  | {
      action: typeof AUTH_ADMIN_MUTATION_ACTIONS.cancelInvitation;
      confirmation: typeof AUTH_ADMIN_MUTATION_ACTIONS.cancelInvitation;
      invitationId: string;
    }
  | {
      action: typeof AUTH_ADMIN_MUTATION_ACTIONS.confirmManualInvitationDelivery;
      confirmation: typeof AUTH_ADMIN_MUTATION_ACTIONS.confirmManualInvitationDelivery;
      invitationId: string;
      deliveryAttemptId: string;
    }
  | {
      action: typeof AUTH_ADMIN_MUTATION_ACTIONS.createInvitation;
      confirmation: typeof AUTH_ADMIN_MUTATION_ACTIONS.createInvitation;
      idempotencyKey: string;
      displayName: string;
      role: Extract<AuthAdminRole, "admin" | "trusted">;
      delivery: AuthSetupDeliveryInput;
      peerId?: string;
    }
  | {
      action: typeof AUTH_ADMIN_MUTATION_ACTIONS.resendInvitation;
      confirmation: typeof AUTH_ADMIN_MUTATION_ACTIONS.resendInvitation;
      invitationId: string;
    }
  | {
      action: typeof AUTH_ADMIN_MUTATION_ACTIONS.createUser;
      confirmation: typeof AUTH_ADMIN_MUTATION_ACTIONS.createUser;
      displayName: string;
      role: AuthAdminRole;
      status: AuthAdminStatus;
    }
  | {
      action: typeof AUTH_ADMIN_MUTATION_ACTIONS.inviteExternalPeerPerson;
      confirmation: typeof AUTH_ADMIN_MUTATION_ACTIONS.inviteExternalPeerPerson;
      peerId: string;
      displayName: string;
      role: Extract<AuthAdminRole, "admin" | "trusted">;
      delivery: AuthSetupDeliveryInput;
    }
  | {
      action: typeof AUTH_ADMIN_MUTATION_ACTIONS.linkExternalPeer;
      confirmation: typeof AUTH_ADMIN_MUTATION_ACTIONS.linkExternalPeer;
      peerId: string;
      userId: string;
    }
  | {
      action: typeof AUTH_ADMIN_MUTATION_ACTIONS.updateUserRole;
      confirmation: typeof AUTH_ADMIN_MUTATION_ACTIONS.updateUserRole;
      userId: string;
      role: AuthAdminRole;
    }
  | {
      action: typeof AUTH_ADMIN_MUTATION_ACTIONS.updateUserStatus;
      confirmation: typeof AUTH_ADMIN_MUTATION_ACTIONS.updateUserStatus;
      userId: string;
      status: AuthAdminStatus;
    }
  | {
      action: typeof AUTH_ADMIN_MUTATION_ACTIONS.deleteUser;
      confirmation: typeof AUTH_ADMIN_MUTATION_ACTIONS.deleteUser;
      userId: string;
    }
  | {
      action: typeof AUTH_ADMIN_MUTATION_ACTIONS.attachIdentity;
      confirmation: typeof AUTH_ADMIN_MUTATION_ACTIONS.attachIdentity;
      userId: string;
      type: Exclude<AuthAdminIdentityType, "passkey">;
      subject: string;
      issuer?: string;
      label?: string;
    }
  | {
      action: typeof AUTH_ADMIN_MUTATION_ACTIONS.detachIdentity;
      confirmation: typeof AUTH_ADMIN_MUTATION_ACTIONS.detachIdentity;
      identityId: string;
    }
  | {
      action: typeof AUTH_ADMIN_MUTATION_ACTIONS.revokePasskey;
      confirmation: typeof AUTH_ADMIN_MUTATION_ACTIONS.revokePasskey;
      credentialId: string;
    }
  | {
      action: typeof AUTH_ADMIN_MUTATION_ACTIONS.startPasskeyRegistration;
      confirmation: typeof AUTH_ADMIN_MUTATION_ACTIONS.startPasskeyRegistration;
      userId: string;
      delivery?: AuthSetupDeliveryInput;
    }
  | {
      action: typeof AUTH_ADMIN_MUTATION_ACTIONS.revokeUserSessions;
      confirmation: typeof AUTH_ADMIN_MUTATION_ACTIONS.revokeUserSessions;
      userId: string;
    };

export interface AuthAdminChannelsResponse {
  channels: AuthInvitationChannelSummary[];
}

export interface AuthAdminUsersResponse {
  users: AuthAdminUserSummary[];
}

export interface AuthAdminAuditResponse {
  events: AuthAuditEventSummary[];
}
