import type {
  AuthAuditEvent,
  AuthImplementation,
  AuthPrincipal,
} from "@brains/plugins";

/**
 * An auth implementation that resolves one principal, for a test whose subject
 * reads the caller rather than administers users.
 *
 * Registering this is how a test gives a package a signed-in browser. The
 * alternative — injecting a `resolveAuthSession` seam into the package under
 * test — bypasses the path production takes, so a package that stopped calling
 * auth correctly would still pass.
 *
 * The administration half is nineteen operations such a test never calls. A
 * brain that has auth has all of them, so the stub says so rather than
 * spelling each one out.
 */

const defaultAuditEvent: AuthAuditEvent = {
  id: "e-1",
  action: "operator.viewed",
  createdAt: 0,
};

// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- a Proxy over an interface has no structural shape to satisfy: `new Proxy` types its result from its target, and that target cannot be written without spelling out every operation these tests never call
const unusedAdministration = new Proxy(
  {},
  {
    get: () => (): never => {
      throw new Error("Administration is not exercised here");
    },
  },
) as AuthImplementation;

export interface StubAuthOptions {
  /**
   * Who is signed in. Omitted, no one is: `resolveSession` answers undefined,
   * which is what an anonymous browser sees.
   */
  readonly principal?: AuthPrincipal | undefined;
  /** The 302 or 401 the interface under test is expected to pass through. */
  readonly loginResponse?: (() => Response) | undefined;
}

export function createStubAuth(
  options: StubAuthOptions = {},
): AuthImplementation {
  return {
    ...unusedAdministration,
    resolveSession: async () => options.principal,
    resolveBearerGrant: async () => undefined,
    createAuthLoginResponse: () =>
      options.loginResponse?.() ?? new Response(null, { status: 302 }),
    recordAuditEvent: async () => defaultAuditEvent,
    queryAuditEvents: async () => ({
      events: [defaultAuditEvent],
      actions: [],
      total: 1,
    }),
    getIssuer: () => "https://brain.test",
    getA2APeerTrust: async () => undefined,
    getA2ASigningKey: async () => ({
      privateJwk: {
        kty: "OKP",
        crv: "Ed25519",
        x: "x",
        kid: "k",
        use: "sig",
        alg: "EdDSA",
        d: "d",
      },
      keyId: "k",
    }),
    grantA2APeerTrust: async (input: {
      domain: string;
      keyFingerprint: string;
    }) => ({
      domain: input.domain,
      keyFingerprint: input.keyFingerprint,
      grantedLevel: "trusted",
    }),
    revokeA2APeerTrust: async () => undefined,
    resolveIdentityAccess: async () =>
      options.principal
        ? { state: "resolved", principal: options.principal }
        : { state: "unbound" },
  };
}

/** A signed-in principal at `permissionLevel`, with sensible identity fields. */
export function createTestPrincipal(
  overrides: Partial<AuthPrincipal> = {},
): AuthPrincipal {
  const permissionLevel = overrides.permissionLevel ?? "admin";
  return {
    userId: "usr_test",
    personId: "prsn_test",
    displayName: "Test Operator",
    role: permissionLevel,
    status: "active",
    permissionLevel,
    isAnchor: permissionLevel === "admin",
    ...overrides,
  };
}
