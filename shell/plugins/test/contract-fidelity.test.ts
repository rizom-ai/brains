import { describe, expect, it } from "bun:test";
import type * as AgentContract from "../src/contracts/agent";
import type * as IdentityContract from "../src/contracts/identity";
import type * as MessagingContract from "../src/contracts/messaging";
import type * as AiService from "@brains/ai-service";
import type * as IdentityService from "@brains/identity-service";
import type * as MessagingService from "@brains/messaging-service";

/**
 * `src/contracts/*` restates types owned by the shell services, so a plugin
 * can import a stable shape from one subpath instead of reaching into five
 * packages. Each restatement is a second, hand-written declaration — the
 * services do not implement these interfaces, and nothing checks that the
 * value a plugin is handed still matches the shape it was promised.
 *
 * `@brains/plugins` already depends on all five services, so this is not
 * decoupling; the copies are just copies. The assertions below say what the
 * copying is supposed to preserve: whatever the service produces has to
 * satisfy the contract a plugin was given. Narrowing in the contract stays
 * legal — it promises less than it delivers — but a contract member the
 * service dropped fails here.
 */

type ServiceSatisfiesContract<Service extends Contract, Contract> = Service;

// Messaging. A plugin receives these off the bus and sends through it.
type _BaseMessage = ServiceSatisfiesContract<
  MessagingService.BaseMessage,
  MessagingContract.BaseMessage
>;
type _MessageWithPayload = ServiceSatisfiesContract<
  MessagingService.MessageWithPayload<{ id: string }>,
  MessagingContract.MessageWithPayload<{ id: string }>
>;
type _MessageContext = ServiceSatisfiesContract<
  MessagingService.MessageContext,
  MessagingContract.MessageContext
>;
type _MessageResponse = ServiceSatisfiesContract<
  MessagingService.MessageResponse,
  MessagingContract.MessageResponse
>;
type _MessageSendOptions = ServiceSatisfiesContract<
  MessagingService.MessageSendOptions,
  MessagingContract.MessageSendOptions
>;
type _MessageSendRequest = ServiceSatisfiesContract<
  MessagingService.MessageSendRequest,
  MessagingContract.MessageSendRequest
>;
type _MessageSender = ServiceSatisfiesContract<
  MessagingService.MessageSender,
  MessagingContract.MessageSender
>;

// Identity.
type _AnchorProfile = ServiceSatisfiesContract<
  IdentityService.AnchorProfile,
  IdentityContract.AnchorProfile
>;
type _BrainCharacter = ServiceSatisfiesContract<
  IdentityService.BrainCharacter,
  IdentityContract.BrainCharacter
>;

// The agent conversation a plugin joins.
type _ChatContext = ServiceSatisfiesContract<
  AiService.ChatContext,
  AgentContract.ChatContext
>;
type _ChatAttachment = ServiceSatisfiesContract<
  AiService.ChatAttachment,
  AgentContract.ChatAttachment
>;

// `Conversation` and `Message` are deliberately two shapes, not a copy: the
// service's are drizzle rows (`started`, `metadata: string | null`), the
// contract's are the mapped form (`startedAt`, parsed metadata, a narrowed
// `role`). `base/public-conversations.ts` converts between them and its
// return types are the contract types, so the compiler already holds that
// pair together. An assignability assertion here would assert a relationship
// that is not supposed to hold.

/** Keeps the assertions above from being reported as unused declarations. */
export type ContractFidelityAssertions = [
  _BaseMessage,
  _MessageWithPayload,
  _MessageContext,
  _MessageResponse,
  _MessageSendOptions,
  _MessageSendRequest,
  _MessageSender,
  _AnchorProfile,
  _BrainCharacter,
  _ChatContext,
  _ChatAttachment,
];

describe("plugin contract fidelity", () => {
  it("keeps each service type assignable to the contract that restates it", () => {
    // Enforced by the type-level assertions above, which fail `bun run
    // typecheck`. This case documents the guard so a reader who lands here
    // from a typecheck error knows what broke.
    expect(true).toBe(true);
  });
});
