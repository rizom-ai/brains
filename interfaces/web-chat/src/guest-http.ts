import { createHash, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from "ai";
import {
  CHAT_CONVERSATION_ID_HEADER,
  createChatApiPaths,
  guestChatMessageRequestSchema,
  guestChatSessionResponseSchema,
  guestChatSubmissionStatusSchema,
  guestChatSubmissionIdSchema,
  guestChatHistoryResponseSchema,
  chatMessagesResponseSchema,
  deleteChatSessionResponseSchema,
  guestInterfaceType,
  getGuestSourceCards,
} from "@brains/contracts/chat";
import type {
  InterfacePluginContext,
  WebRouteDefinition,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { deferred } from "@brains/utils/deferred";
import {
  GuestVisitorStore,
  canAccessGuestConversation,
  type GuestVisitor,
} from "./guest-access";
import { GuestAdmission } from "./guest-admission";
import {
  guestPolicySchema,
  type GuestPolicy,
  type EnabledGuestPolicy,
} from "./guest-policy";
import type { WebChatConversation } from "./conversation-access";
import { writeTextPart } from "./stream-writer";

export interface GuestHttpOptions {
  /** Trusted host readiness, never browser configuration. Absent means closed.
   * Tests can supply a mocked runtime; production must verify accounting and
   * source-work prerequisites before supplying a positive readiness check.
   */
  ready?: () => boolean;
  now?: () => number;
}
type Services = Pick<
  InterfacePluginContext,
  "agent" | "conversations" | "runtimeState"
>;
class GuestHttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
const noStore = { "Cache-Control": "no-store", Vary: "Cookie" };

function isLoopbackPeer(address: string | undefined): boolean {
  if (!address) return false;
  if (isIP(address) === 4) return address.startsWith("127.");
  if (isIP(address) !== 6) return false;
  try {
    const host = new URL(`http://[${address}]`).hostname;
    return (
      host === "[::1]" || /^\[::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}\]$/.test(host)
    );
  } catch {
    return false;
  }
}

/** A guest presentation of the existing Chat API/runtime, not a second engine. */
export class GuestHttpHandlers {
  private readonly policy: GuestPolicy;
  private readonly visitors: GuestVisitorStore;
  private readonly admission: GuestAdmission | undefined;
  private readonly now: () => number;
  private readonly ready: () => boolean;
  private readonly services: Services;
  constructor(
    services: Services,
    policy: GuestPolicy,
    options: GuestHttpOptions = {},
  ) {
    this.services = services;
    this.policy = guestPolicySchema.parse(policy);
    this.now = options.now ?? Date.now;
    this.ready = options.ready ?? ((): boolean => false);
    this.visitors = new GuestVisitorStore(
      services.runtimeState,
      this.policy,
      this.now,
    );
    this.admission = this.policy.enabled
      ? new GuestAdmission(services.runtimeState, this.policy, {
          now: this.now,
          isEnabled: this.ready,
        })
      : undefined;
  }

  routes(apiPath: string): WebRouteDefinition[] {
    const paths = createChatApiPaths(
      `${createChatApiPaths(apiPath).stream}/guest`,
    );
    return [
      this.route(`${paths.stream}/session`, "POST", (request, policy) =>
        this.session(request, policy),
      ),
      this.route(paths.stream, "POST", (request, policy) =>
        this.send(request, policy),
      ),
      this.route(paths.messages, "GET", (request, policy) =>
        this.history(request, policy),
      ),
      this.route(paths.sessions, "DELETE", (request, policy) =>
        this.delete(request, policy),
      ),
    ];
  }

  private route(
    path: string,
    method: "GET" | "POST" | "DELETE",
    handler: (
      request: Request,
      policy: EnabledGuestPolicy,
    ) => Promise<Response>,
  ): WebRouteDefinition {
    return {
      path,
      method,
      public: true,
      handler: async (request, transport): Promise<Response> => {
        try {
          if (request.method !== method)
            throw new GuestHttpError(405, "Method not allowed");
          if (!this.policy.enabled)
            throw new GuestHttpError(503, "Guest access unavailable");
          const localOnly = ["localhost", "127.0.0.1", "[::1]"].includes(
            new URL(this.policy.origin).hostname,
          );
          if (localOnly && !isLoopbackPeer(transport?.remoteAddress))
            throw new GuestHttpError(403, "Guest request denied");
          const origin = request.headers.get("origin");
          if (
            new URL(request.url).origin !== this.policy.origin ||
            (origin !== null && origin !== this.policy.origin) ||
            request.headers.get("sec-fetch-site") === "cross-site" ||
            (method !== "GET" && origin !== this.policy.origin)
          )
            throw new GuestHttpError(403, "Guest request denied");
          if (
            method === "POST" &&
            request.headers
              .get("content-type")
              ?.split(";")[0]
              ?.trim()
              .toLowerCase() !== "application/json"
          )
            throw new GuestHttpError(415, "JSON required");
          request.signal.throwIfAborted();
          const response = await handler(request, this.policy);
          for (const [key, value] of Object.entries(noStore))
            response.headers.set(key, value);
          return response;
        } catch (error) {
          // Only locally defined errors cross HTTP; provider/storage details do not.
          return Response.json(
            {
              error:
                error instanceof GuestHttpError
                  ? error.message
                  : "Guest access unavailable",
            },
            {
              status: error instanceof GuestHttpError ? error.status : 503,
              headers: noStore,
            },
          );
        }
      },
    };
  }

  private async session(
    request: Request,
    policy: EnabledGuestPolicy,
  ): Promise<Response> {
    const body = await this.body(request, policy);
    if (!z.strictObject({}).safeParse(body).success)
      throw new GuestHttpError(400, "Invalid guest session request");
    let visitor = await this.visitors.resolve(request);
    let cookie: string | undefined;
    if (!visitor) {
      if (!this.ready())
        throw new GuestHttpError(503, "Guest access unavailable");
      const issued = await this.visitors.issue(request);
      visitor = issued.visitor;
      cookie = issued.cookie;
    }
    // Refresh reuses the credential without renewing its fixed lifetime.
    const response = Response.json(
      guestChatSessionResponseSchema.parse({
        expiresAt: visitor.expiresAt,
        ...policy.disclosure,
        retention: policy.retention,
        messageCharacters: policy.limits.messageCharacters,
        canSend: this.ready(),
      }),
    );
    if (cookie) response.headers.set("Set-Cookie", cookie);
    return response;
  }

  private async owner(request: Request): Promise<GuestVisitor> {
    const visitor = await this.visitors.resolve(request);
    if (!visitor) throw new GuestHttpError(404, "Conversation unavailable");
    return visitor;
  }

  private async owned(
    request: Request,
    id: string,
    policy: EnabledGuestPolicy,
  ): Promise<WebChatConversation> {
    const visitor = await this.owner(request);
    const conversation = await this.services.conversations.get(id);
    if (!canAccessGuestConversation(conversation, visitor, policy, this.now()))
      throw new GuestHttpError(404, "Conversation unavailable");
    return conversation;
  }

  private async send(
    request: Request,
    policy: EnabledGuestPolicy,
  ): Promise<Response> {
    if (!this.ready() || !this.admission)
      throw new GuestHttpError(503, "Guest access unavailable");
    const visitor = await this.owner(request);
    const parsed = guestChatMessageRequestSchema.safeParse(
      await this.body(request, policy),
    );
    if (!parsed.success) throw new GuestHttpError(400, "Invalid guest message");
    const message = parsed.data.messages[0];
    if (!message) throw new GuestHttpError(400, "Invalid guest message");
    const text = message.parts.map((part) => part.text).join("\n");
    if (!text.trim() || text.length > policy.limits.messageCharacters)
      throw new GuestHttpError(400, "Invalid guest message");
    // Stable across retries of a first send, but minted using server-owned identity.
    const id =
      parsed.data.id ??
      `guest-${createHash("sha256")
        .update(JSON.stringify([visitor.id, message.id]))
        .digest("hex")}`;
    if (/[\r\n]/u.test(id))
      throw new GuestHttpError(400, "Invalid guest message");
    const existing = await this.services.conversations.get(id);
    if (parsed.data.id || existing) await this.owned(request, id, policy);
    const timestamp = new Date(this.now()).toISOString();
    const candidate: WebChatConversation = existing ?? {
      id,
      sessionId: id,
      interfaceType: guestInterfaceType,
      channelId: id,
      startedAt: timestamp,
      lastActiveAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
      metadata: {
        guest: { visitorId: visitor.id, retention: policy.retention },
      },
    };
    // A new conversation consumes a real admission reservation before any write.
    const reservation = await this.admission.reserve(
      visitor,
      candidate,
      message.id,
      text,
    );
    if (reservation.kind === "denied") {
      const status =
        reservation.reason === "unavailable"
          ? 503
          : reservation.reason === "conversation-unavailable"
            ? 404
            : reservation.reason === "invalid-input"
              ? 400
              : reservation.reason === "submission-conflict"
                ? 409
                : 429;
      return Response.json({ error: reservation.reason }, { status });
    }
    if (reservation.kind === "duplicate")
      return Response.json(
        guestChatSubmissionStatusSchema.parse({
          state: reservation.state,
          conversationId: id,
        }),
        { status: 409, headers: { [CHAT_CONVERSATION_ID_HEADER]: id } },
      );
    if (!existing)
      await this.services.conversations.start({
        sessionId: id,
        interfaceType: guestInterfaceType,
        channelId: id,
        metadata: {
          channelName: "Public Ask",
          interfaceType: guestInterfaceType,
          channelId: id,
          guest: { visitorId: visitor.id, retention: policy.retention },
        },
      });
    await this.owned(request, id, policy);
    const admission = this.admission;
    const stream = createUIMessageStream<UIMessage>({
      onError: (): string => "Guest response unavailable",
      execute: async ({ writer }): Promise<void> => {
        // Do not invoke the runtime if creation waited past expiry/deletion.
        await this.owned(request, id, policy);
        if (!this.ready()) throw new Error("Guest access unavailable");
        request.signal.throwIfAborted();
        writer.write({ type: "start", messageId: randomUUID() });
        // This transport emits one answer batch, not provider token deltas. The
        // only idle gap is after start while waiting for that batch/settlement.
        const idle = new AbortController();
        const signal = AbortSignal.any([request.signal, idle.signal]);
        const stopped = deferred<never>();
        const stopWaiting = (): void =>
          stopped.reject(new Error("Guest response unavailable"));
        signal.addEventListener("abort", stopWaiting, { once: true });
        const timer = setTimeout(
          () => idle.abort(),
          policy.limits.streamIdleTimeoutSeconds * 1000,
        );
        try {
          signal.throwIfAborted();
          // Keep observing work after delivery stops. Only genuine fulfillment
          // settles admission; cancellation/rejection never proves remote exit.
          const work = Promise.resolve().then(async () => {
            signal.throwIfAborted();
            const response = await this.services.agent.chat(
              text,
              id,
              {
                interfaceType: guestInterfaceType,
                userPermissionLevel: "public",
                isAnchor: false,
                guestExecution: reservation.lease.execution,
              },
              signal,
            );
            const hasAnswer = response.text.trim().length > 0;
            if (
              !(await admission.settle(
                reservation.lease,
                hasAnswer ? "completed" : "failed",
              ))
            )
              throw new Error("Guest settlement unavailable");
            if (!hasAnswer) throw new Error("Guest response unavailable");
            signal.throwIfAborted();
            await this.owned(request, id, policy);
            signal.throwIfAborted();
            return response;
          });
          const response = await Promise.race([work, stopped.promise]);
          signal.throwIfAborted();
          // Only bounded source projections cross this boundary; never actions,
          // approvals, attachments or raw provenance from the runtime.
          for (const card of getGuestSourceCards(response.cards)) {
            writer.write({ type: "data-sources", id: card.id, data: card });
          }
          writeTextPart(writer, randomUUID(), response.text);
          writer.write({ type: "finish", finishReason: "stop" });
        } finally {
          clearTimeout(timer);
          signal.removeEventListener("abort", stopWaiting);
        }
      },
    });
    return createUIMessageStreamResponse({
      stream,
      headers: { ...noStore, [CHAT_CONVERSATION_ID_HEADER]: id },
    });
  }

  private async history(
    request: Request,
    policy: EnabledGuestPolicy,
  ): Promise<Response> {
    const id = this.conversationId(request);
    const conversation = await this.owned(request, id, policy);
    const submissionId = new URL(request.url).searchParams.get("submissionId");
    const parsed =
      submissionId === null
        ? undefined
        : guestChatSubmissionIdSchema.safeParse(submissionId);
    if (parsed && !parsed.success)
      throw new GuestHttpError(400, "Invalid guest submission");
    const state = parsed?.success
      ? await this.admission?.status(
          await this.owner(request),
          conversation,
          parsed.data,
        )
      : undefined;
    const messages = await this.services.conversations.getMessages(id, {
      limit: Math.min(100, policy.limits.userTurns * 2),
    });
    await this.owned(request, id, policy);
    const history = chatMessagesResponseSchema.parse({
      messages: messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        cards: getGuestSourceCards(message.metadata["cards"]),
      })),
    });
    return Response.json(
      submissionId === null
        ? history
        : guestChatHistoryResponseSchema.parse({
            messages: history.messages,
            submission: state ? { state, conversationId: id } : null,
          }),
    );
  }

  private async delete(
    request: Request,
    policy: EnabledGuestPolicy,
  ): Promise<Response> {
    const id = this.conversationId(request);
    await this.owned(request, id, policy);
    const deleted = await this.services.conversations.delete(id);
    // Deletion does not cancel or release an active execution reservation.
    return Response.json(deleteChatSessionResponseSchema.parse({ deleted }));
  }

  private conversationId(request: Request): string {
    const id = new URL(request.url).searchParams.get("id");
    if (!id || id.length > 256)
      throw new GuestHttpError(400, "Missing conversation id");
    return id;
  }

  private async body(
    request: Request,
    policy: EnabledGuestPolicy,
  ): Promise<unknown> {
    if (!request.body) throw new GuestHttpError(400, "Invalid JSON body");
    const reader = request.body.getReader();
    const signal = AbortSignal.any([
      request.signal,
      AbortSignal.timeout(policy.limits.requestTimeoutSeconds * 1000),
    ]);
    const cancel = (): void => {
      void reader.cancel().catch(() => {
        // Body cancellation is best-effort, never evidence of runtime completion.
      });
    };
    signal.addEventListener("abort", cancel, { once: true });
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      signal.throwIfAborted();
      for (;;) {
        const result = await reader.read();
        signal.throwIfAborted();
        if (result.done) break;
        size += result.value.byteLength;
        if (size > policy.limits.contextBytes) {
          cancel();
          throw new GuestHttpError(413, "Guest request too large");
        }
        chunks.push(result.value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      try {
        return JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(bytes),
        );
      } catch {
        throw new GuestHttpError(400, "Invalid JSON body");
      }
    } finally {
      signal.removeEventListener("abort", cancel);
      reader.releaseLock();
    }
  }
}
