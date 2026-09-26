import type { IRuntimeStateNamespace } from "@brains/sdk/services";
import type { JobEntityAccess } from "@brains/sdk/entities";
import { z } from "@brains/utils/zod";
import { contactRequestAdapter } from "./entity/adapter";
import {
  contactRequestSchema,
  contactMetadataSchema,
  type ContactRequest,
} from "./entity/schema";
import {
  ContactStorageSlots,
  contactStoragePolicySchema,
  type ContactStoragePolicy,
} from "./storage-slots";

export interface ContactDeliveryPolicy {
  maxAttempts: number;
  retryWindowSeconds: number;
}
export const contactDeliveryPolicySchema: z.ZodType<
  ContactDeliveryPolicy,
  ContactDeliveryPolicy
> = z.strictObject({
  maxAttempts: z.number().int().min(1).max(5),
  // Must fit inside the approved transport's idempotency retention (email: 24h).
  retryWindowSeconds: z.number().int().min(60).max(3600),
});
export interface ContactDeliveryDependencies {
  entities: Pick<JobEntityAccess, "getEntity" | "update">;
  state: IRuntimeStateNamespace;
  storage: ContactStoragePolicy;
  policy: ContactDeliveryPolicy;
  send: (idempotencyKey: string) => Promise<boolean>;
  now?: () => number;
}
export class ContactDelivery {
  private readonly deps: ContactDeliveryDependencies;
  private readonly slots: ContactStorageSlots;
  private readonly policy: ContactDeliveryPolicy;
  private readonly now: () => number;
  constructor(deps: ContactDeliveryDependencies) {
    this.deps = deps;
    this.now = deps.now ?? Date.now;
    this.policy = contactDeliveryPolicySchema.parse(deps.policy);
    this.slots = new ContactStorageSlots(
      deps.state,
      contactStoragePolicySchema.parse(deps.storage),
      this.now,
    );
  }

  async deliver(
    id: string,
    signal: AbortSignal,
  ): Promise<"sent" | "failed" | "skipped"> {
    try {
      signal.throwIfAborted();
      const entity = await this.read(id);
      if (!entity || this.expired(entity)) return "skipped";
      if (entity.metadata.notification === "sent") return "sent";
      const claim = await this.slots.beginDelivery(
        id,
        this.policy.maxAttempts,
        this.policy.retryWindowSeconds,
      );
      if (claim.status === "skipped") return "skipped";
      if (claim.status === "busy") throw new Error("Busy");
      let status: "sent" | "failed";
      if (claim.status === "send") {
        signal.throwIfAborted();
        const current = await this.read(id);
        signal.throwIfAborted();
        if (!current || this.expired(current)) return "skipped";
        // A slow read must not turn a once-valid reservation into a late send.
        if (this.now() >= claim.sendBefore) throw new Error("Expired attempt");
        let sent = false;
        try {
          sent = await this.deps.send(`contact-notification:${id}`);
        } catch {
          /* Ambiguous delivery: preserve key and charged attempt. */
        }
        // Persist a known acknowledgement even if cancellation happened during I/O.
        const settled = await this.slots.settleDelivery(
          id,
          claim.attempt,
          sent,
          this.policy.maxAttempts,
        );
        if (!settled) return "skipped";
        if (settled === "pending") throw new Error("Pending");
        status = settled;
      } else {
        status = claim.status;
      }
      await this.record(id, status, signal);
      return status;
    } catch {
      throw new Error("Contact notification unavailable");
    }
  }

  private read(id: string): Promise<ContactRequest | null> {
    return this.deps.entities.getEntity(
      { entityType: "contact-request", id, visibilityScope: "restricted" },
      contactRequestSchema,
    );
  }
  private expired(entity: ContactRequest): boolean {
    return this.now() >= Date.parse(entity.metadata.expiresAt);
  }
  private async record(
    id: string,
    notification: "sent" | "failed",
    signal: AbortSignal,
  ): Promise<void> {
    for (let attempt = 0; attempt < 4; attempt++) {
      signal.throwIfAborted();
      const entity = await this.read(id);
      if (
        !entity ||
        this.expired(entity) ||
        entity.metadata.notification === notification ||
        entity.metadata.notification === "sent"
      )
        return;
      const { frontmatter, message } = contactRequestAdapter.parseContent(
        entity.content,
      );
      const content = contactRequestAdapter.createContent(
        { ...frontmatter, notification },
        message,
      );
      const result = await this.deps.entities.update(
        {
          ...entity,
          content,
          metadata: contactMetadataSchema.parse({
            ...entity.metadata,
            notification,
          }),
        },
        { expectedContentHash: entity.contentHash, signal },
      );
      if (!result.skipped) return;
    }
    throw new Error("Contact notification unavailable");
  }
}
