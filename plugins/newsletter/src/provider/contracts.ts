import type { PublishProvider } from "@brains/contracts";

export type NewsletterSubscriberStatus =
  "unactivated" | "regular" | "unsubscribed" | "already_subscribed";

export interface NewsletterSubscriber {
  id: string;
  email: string;
  status: NewsletterSubscriberStatus;
}

export interface NewsletterSubscribeInput {
  email: string;
  name?: string | undefined;
  tags?: string[] | undefined;
}

export interface NewsletterSubscriberListInput {
  type?: Exclude<NewsletterSubscriberStatus, "already_subscribed"> | undefined;
  limit?: number | undefined;
}

export interface NewsletterSubscriberList {
  subscribers: NewsletterSubscriber[];
  count: number;
}

/**
 * Provider-neutral newsletter delivery and subscriber operations.
 *
 * Provider-specific adapters normalize their native subscriber states to the
 * existing newsletter tool vocabulary.
 */
export interface NewsletterDeliveryProvider extends PublishProvider {
  createSubscriber(
    input: NewsletterSubscribeInput,
  ): Promise<NewsletterSubscriber>;
  unsubscribe(email: string): Promise<void>;
  listSubscribers(
    input?: NewsletterSubscriberListInput,
  ): Promise<NewsletterSubscriberList>;
  validateCredentials(): Promise<boolean>;
}
