import { z } from "@brains/utils/zod";
import {
  isSameOriginRequest,
  privateJsonResponse,
  readJsonRequest,
} from "./http-responses";
import {
  AUTH_ADMIN_IDENTITY_TYPES,
  AUTH_ADMIN_MUTATION_ACTIONS,
  AUTH_USER_ROLES,
  AUTH_USER_STATUSES,
  type AgentPersonClaimInput,
  type AuthAdminPrincipal,
  type AuthAdminUserSummary,
  type AuthAgentPersonReconciliationResponse,
  type AuthIdentitySummary,
  type AuthPasskeySummary,
} from "./admin-contracts";
import type {
  AuthIdentityType,
  AuthUserRole,
  AuthUserStatus,
} from "./user-store";

export interface AuthAdminOperations {
  resolveSession(request: Request): Promise<AuthAdminPrincipal | undefined>;
  listUsers(): Promise<AuthAdminPrincipal[]>;
  listAdminUsers?(): Promise<AuthAdminUserSummary[]>;
  reconcileAgentPersonClaims(
    claims: AgentPersonClaimInput[],
  ): Promise<AuthAgentPersonReconciliationResponse>;
  listPersonAgents(personId: string): Promise<
    Array<{
      agentId: string;
      personId: string;
      status: "pending" | "active" | "revoked";
      createdByUserId: string | null;
      consentedByUserId: string | null;
      createdAt: number;
      updatedAt: number;
    }>
  >;
  listUserIdentities(userId: string): Promise<AuthIdentitySummary[]>;
  listUserPasskeys(userId: string): Promise<AuthPasskeySummary[]>;
  createUser(
    input: {
      displayName: string;
      role: AuthUserRole;
      status: AuthUserStatus;
    },
    actorUserId: string,
  ): Promise<AuthAdminPrincipal>;
  promoteAgentPerson(
    input: {
      agentId: string;
      displayName: string;
      profileEntityId?: string;
      role: AuthUserRole;
      claims?: Array<{
        type: "discord" | "mcp" | "oauth" | "email" | "did";
        subject: string;
        issuer?: string | undefined;
        label?: string | undefined;
        visibility?: "private" | "trusted" | "public" | undefined;
      }>;
    },
    actorUserId: string,
  ): Promise<{
    user: AuthAdminPrincipal;
    representation: {
      agentId: string;
      personId: string;
      status: "pending" | "active" | "revoked";
    };
    registration: { setupUrl: string; expiresAt: number };
  }>;
  linkAgentPerson(
    input: {
      agentId: string;
      userId: string;
      claims?: Array<{
        type: "discord" | "mcp" | "oauth" | "email" | "did";
        subject: string;
        issuer?: string | undefined;
        label?: string | undefined;
        visibility?: "private" | "trusted" | "public" | undefined;
      }>;
    },
    actorUserId: string,
  ): Promise<{
    agentId: string;
    personId: string;
    status: "pending" | "active" | "revoked";
    createdByUserId: string | null;
    consentedByUserId: string | null;
    createdAt: number;
    updatedAt: number;
  }>;
  updateUserRole(
    userId: string,
    role: AuthUserRole,
    actorUserId: string,
  ): Promise<AuthAdminPrincipal>;
  updateUserStatus(
    userId: string,
    status: AuthUserStatus,
    actorUserId: string,
  ): Promise<AuthAdminPrincipal>;
  attachIdentity(
    input: {
      userId: string;
      type: AuthIdentityType;
      subject: string;
      issuer?: string;
      label?: string;
      verifiedAt: number;
    },
    actorUserId: string,
  ): Promise<AuthIdentitySummary>;
  detachIdentity(
    identityId: string,
    actorUserId: string,
  ): Promise<AuthIdentitySummary>;
  revokePasskey(credentialId: string, actorUserId: string): Promise<void>;
  startPasskeyRegistration(
    userId: string,
    actorUserId: string,
  ): Promise<{ setupUrl: string; expiresAt: number }>;
  revokeUserSessionsAndRefreshTokens(
    userId: string,
    actorUserId: string,
  ): Promise<{ sessions: number; refreshTokens: number }>;
}

const roleSchema = z.enum(AUTH_USER_ROLES);
const statusSchema = z.enum(AUTH_USER_STATUSES);
const identityTypeSchema = z.enum(AUTH_ADMIN_IDENTITY_TYPES);

const agentPersonClaimSchema = z.strictObject({
  type: z.enum(["discord", "mcp", "oauth", "email", "did"]),
  subject: z.string().trim().min(1).max(2_000),
  issuer: z.string().trim().min(1).max(2_000).optional(),
  label: z.string().trim().min(1).max(200).optional(),
  visibility: z.enum(["private", "trusted", "public"]).optional(),
});

const adminMutationSchema = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal(AUTH_ADMIN_MUTATION_ACTIONS.createUser),
    confirmation: z.literal(AUTH_ADMIN_MUTATION_ACTIONS.createUser),
    displayName: z.string().trim().min(1).max(200),
    role: roleSchema,
    status: statusSchema.default("active"),
  }),
  z.strictObject({
    action: z.literal(AUTH_ADMIN_MUTATION_ACTIONS.promoteAgentPerson),
    confirmation: z.literal(AUTH_ADMIN_MUTATION_ACTIONS.promoteAgentPerson),
    agentId: z.string().trim().min(1).max(500),
    displayName: z.string().trim().min(1).max(200),
    profileEntityId: z.string().trim().min(1).max(500).optional(),
    role: roleSchema,
    claims: z.array(agentPersonClaimSchema).max(10).optional(),
  }),
  z.strictObject({
    action: z.literal(AUTH_ADMIN_MUTATION_ACTIONS.linkAgentPerson),
    confirmation: z.literal(AUTH_ADMIN_MUTATION_ACTIONS.linkAgentPerson),
    agentId: z.string().trim().min(1).max(500),
    userId: z.string().min(1),
    claims: z.array(agentPersonClaimSchema).max(10).optional(),
  }),
  z.strictObject({
    action: z.literal(AUTH_ADMIN_MUTATION_ACTIONS.updateUserRole),
    confirmation: z.literal(AUTH_ADMIN_MUTATION_ACTIONS.updateUserRole),
    userId: z.string().min(1),
    role: roleSchema,
  }),
  z.strictObject({
    action: z.literal(AUTH_ADMIN_MUTATION_ACTIONS.updateUserStatus),
    confirmation: z.literal(AUTH_ADMIN_MUTATION_ACTIONS.updateUserStatus),
    userId: z.string().min(1),
    status: statusSchema,
  }),
  z.strictObject({
    action: z.literal(AUTH_ADMIN_MUTATION_ACTIONS.attachIdentity),
    confirmation: z.literal(AUTH_ADMIN_MUTATION_ACTIONS.attachIdentity),
    userId: z.string().min(1),
    type: identityTypeSchema,
    subject: z.string().trim().min(1).max(2_000),
    issuer: z.string().trim().min(1).max(2_000).optional(),
    label: z.string().trim().min(1).max(200).optional(),
  }),
  z.strictObject({
    action: z.literal(AUTH_ADMIN_MUTATION_ACTIONS.detachIdentity),
    confirmation: z.literal(AUTH_ADMIN_MUTATION_ACTIONS.detachIdentity),
    identityId: z.string().min(1),
  }),
  z.strictObject({
    action: z.literal(AUTH_ADMIN_MUTATION_ACTIONS.revokePasskey),
    confirmation: z.literal(AUTH_ADMIN_MUTATION_ACTIONS.revokePasskey),
    credentialId: z.string().min(1),
  }),
  z.strictObject({
    action: z.literal(AUTH_ADMIN_MUTATION_ACTIONS.startPasskeyRegistration),
    confirmation: z.literal(
      AUTH_ADMIN_MUTATION_ACTIONS.startPasskeyRegistration,
    ),
    userId: z.string().min(1),
  }),
  z.strictObject({
    action: z.literal(AUTH_ADMIN_MUTATION_ACTIONS.revokeUserSessions),
    confirmation: z.literal(AUTH_ADMIN_MUTATION_ACTIONS.revokeUserSessions),
    userId: z.string().min(1),
  }),
]);

type AdminMutation = z.infer<typeof adminMutationSchema>;

export async function handleAuthAdminRequest(
  request: Request,
  operations: AuthAdminOperations,
): Promise<Response> {
  const principal = await operations.resolveSession(request);
  if (!principal) {
    return privateJsonResponse({ error: "Authentication required" }, 401);
  }
  if (principal.permissionLevel !== "anchor") {
    return privateJsonResponse({ error: "Anchor access required" }, 403);
  }

  const path = new URL(request.url).pathname;
  if (request.method === "GET" && path === "/auth/admin/users") {
    const users = operations.listAdminUsers
      ? await operations.listAdminUsers()
      : await listAdminUsersCompat(operations);
    return privateJsonResponse({ users });
  }

  if (request.method === "POST" && path === "/auth/admin/reconciliation") {
    if (!isSameOriginRequest(request)) {
      return privateJsonResponse(
        { error: "Same-origin request required" },
        403,
      );
    }
    if (!request.headers.get("content-type")?.startsWith("application/json")) {
      return privateJsonResponse({ error: "JSON request required" }, 415);
    }

    const parsed = z
      .strictObject({ claims: z.array(agentPersonClaimSchema).min(1).max(10) })
      .safeParse(await readJsonRequest(request));
    if (!parsed.success) {
      return privateJsonResponse(
        { error: "Invalid identity reconciliation request" },
        400,
      );
    }

    try {
      return privateJsonResponse(
        await operations.reconcileAgentPersonClaims(parsed.data.claims),
      );
    } catch (error) {
      return privateJsonResponse(
        {
          error:
            error instanceof Error ? error.message : "Reconciliation failed",
        },
        400,
      );
    }
  }

  if (request.method === "POST" && path === "/auth/admin/mutations") {
    if (!isSameOriginRequest(request)) {
      return privateJsonResponse(
        { error: "Same-origin request required" },
        403,
      );
    }
    if (!request.headers.get("content-type")?.startsWith("application/json")) {
      return privateJsonResponse({ error: "JSON request required" }, 415);
    }

    const parsed = adminMutationSchema.safeParse(
      await readJsonRequest(request),
    );
    if (!parsed.success) {
      return privateJsonResponse(
        { error: "Invalid or unconfirmed auth mutation" },
        400,
      );
    }

    try {
      return privateJsonResponse(
        await executeMutation(parsed.data, principal.userId, operations),
      );
    } catch (error) {
      return privateJsonResponse(
        { error: error instanceof Error ? error.message : "Mutation failed" },
        400,
      );
    }
  }

  return privateJsonResponse({ error: "Not Found" }, 404);
}

async function listAdminUsersCompat(
  operations: AuthAdminOperations,
): Promise<AuthAdminUserSummary[]> {
  const users = await operations.listUsers();
  return Promise.all(
    users.map(async (user) => ({
      ...user,
      identities: await operations.listUserIdentities(user.userId),
      passkeys: await operations.listUserPasskeys(user.userId),
      agents: await operations.listPersonAgents(user.personId),
    })),
  );
}

async function executeMutation(
  mutation: AdminMutation,
  actorUserId: string,
  operations: AuthAdminOperations,
): Promise<Record<string, unknown>> {
  switch (mutation.action) {
    case "createUser":
      return {
        user: await operations.createUser(
          {
            displayName: mutation.displayName,
            role: mutation.role,
            status: mutation.status,
          },
          actorUserId,
        ),
      };
    case "promoteAgentPerson":
      return operations.promoteAgentPerson(
        {
          agentId: mutation.agentId,
          displayName: mutation.displayName,
          ...(mutation.profileEntityId
            ? { profileEntityId: mutation.profileEntityId }
            : {}),
          role: mutation.role,
          ...(mutation.claims ? { claims: mutation.claims } : {}),
        },
        actorUserId,
      );
    case "linkAgentPerson":
      return {
        representation: await operations.linkAgentPerson(
          {
            agentId: mutation.agentId,
            userId: mutation.userId,
            ...(mutation.claims ? { claims: mutation.claims } : {}),
          },
          actorUserId,
        ),
      };
    case "updateUserRole":
      return {
        user: await operations.updateUserRole(
          mutation.userId,
          mutation.role,
          actorUserId,
        ),
      };
    case "updateUserStatus":
      return {
        user: await operations.updateUserStatus(
          mutation.userId,
          mutation.status,
          actorUserId,
        ),
      };
    case "attachIdentity": {
      const label = safeIdentityLabel(
        mutation.type,
        mutation.subject,
        mutation.label,
      );
      return {
        identity: await operations.attachIdentity(
          {
            userId: mutation.userId,
            type: mutation.type,
            subject: mutation.subject,
            ...(mutation.issuer ? { issuer: mutation.issuer } : {}),
            ...(label ? { label } : {}),
            verifiedAt: Date.now(),
          },
          actorUserId,
        ),
      };
    }
    case "detachIdentity":
      return {
        identity: await operations.detachIdentity(
          mutation.identityId,
          actorUserId,
        ),
      };
    case "revokePasskey":
      await operations.revokePasskey(mutation.credentialId, actorUserId);
      return { credentialId: mutation.credentialId, revoked: true };
    case "startPasskeyRegistration":
      return {
        registration: await operations.startPasskeyRegistration(
          mutation.userId,
          actorUserId,
        ),
      };
    case "revokeUserSessions":
      return {
        userId: mutation.userId,
        revoked: await operations.revokeUserSessionsAndRefreshTokens(
          mutation.userId,
          actorUserId,
        ),
      };
  }
}

function safeIdentityLabel(
  type: AuthIdentityType,
  subject: string,
  label?: string,
): string | undefined {
  if (type === "email") {
    const [localPart, domain] = subject.trim().toLowerCase().split("@", 2);
    if (!localPart || !domain) return undefined;
    return `${localPart.slice(0, 1)}***@${domain}`;
  }
  const trimmedLabel = label?.trim();
  if (!trimmedLabel) return undefined;
  return trimmedLabel.toLowerCase().includes(subject.trim().toLowerCase())
    ? undefined
    : trimmedLabel;
}
