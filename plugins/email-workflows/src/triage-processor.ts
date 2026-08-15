import { inboundEmailSchema, type InboundEmail } from "@brains/contracts";
import type { IRuntimeStateStore, MessageResponse } from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import { isDeterministicBulkMail } from "./lib/bulk-filter";
import type { MailClassifier } from "./lib/classifier";
import {
  createMailItemProjection,
  createUnclassifiedMailItemProjection,
  mailItemIdForMessage,
  type MailItemProjection,
} from "./lib/mail-item-projection";
import { assertClassificationIsDerived } from "./lib/source-safety";
import { mailTriageDecisionSchema } from "./schemas/triage";

export interface MailItemRepository {
  get(id: string): Promise<{ id: string } | null>;
  create(projection: MailItemProjection): Promise<void>;
}

export interface EmailTriageProcessorDependencies {
  repository: MailItemRepository;
  threadOrdinals?: {
    persist(
      projection: MailItemProjection,
      writer: (projection: MailItemProjection) => Promise<void>,
    ): Promise<void>;
  };
  attempts: IRuntimeStateStore<number>;
  classify: MailClassifier;
  logger: Logger;
}

export class EmailTriageProcessor {
  private readonly repository: MailItemRepository;
  private readonly threadOrdinals: EmailTriageProcessorDependencies["threadOrdinals"];
  private readonly attempts: IRuntimeStateStore<number>;
  private readonly classify: MailClassifier;
  private readonly logger: Logger;

  constructor(dependencies: EmailTriageProcessorDependencies) {
    this.repository = dependencies.repository;
    this.threadOrdinals = dependencies.threadOrdinals;
    this.attempts = dependencies.attempts;
    this.classify = dependencies.classify;
    this.logger = dependencies.logger;
  }

  async process(input: unknown): Promise<MessageResponse> {
    const parsed = inboundEmailSchema.safeParse(input);
    if (!parsed.success) {
      this.logger.warn("Inbound email failed triage contract validation");
      return { success: false, error: "Invalid inbound email" };
    }
    const email = parsed.data;
    const itemId = mailItemIdForMessage(email.messageId);

    let existing: { id: string } | null;
    try {
      existing = await this.repository.get(itemId);
    } catch {
      return this.persistenceFailure(itemId);
    }
    if (existing) {
      return this.resolveAttemptState(itemId);
    }

    if (isDeterministicBulkMail(email)) {
      const resolved = await this.resolveAttemptState(itemId);
      if ("success" in resolved && resolved.success) {
        this.logger.debug("Deterministic bulk email discarded", { itemId });
      }
      return resolved;
    }

    let priorFailures: number;
    try {
      priorFailures = (await this.attempts.get(itemId)) ?? 0;
    } catch {
      return this.attemptStateFailure(itemId);
    }

    if (priorFailures >= 3) {
      return this.persistFallback(email, itemId);
    }

    try {
      const decision = mailTriageDecisionSchema.parse(
        await this.classify(email),
      );
      if (decision.decision === "discard") {
        return await this.resolveAttemptState(itemId);
      }
      assertClassificationIsDerived(email, decision);
      const projection = createMailItemProjection(email, decision);
      return await this.persistProjection(projection, itemId);
    } catch {
      return this.handleClassificationFailure(email, itemId, priorFailures);
    }
  }

  private async handleClassificationFailure(
    email: InboundEmail,
    itemId: string,
    priorFailures: number,
  ): Promise<MessageResponse> {
    const failures = priorFailures + 1;
    try {
      await this.attempts.set(itemId, failures);
    } catch {
      return this.attemptStateFailure(itemId);
    }
    this.logger.warn("Inbound email classification failed", {
      itemId,
      attempt: failures,
    });
    if (failures < 3) {
      return { success: false, error: "Email classification failed" };
    }
    return this.persistFallback(email, itemId);
  }

  private async persistFallback(
    email: InboundEmail,
    itemId: string,
  ): Promise<MessageResponse> {
    let projection: MailItemProjection;
    try {
      projection = createUnclassifiedMailItemProjection(email);
    } catch {
      return { success: false, error: "Email classification failed" };
    }
    return this.persistProjection(projection, itemId);
  }

  private async persistProjection(
    projection: MailItemProjection,
    itemId: string,
  ): Promise<MessageResponse> {
    try {
      if (this.threadOrdinals) {
        await this.threadOrdinals.persist(projection, (item) =>
          this.repository.create(item),
        );
      } else {
        await this.repository.create(projection);
      }
    } catch {
      return this.persistenceFailure(itemId);
    }
    return this.resolveAttemptState(itemId);
  }

  private async resolveAttemptState(itemId: string): Promise<MessageResponse> {
    try {
      await this.attempts.delete(itemId);
      return { success: true };
    } catch {
      return this.attemptStateFailure(itemId);
    }
  }

  private persistenceFailure(itemId: string): MessageResponse {
    this.logger.warn("Email triage persistence failed", { itemId });
    return { success: false, error: "Email triage persistence failed" };
  }

  private attemptStateFailure(itemId: string): MessageResponse {
    this.logger.warn("Email triage attempt state failed", { itemId });
    return { success: false, error: "Email classification failed" };
  }
}
