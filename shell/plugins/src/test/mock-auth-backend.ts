import type { AuthBackend } from "../contracts/auth";

function unstubbed(method: string): () => Promise<never> {
  return () =>
    Promise.reject(new Error(`AuthBackend.${method} is not stubbed`));
}

/** An auth backend whose methods reject until a test stubs the ones it uses. */
export function createMockAuthBackend(
  overrides: Partial<AuthBackend> = {},
): AuthBackend {
  return {
    getIssuer: () => "https://brain.example",
    resolveSession: unstubbed("resolveSession"),
    createAuthLoginResponse: () =>
      new Response("Authentication required", { status: 401 }),
    resolveBearerGrant: unstubbed("resolveBearerGrant"),
    resolveIdentityAccess: unstubbed("resolveIdentityAccess"),
    listUsers: unstubbed("listUsers"),
    listAdminUsers: unstubbed("listAdminUsers"),
    getBrainAnchor: unstubbed("getBrainAnchor"),
    listInvitationChannels: unstubbed("listInvitationChannels"),
    updateUserRole: unstubbed("updateUserRole"),
    updateUserStatus: unstubbed("updateUserStatus"),
    deleteSuspendedUser: unstubbed("deleteSuspendedUser"),
    attachIdentity: unstubbed("attachIdentity"),
    detachIdentity: unstubbed("detachIdentity"),
    revokePasskey: unstubbed("revokePasskey"),
    startPasskeyRegistrationForUser: unstubbed(
      "startPasskeyRegistrationForUser",
    ),
    revokeUserSessionsAndRefreshTokens: unstubbed(
      "revokeUserSessionsAndRefreshTokens",
    ),
    createInvitation: unstubbed("createInvitation"),
    resendInvitation: unstubbed("resendInvitation"),
    cancelInvitation: unstubbed("cancelInvitation"),
    confirmManualInvitationDelivery: unstubbed(
      "confirmManualInvitationDelivery",
    ),
    inviteExternalPeerPerson: unstubbed("inviteExternalPeerPerson"),
    linkExternalPeer: unstubbed("linkExternalPeer"),
    unlinkExternalPeer: unstubbed("unlinkExternalPeer"),
    recordAuditEvent: unstubbed("recordAuditEvent"),
    queryAuditEvents: unstubbed("queryAuditEvents"),
    getA2APeerTrust: unstubbed("getA2APeerTrust"),
    grantA2APeerTrust: unstubbed("grantA2APeerTrust"),
    revokeA2APeerTrust: unstubbed("revokeA2APeerTrust"),
    getA2ASigningKey: unstubbed("getA2ASigningKey"),
    ...overrides,
  };
}
