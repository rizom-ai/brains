/** Browser-safe auth administration vocabulary and response contracts. */
export const AUTH_USER_ROLES = ["admin", "trusted", "public"] as const;
export const AUTH_USER_STATUSES = ["active", "invited", "suspended"] as const;
export const AUTH_BRAIN_ANCHOR_KINDS = ["person", "collective"] as const;
export const AUTH_BRAIN_ANCHOR_CONFIG_KINDS = [
  "person",
  "team",
  "organization",
] as const;
export const AUTH_ADMIN_IDENTITY_TYPES = [
  "discord",
  "mcp",
  "oauth",
  "email",
  "did",
  "a2a",
] as const;
export const AUTH_ADMIN_MUTATION_ACTIONS = {
  createUser: "createUser",
  inviteExternalPeerPerson: "inviteExternalPeerPerson",
  linkExternalPeer: "linkExternalPeer",
  updateUserRole: "updateUserRole",
  updateUserStatus: "updateUserStatus",
  attachIdentity: "attachIdentity",
  detachIdentity: "detachIdentity",
  revokePasskey: "revokePasskey",
  startPasskeyRegistration: "startPasskeyRegistration",
  revokeUserSessions: "revokeUserSessions",
  upsertInterfaceGrant: "upsertInterfaceGrant",
  revokeInterfaceGrant: "revokeInterfaceGrant",
} as const;

export type AuthAdminRole = (typeof AUTH_USER_ROLES)[number];
export type AuthAdminStatus = (typeof AUTH_USER_STATUSES)[number];
export type AuthBrainAnchorKind = (typeof AUTH_BRAIN_ANCHOR_KINDS)[number];
export type AuthBrainAnchorConfigKind =
  (typeof AUTH_BRAIN_ANCHOR_CONFIG_KINDS)[number];
export type AuthAdminIdentityType =
  "passkey" | (typeof AUTH_ADMIN_IDENTITY_TYPES)[number];
export type AuthAdminMutationAction =
  (typeof AUTH_ADMIN_MUTATION_ACTIONS)[keyof typeof AUTH_ADMIN_MUTATION_ACTIONS];
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

export interface AuthInterfacePrincipalGrantSummary {
  id: string;
  interfaceType: string;
  label: string;
  permissionLevel: Extract<AuthAdminRole, "admin" | "trusted">;
  source: "config" | "admin";
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

export interface AuthAdminUserSummary extends AuthAdminPrincipal {
  profileEntityId?: string;
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

export type AuthSetupDeliveryInput =
  | { type: "email"; subject: string }
  | { type: "discord"; subject: string; label: string };

export interface AuthIdentityProposalInput {
  type: "discord" | "mcp" | "oauth" | "email" | "did";
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
    }
  | {
      action: typeof AUTH_ADMIN_MUTATION_ACTIONS.upsertInterfaceGrant;
      confirmation: typeof AUTH_ADMIN_MUTATION_ACTIONS.upsertInterfaceGrant;
      interfaceType: string;
      subject: string;
      label: string;
      permissionLevel: Extract<AuthAdminRole, "admin" | "trusted">;
    }
  | {
      action: typeof AUTH_ADMIN_MUTATION_ACTIONS.revokeInterfaceGrant;
      confirmation: typeof AUTH_ADMIN_MUTATION_ACTIONS.revokeInterfaceGrant;
      grantId: string;
    };

export interface AuthAdminUsersResponse {
  users: AuthAdminUserSummary[];
}

export interface AuthAdminAuditResponse {
  events: AuthAuditEventSummary[];
}

export interface AuthAdminInterfaceGrantsResponse {
  grants: AuthInterfacePrincipalGrantSummary[];
}
