import { z } from "@brains/utils/zod";
import type {
  AuthIdentitySourceKind,
  AuthIdentityType,
  AuthIdentityVisibility,
  AuthUserRole,
  AuthUserStatus,
} from "./user-store";

interface AdminPrincipal {
  userId: string;
  personId: string;
  displayName: string;
  role: AuthUserRole;
  status: AuthUserStatus;
  permissionLevel: AuthUserRole;
  canonicalId?: string;
}

export interface AuthIdentitySummary {
  id: string;
  personId: string;
  userId: string;
  type: AuthIdentityType;
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

export interface AuthAdminOperations {
  resolveSession(request: Request): Promise<AdminPrincipal | undefined>;
  listUsers(): Promise<AdminPrincipal[]>;
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
  ): Promise<AdminPrincipal>;
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
    user: AdminPrincipal;
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
  ): Promise<AdminPrincipal>;
  updateUserStatus(
    userId: string,
    status: AuthUserStatus,
    actorUserId: string,
  ): Promise<AdminPrincipal>;
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

const roleSchema = z.enum(["anchor", "trusted", "public"]);
const statusSchema = z.enum(["active", "invited", "suspended"]);
const identityTypeSchema = z.enum([
  "passkey",
  "discord",
  "mcp",
  "oauth",
  "email",
  "did",
  "a2a",
]);

const agentPersonClaimSchema = z.strictObject({
  type: z.enum(["discord", "mcp", "oauth", "email", "did"]),
  subject: z.string().trim().min(1).max(2_000),
  issuer: z.string().trim().min(1).max(2_000).optional(),
  label: z.string().trim().min(1).max(200).optional(),
  visibility: z.enum(["private", "trusted", "public"]).optional(),
});

const adminMutationSchema = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("createUser"),
    confirmation: z.literal("createUser"),
    displayName: z.string().trim().min(1).max(200),
    role: roleSchema,
    status: statusSchema.default("active"),
  }),
  z.strictObject({
    action: z.literal("promoteAgentPerson"),
    confirmation: z.literal("promoteAgentPerson"),
    agentId: z.string().trim().min(1).max(500),
    displayName: z.string().trim().min(1).max(200),
    profileEntityId: z.string().trim().min(1).max(500).optional(),
    role: roleSchema,
    claims: z.array(agentPersonClaimSchema).max(10).optional(),
  }),
  z.strictObject({
    action: z.literal("linkAgentPerson"),
    confirmation: z.literal("linkAgentPerson"),
    agentId: z.string().trim().min(1).max(500),
    userId: z.string().min(1),
    claims: z.array(agentPersonClaimSchema).max(10).optional(),
  }),
  z.strictObject({
    action: z.literal("updateUserRole"),
    confirmation: z.literal("updateUserRole"),
    userId: z.string().min(1),
    role: roleSchema,
  }),
  z.strictObject({
    action: z.literal("updateUserStatus"),
    confirmation: z.literal("updateUserStatus"),
    userId: z.string().min(1),
    status: statusSchema,
  }),
  z.strictObject({
    action: z.literal("attachIdentity"),
    confirmation: z.literal("attachIdentity"),
    userId: z.string().min(1),
    type: identityTypeSchema.exclude(["passkey"]),
    subject: z.string().trim().min(1).max(2_000),
    issuer: z.string().trim().min(1).max(2_000).optional(),
    label: z.string().trim().min(1).max(200).optional(),
  }),
  z.strictObject({
    action: z.literal("detachIdentity"),
    confirmation: z.literal("detachIdentity"),
    identityId: z.string().min(1),
  }),
  z.strictObject({
    action: z.literal("revokePasskey"),
    confirmation: z.literal("revokePasskey"),
    credentialId: z.string().min(1),
  }),
  z.strictObject({
    action: z.literal("startPasskeyRegistration"),
    confirmation: z.literal("startPasskeyRegistration"),
    userId: z.string().min(1),
  }),
  z.strictObject({
    action: z.literal("revokeUserSessions"),
    confirmation: z.literal("revokeUserSessions"),
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
    return adminJson({ error: "Authentication required" }, 401);
  }
  if (principal.permissionLevel !== "anchor") {
    return adminJson({ error: "Anchor access required" }, 403);
  }

  const path = new URL(request.url).pathname;
  if (request.method === "GET" && path === "/auth/admin/users") {
    const users = await operations.listUsers();
    return adminJson({
      users: await Promise.all(
        users.map(async (user) => ({
          ...user,
          identities: await operations.listUserIdentities(user.userId),
          passkeys: await operations.listUserPasskeys(user.userId),
          agents: await operations.listPersonAgents(user.personId),
        })),
      ),
    });
  }

  if (request.method === "POST" && path === "/auth/admin/mutations") {
    if (!isSameOrigin(request)) {
      return adminJson({ error: "Same-origin request required" }, 403);
    }
    if (!request.headers.get("content-type")?.startsWith("application/json")) {
      return adminJson({ error: "JSON request required" }, 415);
    }

    const parsed = adminMutationSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      return adminJson({ error: "Invalid or unconfirmed auth mutation" }, 400);
    }

    try {
      return adminJson(
        await executeMutation(parsed.data, principal.userId, operations),
      );
    } catch (error) {
      return adminJson(
        { error: error instanceof Error ? error.message : "Mutation failed" },
        400,
      );
    }
  }

  return adminJson({ error: "Not Found" }, 404);
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

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return origin !== null && origin === new URL(request.url).origin;
}

function adminJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
