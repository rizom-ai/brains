import type { PublishResult } from "@brains/contracts";
import type { Logger } from "@brains/utils/logger";
import type {
  NewsletterDeliveryProvider,
  NewsletterSubscriber,
  NewsletterSubscriberList,
  NewsletterSubscriberListInput,
  NewsletterSubscribeInput,
} from "../contracts";
import { renderNewsletterEmail } from "../email-renderer";
import {
  ResendNewsletterClient,
  type ResendClientConfig,
  type ResendClientDeps,
} from "./resend-client";

/** Newsletter provider adapter backed by Resend Broadcasts and Segments. */
export class ResendNewsletterProvider implements NewsletterDeliveryProvider {
  readonly name = "resend";
  private readonly client: ResendNewsletterClient;

  constructor(
    config: ResendClientConfig,
    logger: Logger,
    deps: ResendClientDeps = {},
  ) {
    this.client = new ResendNewsletterClient(config, logger, deps);
  }

  async publish(
    content: string,
    metadata: Record<string, unknown>,
  ): Promise<PublishResult> {
    const subject = readSubject(metadata);
    const previewText = readOptionalString(metadata, "previewText");
    const rendered = renderNewsletterEmail({
      subject,
      content,
      ...(previewText ? { previewText } : {}),
    });
    const broadcast = await this.client.createBroadcast({
      subject,
      html: rendered.html,
      text: rendered.text,
      ...(previewText ? { previewText } : {}),
    });
    return { id: broadcast.id };
  }

  async createSubscriber(
    input: NewsletterSubscribeInput,
  ): Promise<NewsletterSubscriber> {
    if (input.tags && input.tags.length > 0) {
      throw new Error(
        "Subscriber tags are not supported by the Resend provider",
      );
    }
    const result = await this.client.subscribe({
      email: input.email,
      ...(input.name ? { name: input.name } : {}),
    });
    return {
      id: result.contact.id,
      email: result.contact.email,
      status: result.alreadySubscribed ? "already_subscribed" : "regular",
    };
  }

  async unsubscribe(email: string): Promise<void> {
    await this.client.unsubscribe(email);
  }

  async listSubscribers(
    input?: NewsletterSubscriberListInput,
  ): Promise<NewsletterSubscriberList> {
    if (input?.type === "unactivated") {
      return { subscribers: [], count: 0 };
    }
    const result = await this.client.listContacts({
      ...(input?.limit ? { limit: input.limit } : {}),
    });
    const subscribers = result.contacts
      .map<NewsletterSubscriber>((contact) => ({
        id: contact.id,
        email: contact.email,
        status: contact.unsubscribed ? "unsubscribed" : "regular",
      }))
      .filter((subscriber) => !input?.type || subscriber.status === input.type);
    return { subscribers, count: subscribers.length };
  }

  async validateCredentials(): Promise<boolean> {
    return this.client.validateCredentials();
  }
}

function readSubject(metadata: Record<string, unknown>): string {
  const subject = metadata["subject"];
  if (typeof subject !== "string" || subject.trim().length === 0) {
    throw new Error("Newsletter subject is required for publishing");
  }
  return subject;
}

function readOptionalString(
  metadata: Record<string, unknown>,
  field: string,
): string | undefined {
  const value = metadata[field];
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}
