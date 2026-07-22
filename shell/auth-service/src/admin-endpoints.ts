import { z } from "@brains/utils/zod";
import {
  errorMessage,
  privateJsonResponse,
  readJsonRequest,
  requireSameOriginJson,
} from "./http-responses";
import {
  AUTH_ADMIN_IDENTITY_TYPES,
  AUTH_ADMIN_MUTATION_ACTIONS,
  AUTH_USER_ROLES,
  AUTH_USER_STATUSES,
  type AuthAdminPrincipal,
  type AuthAuditEventSummary,
  type AuthAdminUserSummary,
  type AuthIdentityProposalInput,
  type AuthIdentityReconciliationResponse,
  type AuthBrainAnchorSummary,
  type AuthExternalPeerSummary,
  type AuthIdentitySummary,
  type AuthInterfacePrincipalGrantSummary,
  type AuthPasskeySummary,
  type AuthSetupDeliveryInput,
} from "./admin-contracts";
import type { AuthIdentityType } from "./identity-store";
import { AuthRouteTable, type AuthRoute } from "./route-table";
import type { AuthUserRole, AuthUserStatus } from "./user-store";

export interface AuthAdminOperations {
  resolveSession(request: Request): Promise<AuthAdminPrincipal | undefined>;
  listUsers(): Promise<AuthAdminPrincipal[]>;
  getBrainAnchor(): Promise<AuthBrainAnchorSummary>;
  listAuditEvents(): Promise<AuthAuditEventSummary[]>;
  listInterfaceGrants(): Promise<AuthInterfacePrincipalGrantSummary[]>;
  listAdminUsers?(): Promise<AuthAdminUserSummary[]>;
  reconcileIdentityProposals(
    claims: AuthIdentityProposalInput[],
  ): Promise<AuthIdentityReconciliationResponse>;
  listPersonExternalPeers(personId: string): Promise<AuthExternalPeerSummary[]>;
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
  inviteExternalPeerPerson(
    input: {
      peerId: string;
      displayName: string;
      role: "admin" | "trusted";
      delivery: AuthSetupDeliveryInput;
    },
    actorUserId: string,
  ): Promise<{
    user: AuthAdminPrincipal;
    peer: AuthExternalPeerSummary;
    registration: { setupUrl: string; expiresAt: number };
  }>;
  linkExternalPeer(
    input: { peerId: string; userId: string },
    actorUserId: string,
  ): Promise<AuthExternalPeerSummary>;
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
    delivery?: AuthSetupDeliveryInput,
  ): Promise<{ setupUrl: string; expiresAt: number }>;
  revokeUserSessionsAndRefreshTokens(
    userId: string,
    actorUserId: string,
  ): Promise<{ sessions: number; refreshTokens: number }>;
  upsertInterfaceGrant(
    input: {
      interfaceType: string;
      subject: string;
      label: string;
      permissionLevel: "admin" | "trusted";
    },
    actorUserId: string,
  ): Promise<AuthInterfacePrincipalGrantSummary>;
  revokeInterfaceGrant(
    grantId: string,
    actorUserId: string,
  ): Promise<AuthInterfacePrincipalGrantSummary>;
}

const roleSchema: z.ZodType<AuthUserRole, AuthUserRole> =
  z.enum(AUTH_USER_ROLES);
const statusSchema = z.enum(AUTH_USER_STATUSES);
const identityTypeSchema = z.enum(AUTH_ADMIN_IDENTITY_TYPES);

const setupDeliverySchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("email"),
    subject: z.string().trim().email().max(320),
  }),
  z.strictObject({
    type: z.literal("discord"),
    subject: z.string().trim().min(1).max(200),
    label: z.string().trim().min(1).max(200),
  }),
]);

const identityProposalSchema = z.strictObject({
  type: z.enum(["discord", "mcp", "oauth", "email", "did"]),
  subject: z.string().trim().min(1).max(2_000),
  issuer: z.string().trim().min(1).max(2_000).optional(),
  label: z.string().trim().min(1).max(200).optional(),
  visibility: z.enum(["private", "trusted", "public"]).optional(),
});

const adminMutationSchema = z.union([
  z.strictObject({
    action: z.literal(AUTH_ADMIN_MUTATION_ACTIONS.createUser),
    confirmation: z.literal(AUTH_ADMIN_MUTATION_ACTIONS.createUser),
    displayName: z.string().trim().min(1).max(200),
    role: roleSchema,
    status: statusSchema.default("active"),
  }),
  z.strictObject({
    action: z.literal(AUTH_ADMIN_MUTATION_ACTIONS.inviteExternalPeerPerson),
    confirmation: z.literal(
      AUTH_ADMIN_MUTATION_ACTIONS.inviteExternalPeerPerson,
    ),
    peerId: z.string().trim().min(1).max(2_000),
    displayName: z.string().trim().min(1).max(200),
    role: z.enum(["admin", "trusted"]),
    delivery: setupDeliverySchema,
  }),
  z.strictObject({
    action: z.literal(AUTH_ADMIN_MUTATION_ACTIONS.linkExternalPeer),
    confirmation: z.literal(AUTH_ADMIN_MUTATION_ACTIONS.linkExternalPeer),
    peerId: z.string().trim().min(1).max(2_000),
    userId: z.string().min(1),
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
    delivery: setupDeliverySchema.optional(),
  }),
  z.strictObject({
    action: z.literal(AUTH_ADMIN_MUTATION_ACTIONS.revokeUserSessions),
    confirmation: z.literal(AUTH_ADMIN_MUTATION_ACTIONS.revokeUserSessions),
    userId: z.string().min(1),
  }),
  z.strictObject({
    action: z.literal(AUTH_ADMIN_MUTATION_ACTIONS.upsertInterfaceGrant),
    confirmation: z.literal(AUTH_ADMIN_MUTATION_ACTIONS.upsertInterfaceGrant),
    interfaceType: z
      .string()
      .trim()
      .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/),
    subject: z.string().trim().min(1).max(2_000),
    label: z.string().trim().min(1).max(200),
    permissionLevel: z.enum(["admin", "trusted"]),
  }),
  z.strictObject({
    action: z.literal(AUTH_ADMIN_MUTATION_ACTIONS.revokeInterfaceGrant),
    confirmation: z.literal(AUTH_ADMIN_MUTATION_ACTIONS.revokeInterfaceGrant),
    grantId: z.string().min(1).max(200),
  }),
]);

type AdminMutation = z.infer<typeof adminMutationSchema>;

interface AdminRouteContext {
  operations: AuthAdminOperations;
  principal: AuthAdminPrincipal;
}

const adminRoutes = new AuthRouteTable<AdminRouteContext>([
  {
    method: "GET",
    path: "/auth/admin/anchor",
    handler: async (_request, context): Promise<Response> =>
      privateJsonResponse({
        anchor: await context.operations.getBrainAnchor(),
      }),
  },
  {
    method: "GET",
    path: "/auth/admin/users",
    handler: async (_request, context): Promise<Response> => {
      const users = context.operations.listAdminUsers
        ? await context.operations.listAdminUsers()
        : await listAdminUsersCompat(context.operations);
      return privateJsonResponse({ users });
    },
  },
  {
    method: "GET",
    path: "/auth/admin/audit",
    handler: async (_request, context): Promise<Response> =>
      privateJsonResponse({
        events: await context.operations.listAuditEvents(),
      }),
  },
  {
    method: "GET",
    path: "/auth/admin/interface-grants",
    handler: async (_request, context): Promise<Response> =>
      privateJsonResponse({
        grants: await context.operations.listInterfaceGrants(),
      }),
  },
  {
    method: "POST",
    path: "/auth/admin/reconciliation",
    handler: handleReconciliationRequest,
  },
  {
    method: "POST",
    path: "/auth/admin/mutations",
    handler: handleMutationRequest,
  },
] satisfies AuthRoute<AdminRouteContext>[]);

export async function handleAuthAdminRequest(
  request: Request,
  operations: AuthAdminOperations,
): Promise<Response> {
  const principal = await operations.resolveSession(request);
  if (!principal) {
    return privateJsonResponse({ error: "Authentication required" }, 401);
  }
  if (principal.permissionLevel !== "admin") {
    return privateJsonResponse({ error: "Admin access required" }, 403);
  }

  return (
    (await adminRoutes.dispatch(request, { operations, principal })) ??
    privateJsonResponse({ error: "Not Found" }, 404)
  );
}

async function handleReconciliationRequest(
  request: Request,
  context: AdminRouteContext,
): Promise<Response> {
  const requestError = requireSameOriginJson(request);
  if (requestError) return requestError;

  const parsed = z
    .strictObject({ claims: z.array(identityProposalSchema).min(1).max(10) })
    .safeParse(await readJsonRequest(request));
  if (!parsed.success) {
    return privateJsonResponse(
      { error: "Invalid identity reconciliation request" },
      400,
    );
  }

  try {
    return privateJsonResponse(
      await context.operations.reconcileIdentityProposals(parsed.data.claims),
    );
  } catch (error) {
    return privateJsonResponse(
      { error: errorMessage(error, "Reconciliation failed") },
      400,
    );
  }
}

async function handleMutationRequest(
  request: Request,
  context: AdminRouteContext,
): Promise<Response> {
  const requestError = requireSameOriginJson(request);
  if (requestError) return requestError;

  const parsed = adminMutationSchema.safeParse(await readJsonRequest(request));
  if (!parsed.success) {
    return privateJsonResponse(
      { error: "Invalid or unconfirmed auth mutation" },
      400,
    );
  }

  try {
    return privateJsonResponse(
      await executeMutation(
        parsed.data,
        context.principal.userId,
        context.operations,
      ),
    );
  } catch (error) {
    return privateJsonResponse(
      { error: errorMessage(error, "Mutation failed") },
      400,
    );
  }
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
      externalPeers: await operations.listPersonExternalPeers(user.personId),
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
    case "inviteExternalPeerPerson":
      return operations.inviteExternalPeerPerson(
        {
          peerId: mutation.peerId,
          displayName: mutation.displayName,
          role: mutation.role,
          delivery: mutation.delivery,
        },
        actorUserId,
      );
    case "linkExternalPeer":
      return {
        peer: await operations.linkExternalPeer(
          { peerId: mutation.peerId, userId: mutation.userId },
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
          mutation.delivery,
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
    case "upsertInterfaceGrant":
      return {
        grant: await operations.upsertInterfaceGrant(
          {
            interfaceType: mutation.interfaceType,
            subject: mutation.subject,
            label: mutation.label,
            permissionLevel: mutation.permissionLevel,
          },
          actorUserId,
        ),
      };
    case "revokeInterfaceGrant":
      await operations.revokeInterfaceGrant(mutation.grantId, actorUserId);
      return { grantId: mutation.grantId, revoked: true };
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
    return `${localPart}@${domain}`;
  }
  const trimmedLabel = label?.trim();
  if (!trimmedLabel) return undefined;
  return trimmedLabel.toLowerCase().includes(subject.trim().toLowerCase())
    ? undefined
    : trimmedLabel;
}
