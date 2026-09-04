import type { Logger } from "@brains/utils/logger";
import { z } from "@brains/utils/zod";

export interface ButtondownConfig {
  apiKey: string;
  doubleOptIn: boolean;
}

/**
 * What the client needs from a response: the status check and the JSON body.
 * A real Response satisfies this, and so does a test's bare object.
 */
export type ButtondownFetch = (
  url: string,
  init: RequestInit,
) => Promise<Pick<Response, "ok" | "status" | "json">>;

/**
 * Runtime collaborators that are not configuration. Production leaves fetch
 * unset and the client uses the global; a test hands in a fake and reads the
 * requests off it instead of reassigning globalThis.fetch.
 */
export interface ButtondownClientDeps {
  fetch?: ButtondownFetch | undefined;
}

/**
 * Buttondown API base URL
 */
const BUTTONDOWN_API_URL = "https://api.buttondown.email/v1";

/**
 * Subscriber status in Buttondown
 * "already_subscribed" is a local status indicating the subscriber already exists
 */
const subscriberTypeSchema: z.ZodEnum<{
  unactivated: "unactivated";
  regular: "regular";
  unsubscribed: "unsubscribed";
  already_subscribed: "already_subscribed";
}> = z.enum(["unactivated", "regular", "unsubscribed", "already_subscribed"]);

export type SubscriberType = z.output<typeof subscriberTypeSchema>;

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
const emailStatusSchema: z.ZodEnum<{
  draft: "draft";
  about_to_send: "about_to_send";
  scheduled: "scheduled";
  sent: "sent";
}> = z.enum(["draft", "about_to_send", "scheduled", "sent"]);

export type EmailStatus = z.output<typeof emailStatusSchema>;

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
 * Buttondown subscriber
 */
const subscriberSchema: z.ZodObject<
  {
    id: z.ZodString;
    email: z.ZodString;
    subscriber_type: typeof subscriberTypeSchema;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
  },
  z.core.$loose
> = z.looseObject({
  id: z.string(),
  email: z.string(),
  subscriber_type: subscriberTypeSchema,
  metadata: z.record(z.string(), z.string()).optional(),
});

export type Subscriber = z.output<typeof subscriberSchema>;

/**
 * Buttondown email
 */
const buttondownEmailSchema: z.ZodObject<
  {
    id: z.ZodString;
    subject: z.ZodString;
    body: z.ZodOptional<z.ZodString>;
    status: typeof emailStatusSchema;
    publish_date: z.ZodOptional<z.ZodString>;
  },
  z.core.$loose
> = z.looseObject({
  id: z.string(),
  subject: z.string(),
  body: z.string().optional(),
  status: emailStatusSchema,
  publish_date: z.string().optional(),
});

export type ButtondownEmail = z.output<typeof buttondownEmailSchema>;

const listSubscribersResponseSchema = z.looseObject({
  results: z.array(subscriberSchema),
  count: z.number(),
});

const buttondownErrorSchema = z.looseObject({
  detail: z.string().optional(),
  message: z.string().optional(),
  code: z.string().optional(),
});

/**
 * Error thrown for failed Buttondown API requests, preserving the structured
 * error code from the response body (e.g. "email_already_exists")
 */
export class ButtondownApiError extends Error {
  public readonly status: number;
  public readonly code: string | undefined;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ButtondownApiError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Buttondown API client
 *
 * Handles subscriber management and email sending through the Buttondown API.
 *
 * @see https://api.buttondown.email/v1/docs
 */
export class ButtondownClient {
  private config: ButtondownConfig;
  private logger: Logger;
  private fetchFn: ButtondownFetch | undefined;
  constructor(
    config: ButtondownConfig,
    logger: Logger,
    deps: ButtondownClientDeps = {},
  ) {
    this.config = config;
    this.logger = logger;
    this.fetchFn = deps.fetch;
  }

  /**
   * Make an authenticated request to the Buttondown API
   */
  private async request(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<unknown> {
    const url = `${BUTTONDOWN_API_URL}${endpoint}`;

    this.logger.debug("Buttondown API request", {
      endpoint,
      method: options.method ?? "GET",
    });

    const response = await (this.fetchFn ?? fetch)(url, {
      ...options,
      headers: {
        Authorization: `Token ${this.config.apiKey}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}));
      const error = buttondownErrorSchema.safeParse(errorPayload);
      const message = error.success
        ? (error.data.detail ?? error.data.message ?? `HTTP ${response.status}`)
        : `HTTP ${response.status}`;
      const code = error.success ? error.data.code : undefined;
      this.logger.error("Buttondown API error", {
        endpoint,
        status: response.status,
        code,
        error: message,
      });
      throw new ButtondownApiError(
        `Buttondown API error: ${message}`,
        response.status,
        code,
      );
    }

    return response.json();
  }

  /**
   * Create a new subscriber
   * Returns subscriber with subscriber_type "already_subscribed" if they exist
   */
  async createSubscriber(input: CreateSubscriberInput): Promise<Subscriber> {
    const body: {
      email_address: string;
      type: string;
      metadata?: { name: string };
      tags?: string[];
    } = {
      email_address: input.email,
      type: this.config.doubleOptIn ? "unactivated" : "regular",
    };

    if (input.name) {
      body.metadata = { name: input.name };
    }

    if (input.tags && input.tags.length > 0) {
      body.tags = input.tags;
    }

    this.logger.info("Creating subscriber", { email: input.email });

    try {
      return subscriberSchema.parse(
        await this.request("/subscribers", {
          method: "POST",
          body: JSON.stringify(body),
        }),
      );
    } catch (error) {
      // Duplicate email - look up the existing subscriber and flag it
      if (
        error instanceof ButtondownApiError &&
        error.code === "email_already_exists"
      ) {
        this.logger.info("Subscriber already exists", { email: input.email });
        const existing = await this.getSubscriberByEmail(input.email);
        return {
          ...existing,
          subscriber_type: "already_subscribed",
        };
      }
      throw error;
    }
  }

  /**
   * Get a subscriber by email address
   */
  async getSubscriberByEmail(email: string): Promise<Subscriber> {
    return subscriberSchema.parse(
      await this.request(`/subscribers/${encodeURIComponent(email)}`),
    );
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

    return listSubscribersResponseSchema.parse(await this.request(endpoint));
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

    return buttondownEmailSchema.parse(
      await this.request("/emails", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    );
  }

  /**
   * Get an email by ID
   */
  async getEmail(id: string): Promise<ButtondownEmail> {
    return buttondownEmailSchema.parse(await this.request(`/emails/${id}`));
  }

  /**
   * Validate that the API credentials are working
   */
  async validateCredentials(): Promise<boolean> {
    try {
      await this.request("/subscribers?page_size=1");
      return true;
    } catch {
      return false;
    }
  }
}
