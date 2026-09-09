import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  coerceConversationMetadata,
  type IRuntimeStateNamespace,
  type IRuntimeStateStore,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import type { WebChatConversation } from "./conversation-access";
import type { EnabledGuestPolicy, GuestPolicy } from "./guest-policy";

export const guestInterfaceType = "web-chat-guest";

const visitorSchema: z.ZodObject<
  {
    kind: z.ZodLiteral<"guest">;
    id: z.ZodString;
    createdAt: z.ZodNumber;
    expiresAt: z.ZodNumber;
  },
  z.core.$strict
> = z.strictObject({
  kind: z.literal("guest"),
  id: z.string().uuid(),
  createdAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().positive(),
});
export type GuestVisitor = z.output<typeof visitorSchema>;

const ownershipSchema = z.strictObject({ visitorId: z.string().uuid() });

/**
 * Credential/ownership foundation only. It grants no agent execution authority.
 * Routes must reserve shared quota and enforce runtime isolation before use.
 * Leases are fixed and bounded by idle expiry; reads never extend them.
 */
export class GuestVisitorStore {
  private readonly store: IRuntimeStateStore<GuestVisitor>;
  private readonly policy: GuestPolicy;
  private readonly now: () => number;

  constructor(
    runtimeState: IRuntimeStateNamespace,
    policy: GuestPolicy,
    now: () => number = Date.now,
  ) {
    this.policy = policy;
    this.now = now;
    this.store = runtimeState.scoped({
      namespace: "web-chat.guest-visitors",
      schema: visitorSchema,
    });
  }

  async issue(
    request: Request,
  ): Promise<{ cookie: string; visitor: GuestVisitor }> {
    const policy = this.requireMutation(request);
    const createdAt = this.now();
    const ttl = Math.min(
      policy.retention.idleSeconds,
      policy.retention.maxAgeSeconds,
    );
    const visitor: GuestVisitor = {
      kind: "guest",
      id: randomUUID(),
      createdAt,
      expiresAt: createdAt + ttl * 1000,
    };
    // Never reuse a browser-provided token; only its digest reaches persistence.
    const token = randomBytes(32).toString("base64url");
    if (!(await this.store.setIfNotExists(this.key(token, policy), visitor))) {
      throw new Error("Guest access unavailable");
    }
    return {
      visitor,
      cookie: `${this.cookieName(policy)}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${ttl}${this.secure(policy) ? "; Secure" : ""}`,
    };
  }

  async resolve(request: Request): Promise<GuestVisitor | null> {
    if (!this.policy.enabled) return null;
    const token = this.token(request, this.policy);
    if (!token) return null;
    const visitor = await this.store.get(this.key(token, this.policy));
    const now = this.now();
    return visitor && visitor.createdAt <= now && now < visitor.expiresAt
      ? visitor
      : null;
  }

  async revoke(request: Request): Promise<void> {
    const policy = this.requireMutation(request);
    const token = this.token(request, policy);
    if (token) await this.store.delete(this.key(token, policy));
  }

  private requireMutation(request: Request): EnabledGuestPolicy {
    if (!this.policy.enabled) throw new Error("Guest access unavailable");
    // Compare to server configuration, not attacker-controlled forwarding headers.
    // Request URLs must be canonicalized by the trusted HTTP host before routing.
    const contentType = request.headers
      .get("content-type")
      ?.split(";")[0]
      ?.trim()
      .toLowerCase();
    if (
      request.method !== "POST" ||
      new URL(request.url).origin !== this.policy.origin ||
      request.headers.get("origin") !== this.policy.origin ||
      contentType !== "application/json" ||
      request.headers.get("sec-fetch-site") === "cross-site"
    ) {
      throw new Error("Guest request denied");
    }
    return this.policy;
  }

  private token(request: Request, policy: EnabledGuestPolicy): string | null {
    if (new URL(request.url).origin !== policy.origin) return null;
    const name = `${this.cookieName(policy)}=`;
    const matches = (request.headers.get("cookie") ?? "")
      .split(";")
      .map((cookie) => cookie.trim())
      .filter((cookie) => cookie.startsWith(name));
    if (matches.length !== 1) return null;
    const token = matches[0]?.slice(name.length);
    return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
  }

  private key(token: string, policy: EnabledGuestPolicy): string {
    return createHash("sha256")
      .update(`${policy.origin}\0${token}`)
      .digest("hex");
  }

  private secure(policy: EnabledGuestPolicy): boolean {
    return new URL(policy.origin).protocol === "https:";
  }

  private cookieName(policy: EnabledGuestPolicy): string {
    return this.secure(policy) ? "__Host-brain-visitor" : "brain-visitor-dev";
  }
}

/** The visitor must have just been resolved from the server-owned credential store. */
export function canAccessGuestConversation(
  conversation: WebChatConversation | null,
  visitor: GuestVisitor,
  policy: EnabledGuestPolicy,
  now: number,
): conversation is WebChatConversation {
  if (
    conversation?.interfaceType !== guestInterfaceType ||
    conversation.personId != null
  )
    return false;
  if (visitor.createdAt > now || now >= visitor.expiresAt) return false;
  const ownership = ownershipSchema.safeParse(
    coerceConversationMetadata(conversation.metadata)["guest"],
  );
  if (!ownership.success || ownership.data.visitorId !== visitor.id)
    return false;
  const started = Date.parse(conversation.startedAt);
  const lastActive = Date.parse(conversation.lastActiveAt);
  return (
    Number.isFinite(started) &&
    Number.isFinite(lastActive) &&
    started <= lastActive &&
    lastActive <= now &&
    now < started + policy.retention.maxAgeSeconds * 1000 &&
    now < lastActive + policy.retention.idleSeconds * 1000
  );
}
