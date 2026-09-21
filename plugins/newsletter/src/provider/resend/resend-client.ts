import type { Logger } from "@brains/utils/logger";
import { z } from "@brains/utils/zod";

const RESEND_API_URL = "https://api.resend.com";

export interface ResendClientConfig {
  apiKey: string;
  segmentId: string;
  from: string;
  replyTo?: string | undefined;
  topicId?: string | undefined;
}

export type ResendFetch = (
  url: string,
  init: RequestInit,
) => Promise<Pick<Response, "ok" | "status" | "json">>;

export interface ResendClientDeps {
  fetch?: ResendFetch | undefined;
}

export interface ResendContact {
  id: string;
  email: string;
  firstName?: string | undefined;
  lastName?: string | undefined;
  unsubscribed: boolean;
}

export interface ResendContactList {
  contacts: ResendContact[];
  hasMore: boolean;
}

export interface ResendBroadcastInput {
  subject: string;
  html: string;
  text: string;
  previewText?: string | undefined;
}

export interface ResendBroadcast {
  id: string;
}

const contactSchema = z.looseObject({
  id: z.string(),
  email: z.string(),
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  unsubscribed: z.boolean(),
});

const contactMutationSchema = z.looseObject({ id: z.string() });

const contactListSchema = z.looseObject({
  data: z.array(contactSchema),
  has_more: z.boolean().default(false),
});

const segmentListSchema = z.looseObject({
  data: z.array(z.looseObject({ id: z.string() })),
  has_more: z.boolean().default(false),
});

const broadcastSchema = z.looseObject({ id: z.string() });

const resendErrorSchema = z.looseObject({
  message: z.string().optional(),
  name: z.string().optional(),
});

export class ResendApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ResendApiError";
    this.status = status;
    this.code = code;
  }
}

/** Minimal Resend client for Contacts, Segments, and Broadcasts. */
export class ResendNewsletterClient {
  private readonly config: ResendClientConfig;
  private readonly logger: Logger;
  private readonly fetchFn: ResendFetch | undefined;

  constructor(
    config: ResendClientConfig,
    logger: Logger,
    deps: ResendClientDeps = {},
  ) {
    this.config = config;
    this.logger = logger;
    this.fetchFn = deps.fetch;
  }

  async subscribe(input: {
    email: string;
    name?: string | undefined;
  }): Promise<{ contact: ResendContact; alreadySubscribed: boolean }> {
    const existing = await this.getContactIfPresent(input.email);
    if (!existing) {
      const names = splitName(input.name);
      const created = contactMutationSchema.parse(
        await this.request("/contacts", {
          method: "POST",
          body: JSON.stringify({
            email: input.email,
            unsubscribed: false,
            segments: [{ id: this.config.segmentId }],
            ...(this.config.topicId
              ? {
                  topics: [{ id: this.config.topicId, subscription: "opt_in" }],
                }
              : {}),
            ...(names.firstName ? { first_name: names.firstName } : {}),
            ...(names.lastName ? { last_name: names.lastName } : {}),
          }),
        }),
      );
      return {
        contact: {
          id: created.id,
          email: input.email,
          unsubscribed: false,
          ...(names.firstName ? { firstName: names.firstName } : {}),
          ...(names.lastName ? { lastName: names.lastName } : {}),
        },
        alreadySubscribed: false,
      };
    }

    const inSegment = await this.isContactInSegment(input.email);
    const names = splitName(input.name);
    await this.request(`/contacts/${encodeURIComponent(input.email)}`, {
      method: "PATCH",
      body: JSON.stringify({
        unsubscribed: false,
        ...(names.firstName ? { first_name: names.firstName } : {}),
        ...(names.lastName ? { last_name: names.lastName } : {}),
      }),
    });

    if (!inSegment) {
      await this.request(
        `/contacts/${encodeURIComponent(input.email)}/segments/${encodeURIComponent(this.config.segmentId)}`,
        { method: "POST" },
      );
    }

    if (this.config.topicId) {
      await this.request(
        `/contacts/${encodeURIComponent(input.email)}/topics`,
        {
          method: "PATCH",
          body: JSON.stringify({
            topics: [{ id: this.config.topicId, subscription: "opt_in" }],
          }),
        },
      );
    }

    return {
      contact: {
        ...existing,
        unsubscribed: false,
        ...(names.firstName ? { firstName: names.firstName } : {}),
        ...(names.lastName ? { lastName: names.lastName } : {}),
      },
      alreadySubscribed: inSegment && !existing.unsubscribed,
    };
  }

  async unsubscribe(email: string): Promise<void> {
    await this.request(
      `/contacts/${encodeURIComponent(email)}/segments/${encodeURIComponent(this.config.segmentId)}`,
      { method: "DELETE" },
    );
  }

  async listContacts(options?: { limit?: number }): Promise<ResendContactList> {
    const limit = Math.min(Math.max(options?.limit ?? 100, 1), 100);
    const params = new URLSearchParams({ limit: String(limit) });
    const result = contactListSchema.parse(
      await this.request(
        `/segments/${encodeURIComponent(this.config.segmentId)}/contacts?${params.toString()}`,
      ),
    );
    return {
      contacts: result.data.map(mapContact),
      hasMore: result.has_more,
    };
  }

  async createBroadcast(input: ResendBroadcastInput): Promise<ResendBroadcast> {
    this.logger.info("Creating Resend newsletter broadcast", {
      subject: input.subject,
      segmentId: this.config.segmentId,
    });
    return broadcastSchema.parse(
      await this.request("/broadcasts", {
        method: "POST",
        body: JSON.stringify({
          segment_id: this.config.segmentId,
          from: this.config.from,
          subject: input.subject,
          html: input.html,
          text: input.text,
          send: true,
          ...(input.previewText ? { preview_text: input.previewText } : {}),
          ...(this.config.replyTo ? { reply_to: [this.config.replyTo] } : {}),
          ...(this.config.topicId ? { topic_id: this.config.topicId } : {}),
        }),
      }),
    );
  }

  async validateCredentials(): Promise<boolean> {
    try {
      await this.request(
        `/segments/${encodeURIComponent(this.config.segmentId)}`,
      );
      return true;
    } catch {
      return false;
    }
  }

  private async getContactIfPresent(
    email: string,
  ): Promise<ResendContact | undefined> {
    try {
      const contact = contactSchema.parse(
        await this.request(`/contacts/${encodeURIComponent(email)}`),
      );
      return mapContact(contact);
    } catch (error) {
      if (error instanceof ResendApiError && error.status === 404) {
        return undefined;
      }
      throw error;
    }
  }

  private async isContactInSegment(email: string): Promise<boolean> {
    const result = segmentListSchema.parse(
      await this.request(
        `/contacts/${encodeURIComponent(email)}/segments?limit=100`,
      ),
    );
    return result.data.some((segment) => segment.id === this.config.segmentId);
  }

  private async request(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<unknown> {
    this.logger.debug("Resend API request", {
      endpoint,
      method: options.method ?? "GET",
    });
    const request = this.fetchFn ?? globalThis.fetch;
    const response = await request(`${RESEND_API_URL}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const parsed = resendErrorSchema.safeParse(payload);
      const detail = parsed.success
        ? (parsed.data.message ?? `HTTP ${response.status}`)
        : `HTTP ${response.status}`;
      const code = parsed.success ? parsed.data.name : undefined;
      this.logger.error("Resend API error", {
        endpoint,
        status: response.status,
        code,
        error: detail,
      });
      throw new ResendApiError(
        `Resend API error: ${detail}`,
        response.status,
        code,
      );
    }

    return response.json();
  }
}

function mapContact(contact: z.output<typeof contactSchema>): ResendContact {
  return {
    id: contact.id,
    email: contact.email,
    unsubscribed: contact.unsubscribed,
    ...(contact.first_name ? { firstName: contact.first_name } : {}),
    ...(contact.last_name ? { lastName: contact.last_name } : {}),
  };
}

function splitName(name: string | undefined): {
  firstName?: string | undefined;
  lastName?: string | undefined;
} {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  const firstName = parts.shift();
  const lastName = parts.length > 0 ? parts.join(" ") : undefined;
  return {
    ...(firstName ? { firstName } : {}),
    ...(lastName ? { lastName } : {}),
  };
}
