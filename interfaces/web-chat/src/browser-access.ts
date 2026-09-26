import type {
  AuthPrincipal,
  IInterfaceConversationsNamespace,
  UserPermissionLevel,
} from "@brains/sdk/interfaces";
import {
  canAccessBrowserConversation,
  type WebChatConversationAccess,
} from "./conversation-access";

/**
 * Who is at the browser, and what they may reach.
 *
 * Every route web-chat serves asks the same two questions before doing
 * anything — is this a session that may chat, and does that session own the
 * conversation it named. They lived as private methods on the interface
 * class, which meant every handler needed the whole plugin to answer them.
 * They are a function of a principal and the conversation store, so this is
 * what they take.
 */

export interface BrowserAccess {
  readonly principal?: AuthPrincipal | undefined;
  readonly permissionLevel: UserPermissionLevel;
  /** Whether this caller may chat at all: trusted or admin, session active. */
  readonly hasChatAccess: boolean;
}

export interface BrowserAccessDeps {
  /** Resolves the browser session, when auth is mounted. */
  resolveAuthPrincipal(request: Request): Promise<AuthPrincipal | undefined>;
  /** The 401 auth wants sent, which differs by how login is configured. */
  createAuthLoginResponse(request: Request): Response;
  /**
   * Only the two reads this uses: a browser gate looks a conversation up and
   * starts one, and asking for the whole namespace would be a claim on
   * deleting and rewriting conversations that it never makes.
   */
  conversations: Pick<IInterfaceConversationsNamespace, "get" | "start">;
}

export interface BrowserAccessReader {
  resolve(request: Request): Promise<BrowserAccess>;
  permissionLevel(request: Request): Promise<UserPermissionLevel>;
  /** True when the caller may chat — the shape upload handlers ask for. */
  hasSession(request: Request): Promise<boolean>;
  conversationAccess(request: Request): Promise<WebChatConversationAccess>;
  toConversationAccess(
    permissionLevel: UserPermissionLevel,
    principal: AuthPrincipal | undefined,
  ): WebChatConversationAccess;
  /** 404 unless this caller owns an existing conversation by that id. */
  requireExisting(
    conversationId: string,
    interfaceType: string,
    access: WebChatConversationAccess,
  ): Promise<Response | undefined>;
  /** The same, but starting the conversation when it does not exist yet. */
  ensure(
    conversationId: string,
    interfaceType: string,
    channelName: string,
    access: WebChatConversationAccess,
  ): Promise<Response | undefined>;
  loginRequired(request: Request): Response;
}

const notFound = (): Response =>
  new Response("Conversation not found", { status: 404 });

export function createBrowserAccess(
  deps: BrowserAccessDeps,
): BrowserAccessReader {
  const reader: BrowserAccessReader = {
    async resolve(request): Promise<BrowserAccess> {
      const principal = await deps.resolveAuthPrincipal(request);
      if (principal) {
        // An active session at trusted or admin may chat. Anything else is
        // downgraded to public rather than refused outright, so a page can
        // still render its login door.
        const hasChatAccess =
          principal.status === "active" &&
          (principal.permissionLevel === "admin" ||
            principal.permissionLevel === "trusted");
        return {
          principal,
          permissionLevel: hasChatAccess ? principal.permissionLevel : "public",
          hasChatAccess,
        };
      }

      // No session, no chat. The page still renders, at public level, so it
      // can show its own login door rather than a bare 403.
      return { permissionLevel: "public", hasChatAccess: false };
    },

    async permissionLevel(request): Promise<UserPermissionLevel> {
      return (await reader.resolve(request)).permissionLevel;
    },

    async hasSession(request): Promise<boolean> {
      return (await reader.resolve(request)).hasChatAccess;
    },

    async conversationAccess(request): Promise<WebChatConversationAccess> {
      const access = await reader.resolve(request);
      return reader.toConversationAccess(
        access.permissionLevel,
        access.principal,
      );
    },

    toConversationAccess(permissionLevel, principal) {
      return {
        permissionLevel,
        ...(principal ? { personId: principal.personId } : {}),
      };
    },

    async requireExisting(conversationId, interfaceType, access) {
      const conversation = await deps.conversations.get(conversationId);
      return canAccessBrowserConversation(conversation, access, interfaceType)
        ? undefined
        : notFound();
    },

    async ensure(conversationId, interfaceType, channelName, access) {
      const existing = await deps.conversations.get(conversationId);
      if (existing) {
        return canAccessBrowserConversation(existing, access, interfaceType)
          ? undefined
          : notFound();
      }
      // A trusted caller is only trusted as a person. Without one there is
      // nobody to own the conversation about to be started.
      if (access.permissionLevel === "trusted" && !access.personId) {
        return new Response("Forbidden", { status: 403 });
      }

      await deps.conversations.start({
        sessionId: conversationId,
        interfaceType,
        channelId: conversationId,
        ...(access.personId ? { personId: access.personId } : {}),
        metadata: { channelName, interfaceType, channelId: conversationId },
      });
      const created = await deps.conversations.get(conversationId);
      return canAccessBrowserConversation(created, access, interfaceType)
        ? undefined
        : notFound();
    },

    loginRequired(request): Response {
      return deps.createAuthLoginResponse(request);
    },
  };
  return reader;
}
