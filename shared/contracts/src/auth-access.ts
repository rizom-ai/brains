/** What plugins see of the brain's people, sessions, audit log and A2A trust. */
import type {
  AuthAdminRole,
  AuthAdminStatus,
  AuthIdentitySourceKind,
  AuthIdentityVisibility,
  AuthInvitationSummary,
  AuthSetupDeliveryInput,
} from "./auth-admin";
import type { JsonObject } from "./json";

export interface AuthPrincipal {
  userId: string;
  personId: string;
  displayName: string;
  role: AuthAdminRole;
  status: AuthAdminStatus;
  permissionLevel: AuthAdminRole;
  isAnchor: boolean;
  canonicalId?: string;
}

export type AuthIdentityAccessResolution =
  | { state: "resolved"; principal: AuthPrincipal }
  | { state: "denied" }
  | { state: "unbound" };

export interface VerifiedAccessToken {
  subject: string;
  issuer: string;
  audience: string | string[] | undefined;
  scope: string[];
  claims: Record<string, unknown>;
}

export interface AuthBearerGrant {
  principal: AuthPrincipal;
  token: VerifiedAccessToken;
}

export interface AuthMutationContext {
  /** Authenticated user performing the mutation, for audit attribution. */
  actorUserId?: string;
}

export interface AppendAuthAuditEventInput {
  actorUserId?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

export interface AuthAuditEvent {
  id: string;
  actorUserId?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
}

export interface AuthAuditQuery {
  actorUserId?: string | undefined;
  action?: string | undefined;
  selectedId?: string | undefined;
  offset: number;
  limit: number;
}

export interface AuthAuditActionCount {
  action: string;
  count: number;
}

export interface AuthAuditQueryResult {
  events: AuthAuditEvent[];
  selectedEvent?: AuthAuditEvent | undefined;
  actions: AuthAuditActionCount[];
  total: number;
}

export interface A2APeerTrustRecord {
  domain: string;
  keyFingerprint: string;
  grantedLevel: "public" | "trusted";
}

export interface GrantA2APeerTrustInput {
  domain: string;
  keyFingerprint: string;
  grantedLevel: "public" | "trusted" | "admin";
}

export interface A2APublicJwk extends JsonObject {
  kty: "OKP";
  crv: "Ed25519";
  x: string;
  kid: string;
  use: "sig";
  alg: "EdDSA";
}

export interface A2APrivateJwk extends A2APublicJwk {
  d: string;
}

export interface A2ASigningKey {
  privateJwk: A2APrivateJwk;
  keyId: string;
}

export interface ResolveAuthIdentityInput {
  type: string;
  subject: string;
  issuer?: string;
}

export interface AttachAuthIdentityInput {
  userId: string;
  type: string;
  subject: string;
  issuer?: string;
  deliverySubject?: string;
  label?: string;
  visibility?: AuthIdentityVisibility;
  verifiedAt?: number;
  source?: { kind: AuthIdentitySourceKind; id?: string };
}

export interface CreateInvitationRequest {
  idempotencyKey: string;
  displayName: string;
  role: "admin" | "trusted";
  delivery: AuthSetupDeliveryInput;
  peerId?: string;
}

export interface InviteExternalPeerPersonRequest {
  peerId: string;
  displayName: string;
  role: "admin" | "trusted";
  delivery: AuthSetupDeliveryInput;
}

export interface LinkExternalPeerRequest {
  peerId: string;
  userId: string;
}

export interface UnlinkExternalPeerRequest {
  peerId: string;
  userId: string;
}

export interface UserPasskeyRegistration {
  setupUrl: string;
  expiresAt: number;
  delivery: {
    type: string;
    label: string;
  };
}

/** A created or resent invitation, with its setup link when one was issued. */
export interface AuthInvitationAccess {
  invitation: AuthInvitationSummary;
  user: AuthPrincipal;
  registration?: {
    setupUrl: string;
    expiresAt: number;
    deliveryAttemptId: string;
  };
}

/** A person created for an external peer, linked and sent a passkey setup. */
export interface AuthExternalPeerInvitationAccess {
  user: AuthPrincipal;
  peer: { peerId: string };
  registration: UserPasskeyRegistration;
}

/** A brain member as people fields offer them: an id and a name. */
export interface AssignableMember {
  id: string;
  name: string;
}

/** Who work can be assigned to: everyone but suspended people, by name. */
export function assignableMembers(
  people: readonly Pick<AuthPrincipal, "userId" | "displayName" | "status">[],
): AssignableMember[] {
  return people
    .filter((person) => person.status !== "suspended")
    .map((person) => ({ id: person.userId, name: person.displayName }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
