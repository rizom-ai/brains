import type { PublishResult } from "@brains/contracts";
import type { Logger } from "@brains/utils/logger";
import {
  ButtondownClient,
  type ButtondownClientDeps,
  type ButtondownConfig,
} from "./lib/buttondown-client";
import type {
  NewsletterDeliveryProvider,
  NewsletterSubscriber,
  NewsletterSubscriberList,
  NewsletterSubscriberListInput,
  NewsletterSubscribeInput,
} from "./contracts";
import { renderNewsletterEmail } from "./email-renderer";
import { readSubject } from "./publish-handler";

const BUTTONDOWN_HTML_MODE = "<!-- buttondown-editor-mode: fancy -->";

/** Newsletter provider adapter backed by Buttondown. */
export class ButtondownNewsletterProvider implements NewsletterDeliveryProvider {
  readonly name = "buttondown";
  private readonly client: ButtondownClient;

  constructor(
    config: ButtondownConfig,
    logger: Logger,
    deps: ButtondownClientDeps = {},
  ) {
    this.client = new ButtondownClient(config, logger, deps);
  }

  async publish(
    content: string,
    metadata: Record<string, unknown>,
  ): Promise<PublishResult> {
    const subject = readSubject(metadata);
    const rendered = renderNewsletterEmail({ subject, content });
    const email = await this.client.createEmail({
      subject,
      body: `${BUTTONDOWN_HTML_MODE}\n${rendered.html}`,
      status: "about_to_send",
    });
    return { id: email.id };
  }

  async createSubscriber(
    input: NewsletterSubscribeInput,
  ): Promise<NewsletterSubscriber> {
    const subscriber = await this.client.createSubscriber({
      email: input.email,
      ...(input.name ? { name: input.name } : {}),
      ...(input.tags ? { tags: input.tags } : {}),
    });
    return {
      id: subscriber.id,
      email: subscriber.email,
      status: subscriber.subscriber_type,
    };
  }

  async unsubscribe(email: string): Promise<void> {
    await this.client.unsubscribe(email);
  }

  async listSubscribers(
    input?: NewsletterSubscriberListInput,
  ): Promise<NewsletterSubscriberList> {
    const result = await this.client.listSubscribers({
      ...(input?.type && { type: input.type }),
      ...(input?.limit && { limit: input.limit }),
    });
    return {
      subscribers: result.results.map((subscriber) => ({
        id: subscriber.id,
        email: subscriber.email,
        status: subscriber.subscriber_type,
      })),
      count: result.count,
    };
  }

  async validateCredentials(): Promise<boolean> {
    return this.client.validateCredentials();
  }
}
