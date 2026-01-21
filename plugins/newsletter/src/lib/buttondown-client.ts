import type { ButtondownConfig } from "../config";
import type { Logger } from "@brains/utils";

/**
 * Buttondown API base URL
 */
const BUTTONDOWN_API_URL = "https://api.buttondown.email/v1";

/**
 * Subscriber status in Buttondown
 */
export type SubscriberType = "unactivated" | "regular" | "unsubscribed";

/**
 * Buttondown subscriber
 */
export interface Subscriber {
  id: string;
  email: string;
  subscriber_type: SubscriberType;
  metadata?: Record<string, string>;
}

/**
 * Input for creating a subscriber
 */
export interface CreateSubscriberInput {
  email: string;
  name?: string;
  tags?: string[];
}

/**
 * Buttondown email status
 */
export type EmailStatus = "draft" | "about_to_send" | "scheduled" | "sent";

/**
 * Buttondown email
 */
export interface ButtondownEmail {
  id: string;
  subject: string;
  body?: string;
  status: EmailStatus;
  publish_date?: string;
}

/**
 * Input for creating an email
 */
export interface CreateEmailInput {
  subject: string;
  body: string;
  status?: EmailStatus;
  publish_date?: string;
}

/**
 * Paginated list response
 */
export interface ListResponse<T> {
  results: T[];
  count: number;
}

/**
 * Buttondown API error response
 */
interface ButtondownError {
  detail?: string;
  message?: string;
}

/**
 * Buttondown API client
 *
 * Handles subscriber management and email sending through the Buttondown API.
 *
 * @see https://api.buttondown.email/v1/docs
 */
export class ButtondownClient {
  constructor(
    private config: ButtondownConfig,
    private logger: Logger,
  ) {}

  /**
   * Make an authenticated request to the Buttondown API
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${BUTTONDOWN_API_URL}${endpoint}`;

    this.logger.debug("Buttondown API request", {
      endpoint,
      method: options.method ?? "GET",
    });

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Token ${this.config.apiKey}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = (await response
        .json()
        .catch(() => ({}))) as ButtondownError;
      const message =
        error.detail ?? error.message ?? `HTTP ${response.status}`;
      this.logger.error("Buttondown API error", {
        endpoint,
        status: response.status,
        error: message,
      });
      throw new Error(`Buttondown API error: ${message}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Create a new subscriber
   */
  async createSubscriber(input: CreateSubscriberInput): Promise<Subscriber> {
    const body: {
      email: string;
      type: string;
      metadata?: { name: string };
      tags?: string[];
    } = {
      email: input.email,
      type: this.config.doubleOptIn ? "unactivated" : "regular",
    };

    if (input.name) {
      body.metadata = { name: input.name };
    }

    if (input.tags && input.tags.length > 0) {
      body.tags = input.tags;
    }

    this.logger.info("Creating subscriber", { email: input.email });

    return this.request<Subscriber>("/subscribers", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /**
   * Unsubscribe a subscriber by email
   */
  async unsubscribe(email: string): Promise<void> {
    this.logger.info("Unsubscribing", { email });

    await this.request(`/subscribers/${encodeURIComponent(email)}`, {
      method: "DELETE",
    });
  }

  /**
   * List subscribers with optional filtering
   */
  async listSubscribers(options?: {
    type?: SubscriberType;
    limit?: number;
  }): Promise<ListResponse<Subscriber>> {
    const params = new URLSearchParams();
    if (options?.type) {
      params.set("type", options.type);
    }
    if (options?.limit) {
      params.set("page_size", String(options.limit));
    }

    const query = params.toString();
    const endpoint = query ? `/subscribers?${query}` : "/subscribers";

    return this.request<ListResponse<Subscriber>>(endpoint);
  }

  /**
   * Create an email (draft or send immediately)
   */
  async createEmail(input: CreateEmailInput): Promise<ButtondownEmail> {
    const body: {
      subject: string;
      body: string;
      status: EmailStatus;
      publish_date?: string;
    } = {
      subject: input.subject,
      body: input.body,
      status: input.status ?? "draft",
    };

    if (input.publish_date) {
      body.publish_date = input.publish_date;
    }

    this.logger.info("Creating email", {
      subject: input.subject,
      status: input.status ?? "draft",
    });

    return this.request<ButtondownEmail>("/emails", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /**
   * Get an email by ID
   */
  async getEmail(id: string): Promise<ButtondownEmail> {
    return this.request<ButtondownEmail>(`/emails/${id}`);
  }

  /**
   * Validate that the API credentials are working
   */
  async validateCredentials(): Promise<boolean> {
    try {
      await this.request<ListResponse<Subscriber>>("/subscribers?page_size=1");
      return true;
    } catch {
      return false;
    }
  }
}
