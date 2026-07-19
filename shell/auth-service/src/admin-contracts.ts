/** Browser-safe auth administration vocabulary and response contracts. */
export const AUTH_USER_ROLES = ["admin", "trusted", "public"] as const;
export const AUTH_USER_STATUSES = ["active", "invited", "suspended"] as const;
export const AUTH_BRAIN_ANCHOR_KINDS = ["person", "collective"] as const;
export const AUTH_ADMIN_IDENTITY_TYPES = [
  "discord",
  "mcp",
  "oauth",
  "email",
  "did",
  "a2a",
] as const;
export const AUTH_REPRESENTATION_MUTATION_ACTIONS = {
  acceptRepresentation: "acceptRepresentation",
} as const;
export const AUTH_ADMIN_MUTATION_ACTIONS = {
  createUser: "createUser",
  updateBrainAnchor: "updateBrainAnchor",
  promoteAgentPerson: "promoteAgentPerson",
  linkAgentPerson: "linkAgentPerson",
  updateUserRole: "updateUserRole",
  updateUserStatus: "updateUserStatus",
  attachIdentity: "attachIdentity",
  detachIdentity: "detachIdentity",
  revokePasskey: "revokePasskey",
  startPasskeyRegistration: "startPasskeyRegistration",
  revokeUserSessions: "revokeUserSessions",
} as const;

export type AuthAdminRole = (typeof AUTH_USER_ROLES)[number];
export type AuthAdminStatus = (typeof AUTH_USER_STATUSES)[number];
export type AuthBrainAnchorKind = (typeof AUTH_BRAIN_ANCHOR_KINDS)[number];
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

export interface AuthPasskeySummary {
  id: string;
  userId: string;
  transports?: string[];
  credentialDeviceType?: string;
  credentialBackedUp: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface AuthAgentPersonSummary {
  agentId: string;
  personId: string;
  status: "pending" | "active" | "revoked";
  createdByUserId: string | null;
  consentedByUserId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface AuthAdminUserSummary extends AuthAdminPrincipal {
  profileEntityId?: string;
  identities: AuthIdentitySummary[];
  passkeys: AuthPasskeySummary[];
  agents: AuthAgentPersonSummary[];
}

export interface AuthBrainAnchorSummary {
  kind: AuthBrainAnchorKind;
  subjectId: string;
  displayName: string;
  personId?: string;
  profileEntityId?: string;
  administeredBy: number;
}

export interface AuthBrainAnchorResponse {
  anchor: AuthBrainAnchorSummary;
}

export interface AgentPersonClaimInput {
  type: "discord" | "mcp" | "oauth" | "email" | "did";
  subject: string;
  issuer?: string | undefined;
  label?: string | undefined;
  visibility?: AuthIdentityVisibility | undefined;
}

export interface AuthAgentPersonReconciliationOwner {
  personId: string;
  userId?: string;
  displayName?: string;
  status?: AuthAdminStatus;
}

export interface AuthAgentPersonClaimReconciliation {
  index: number;
  type: AgentPersonClaimInput["type"];
  label?: string;
  state: "unbound" | "asserted_match" | "verified_match";
  owner?: AuthAgentPersonReconciliationOwner;
}

export interface AuthAgentPersonReconciliationRequest {
  claims: AgentPersonClaimInput[];
}

export interface AuthAgentPersonReconciliationResponse {
  state:
    "unique_verified_match" | "cross_person_conflict" | "no_verified_match";
  suggestedUserId?: string;
  claims: AuthAgentPersonClaimReconciliation[];
}

export type AuthAdminMutation =
  | {
      action: typeof AUTH_ADMIN_MUTATION_ACTIONS.updateBrainAnchor;
      confirmation: typeof AUTH_ADMIN_MUTATION_ACTIONS.updateBrainAnchor;
      kind: "person";
      userId: string;
    }
  | {
      action: typeof AUTH_ADMIN_MUTATION_ACTIONS.updateBrainAnchor;
      confirmation: typeof AUTH_ADMIN_MUTATION_ACTIONS.updateBrainAnchor;
      kind: "collective";
      displayName: string;
      profileEntityId?: string;
    }
  | {
      action: typeof AUTH_ADMIN_MUTATION_ACTIONS.createUser;
      confirmation: typeof AUTH_ADMIN_MUTATION_ACTIONS.createUser;
      displayName: string;
      role: AuthAdminRole;
      status: AuthAdminStatus;
    }
  | {
      action: typeof AUTH_ADMIN_MUTATION_ACTIONS.promoteAgentPerson;
      confirmation: typeof AUTH_ADMIN_MUTATION_ACTIONS.promoteAgentPerson;
      agentId: string;
      displayName: string;
      profileEntityId?: string;
      role: AuthAdminRole;
      claims?: AgentPersonClaimInput[];
    }
  | {
      action: typeof AUTH_ADMIN_MUTATION_ACTIONS.linkAgentPerson;
      confirmation: typeof AUTH_ADMIN_MUTATION_ACTIONS.linkAgentPerson;
      agentId: string;
      userId: string;
      claims?: AgentPersonClaimInput[];
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
    }
  | {
      action: typeof AUTH_ADMIN_MUTATION_ACTIONS.revokeUserSessions;
      confirmation: typeof AUTH_ADMIN_MUTATION_ACTIONS.revokeUserSessions;
      userId: string;
    };

export interface AuthAdminUsersResponse {
  users: AuthAdminUserSummary[];
}

export interface AuthRepresentationsResponse {
  representations: AuthAgentPersonSummary[];
}

export interface AuthRepresentationMutation {
  action: typeof AUTH_REPRESENTATION_MUTATION_ACTIONS.acceptRepresentation;
  confirmation: typeof AUTH_REPRESENTATION_MUTATION_ACTIONS.acceptRepresentation;
  agentId: string;
}
