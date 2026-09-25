import type {
  WebRouteDefinition,
  WebRouteTransportContext,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { escapeHtml } from "@brains/utils/string-utils";
import type { ContactAdmission, ContactDenialReason } from "./admission";
import type { ContactIntake } from "./intake";
import { contactSubmissionSchema } from "./entity/schema";
import { ContactHttpError, readContactForm } from "./http-body";
import { isPrivatePeer } from "./network";
import {
  contactForm,
  contactPage,
  type ContactDraft,
  type ContactPresentation,
} from "./http-page";

export interface ContactHttpPolicy {
  origin: string;
  maxBodyBytes: number;
  readTimeoutMs: number;
  /** Behind a TLS-terminating proxy on a private network (Kamal's), believe
   * its X-Forwarded-Proto: https. Only the protocol; never a visitor address. */
  trustForwardedProto?: boolean | undefined;
}
const originSchema: z.ZodString = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      value === url.origin &&
      (url.protocol === "https:" ||
        (url.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
    );
  }, "An exact HTTPS origin or loopback HTTP origin is required");
export const contactHttpPolicySchema: z.ZodType<ContactHttpPolicy> =
  z.strictObject({
    origin: originSchema,
    maxBodyBytes: z.number().int().min(256).max(65536),
    readTimeoutMs: z.number().int().min(100).max(30000),
    trustForwardedProto: z.boolean().optional(),
  });
export interface ContactHttpOptions {
  themeCSS?: string | undefined;
  /** The deployment's preview origin, served alongside the policy origin. */
  previewOrigin?: string | undefined;
}
const formSchema = z.strictObject({
  token: z.string().regex(/^[a-f0-9]{64}$/),
  ...contactSubmissionSchema.shape,
});
const headers = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  // no-referrer makes native browser POSTs send Origin: null. same-origin
  // preserves the origin check while still suppressing cross-site referrers.
  "Referrer-Policy": "same-origin",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy":
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
};
function denial(reason: ContactDenialReason): ContactHttpError {
  switch (reason) {
    case "invalid-network":
      return new ContactHttpError(
        403,
        "Contact requests are unavailable from this connection.",
      );
    case "invalid-submission":
      return new ContactHttpError(
        400,
        "Check the name, email and message fields before retrying.",
      );
    case "invalid-token":
      return new ContactHttpError(
        409,
        "This form is unavailable or expired. Copy your message before opening a new form.",
      );
    case "submission-conflict":
      return new ContactHttpError(
        409,
        "This form was already used for a different request. Do not resend it with changed details.",
      );
    case "rate-limited":
      return new ContactHttpError(
        429,
        "Too many requests. Please wait before retrying this form.",
      );
    case "capacity":
      return new ContactHttpError(
        503,
        "Contact intake is full. Please retry this same form later.",
      );
    case "unavailable":
      return new ContactHttpError(
        503,
        "Saving could not be confirmed. Retry this same form rather than creating a second request.",
      );
  }
}

/** Bounded HTTP boundary; the owning plugin controls readiness and opt-in mounting. */
export class ContactHttpHandlers {
  private readonly policy: ContactHttpPolicy;
  private readonly admission: ContactAdmission;
  private readonly intake: ContactIntake;
  private readonly themeCSS: string;
  private readonly origins: readonly string[];
  constructor(
    admission: ContactAdmission,
    intake: ContactIntake,
    policy: ContactHttpPolicy,
    options: ContactHttpOptions = {},
  ) {
    this.themeCSS = options.themeCSS ?? "";
    this.admission = admission;
    this.intake = intake;
    this.policy = contactHttpPolicySchema.parse(policy);
    this.origins = [
      this.policy.origin,
      ...(options.previewOrigin
        ? [originSchema.parse(options.previewOrigin)]
        : []),
    ];
  }

  /** The URL the visitor used. A trusted private proxy's forwarded https
   * replaces the plain http it forwards on; nothing else is taken from headers. */
  private visitorUrl(
    request: Request,
    transport?: WebRouteTransportContext,
  ): URL {
    const url = new URL(request.url);
    if (
      this.policy.trustForwardedProto === true &&
      url.protocol === "http:" &&
      isPrivatePeer(transport?.remoteAddress) &&
      request.headers.get("x-forwarded-proto")?.trim().toLowerCase() === "https"
    )
      url.protocol = "https:";
    return url;
  }

  routes(preview = false): WebRouteDefinition[] {
    return [
      { path: "/contact", method: "GET" as const },
      { path: "/contact", method: "POST" as const },
      { path: "/contact/thanks", method: "GET" as const },
    ].map((route) => ({
      ...route,
      public: true,
      preview,
      handler: (request, transport) => this.handle(request, transport),
    }));
  }

  private presentation(request: Request): ContactPresentation {
    const theme = new URL(request.url).searchParams.get("theme");
    return {
      themeCSS: this.themeCSS,
      ...(theme === "light" || theme === "dark" ? { theme } : {}),
    };
  }

  unavailable(request: Request): Response {
    return new Response(
      contactPage(
        '<h1>Contact unavailable</h1><p role="alert">Contact intake is temporarily unavailable. Please retry this same form later.</p>',
        this.presentation(request),
      ),
      { status: 503, headers },
    );
  }

  async handle(
    request: Request,
    transport?: WebRouteTransportContext,
  ): Promise<Response> {
    const presentation = this.presentation(request);
    let token = "";
    let draft: ContactDraft = {};
    try {
      const url = this.visitorUrl(request, transport);
      if (!this.origins.includes(url.origin))
        throw new ContactHttpError(403, "Contact request denied.");
      if (
        url.protocol === "http:" &&
        !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
          transport?.remoteAddress ?? "",
        )
      )
        throw new ContactHttpError(403, "Contact request denied.");
      if (!["/contact", "/contact/thanks"].includes(url.pathname))
        throw new ContactHttpError(404, "Page not found.");
      if (
        !["GET", "POST"].includes(request.method) ||
        (url.pathname === "/contact/thanks" && request.method !== "GET")
      )
        throw new ContactHttpError(405, "Method not allowed.");
      if (
        request.method === "POST" &&
        (request.headers.get("origin") !== url.origin ||
          request.headers.get("sec-fetch-site") === "cross-site")
      )
        throw new ContactHttpError(403, "Contact request denied.");
      const gate = await this.admission.checkRequest(transport?.remoteAddress);
      if (gate.kind === "denied") throw denial(gate.reason);
      request.signal.throwIfAborted();
      if (url.pathname === "/contact/thanks")
        return new Response(
          contactPage(
            '<h1>Request saved</h1><p class="introduction">Your request is saved for the owner, who can reply by email.</p><p>Notification delivery is separate. You do not need to send another request.</p>',
            presentation,
          ),
          { headers },
        );
      if (request.method === "GET") {
        const form = await this.admission.issue(transport?.remoteAddress);
        if (form.kind === "denied") throw denial(form.reason);
        return new Response(
          contactForm(
            form.token,
            this.intake.retentionSeconds,
            {},
            undefined,
            presentation,
          ),
          { headers },
        );
      }
      if (
        request.headers
          .get("content-type")
          ?.split(";")[0]
          ?.trim()
          .toLowerCase() !== "application/x-www-form-urlencoded"
      )
        throw new ContactHttpError(
          415,
          "A URL-encoded form is required. Attachments are not accepted.",
        );
      const fields = await readContactForm(
        request,
        this.policy.maxBodyBytes,
        this.policy.readTimeoutMs,
      );
      draft = {
        name: fields["name"] ?? "",
        email: fields["email"] ?? "",
        message: fields["message"] ?? "",
      };
      token = /^[a-f0-9]{64}$/.test(fields["token"] ?? "")
        ? (fields["token"] ?? "")
        : "";
      const parsed = formSchema.safeParse(fields);
      if (!parsed.success) throw denial("invalid-submission");
      const { token: credential, ...submission } = parsed.data;
      const result = await this.intake.submit(
        credential,
        submission,
        transport?.remoteAddress,
        request.signal,
      );
      if (result.kind === "denied") throw denial(result.reason);
      return new Response(null, {
        status: 303,
        headers: {
          ...headers,
          Location: `/contact/thanks${presentation.theme ? `?theme=${presentation.theme}` : ""}`,
        },
      });
    } catch (error) {
      const failure =
        error instanceof ContactHttpError ? error : denial("unavailable");
      const html = token
        ? contactForm(
            token,
            this.intake.retentionSeconds,
            draft,
            failure.message,
            presentation,
          )
        : contactPage(
            `<h1>Contact unavailable</h1><p class="notice" role="alert">${escapeHtml(failure.message)}</p><p><a href="/contact">Open the contact form</a></p>`,
            presentation,
          );
      return new Response(html, { status: failure.status, headers });
    }
  }
}
