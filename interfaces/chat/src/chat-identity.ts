import type { AuthPrincipal } from "@brains/auth-service";
import type {
  PermissionLookupContext,
  UserPermissionLevel,
} from "@brains/plugins";
import type { ChatPlatform } from "./types";

/**
 * The permission surface this resolver reads from the plugin context. Narrow
 * on purpose so tests can supply a plain object.
 */
export interface ChatPermissionLookup {
  getUserLevel(
    interfaceType: string,
    userId: string,
    context?: PermissionLookupContext,
  ): UserPermissionLevel;
  isAnchor(interfaceType: string, userId: string): boolean;
}

/**
 * The auth lookup this resolver needs, injected like {@link ChatPermissionLookup}
 * rather than read from the auth-service module singleton. Reaching for the
 * singleton left tests no way to supply a principal except by replacing an
 * internal workspace module, which only takes effect if nothing has imported
 * it yet — so whether it worked depended on test file order.
 */
export interface ChatIdentityAccess {
  resolveIdentityAccess(input: {
    type: string;
    subject: string;
  }): Promise<
    | { state: "resolved"; principal: AuthPrincipal }
    | { state: "denied" }
    | { state: "unbound" }
  >;
}

export interface ChatIdentityResolution {
  permissionLevel: UserPermissionLevel;
  isAnchor: boolean;
  /** Present only when the speaker is bound to a brain account. */
  principal?: AuthPrincipal | undefined;
}

/**
 * Resolve who is speaking, preferring a linked brain account over the
 * interface's permission rules.
 *
 * A resolved principal wins outright — that is what lets a connected account
 * both raise and lower the level a config grant would give. A denied binding
 * (revoked, suspended) drops to public without consulting the rules, so
 * revocation cannot be undone by a channel-wide grant. Only unbound speakers
 * fall through to permission rules.
 *
 * Slack never consults auth identities: the identity-claim types are
 * `passkey | discord | mcp | oauth | email | did | a2a`, so a Slack user id is
 * not a bindable subject.
 */
export async function resolveChatIdentity(
  permissions: ChatPermissionLookup,
  platform: ChatPlatform,
  userId: string,
  permissionContext: PermissionLookupContext,
  identityAccess: ChatIdentityAccess | undefined,
): Promise<ChatIdentityResolution> {
  if (platform === "discord") {
    const resolution = await identityAccess?.resolveIdentityAccess({
      type: "discord",
      subject: userId,
    });
    if (resolution?.state === "resolved") {
      return {
        permissionLevel: resolution.principal.permissionLevel,
        isAnchor: resolution.principal.isAnchor,
        principal: resolution.principal,
      };
    }
    if (resolution?.state === "denied") {
      return { permissionLevel: "public", isAnchor: false };
    }
  }

  return {
    permissionLevel: permissions.getUserLevel(
      platform,
      userId,
      permissionContext,
    ),
    isAnchor: permissions.isAnchor(platform, userId),
  };
}
