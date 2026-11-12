import {
  SitePageResponse,
  type WebRouteTransportContext,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import type { FormAdmission, FormDenialReason } from "./admission";
import { FORM_COPY, type FormCopy } from "./copy";
import {
  formFields,
  RESERVED_FIELD_IDS,
  type FormDefinition,
} from "./definition";
import { FormHttpError, readForm } from "./http-body";
import type { FormIntake } from "./intake";
import { isPrivatePeer } from "./network";
import type { FormReceipts } from "./receipts";
import { formPage } from "./page";
import {
  renderForm,
  renderPaused,
  renderRefused,
  renderThanks,
  type FormDraft,
  type FormPresentation,
} from "./render";

/** Loopback names: the addresses, localhost and its subdomains (RFC 6761). */
function isLoopback(hostname: string): boolean {
  return (
    ["localhost", "127.0.0.1", "[::1]"].includes(hostname) ||
    hostname.endsWith(".localhost")
  );
}
const originSchema: z.ZodString = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      value === url.origin &&
      (url.protocol === "https:" ||
        (url.protocol === "http:" && isLoopback(url.hostname)))
    );
  }, "An exact HTTPS origin or loopback HTTP origin is required");

/**
 * The preview host a deployment serves beside its origin: its domain's
 * preview host, or locally the `preview.` host the webserver treats as
 * preview (`http://localhost:8080` beside `http://preview.localhost:8080`).
 */
export function previewOriginFor(
  origin: string,
  deploymentPreview: string | undefined,
): string | undefined {
  if (deploymentPreview) return deploymentPreview;
  const url = new URL(origin);
  if (url.protocol !== "http:" || url.hostname !== "localhost")
    return undefined;
  url.hostname = "preview.localhost";
  return url.origin;
}
export const formHttpPolicyShape: z.ZodObject<
  {
    origin: z.ZodString;
    maxBodyBytes: z.ZodNumber;
    readTimeoutMs: z.ZodNumber;
    trustForwardedProto: z.ZodOptional<z.ZodBoolean>;
  },
  z.core.$strict
> = z.strictObject({
  origin: originSchema,
  maxBodyBytes: z.number().int().min(256).max(65536),
  readTimeoutMs: z.number().int().min(100).max(30000),
  /** Behind a TLS-terminating proxy on a private network (Kamal's), believe
   * its X-Forwarded-Proto: https. Only the protocol; never a visitor address. */
  trustForwardedProto: z.boolean().optional(),
});
export const formHttpPolicySchema: typeof formHttpPolicyShape =
  formHttpPolicyShape;
export type FormHttpPolicy = z.output<typeof formHttpPolicySchema>;

export interface FormHttpOptions {
  themeCSS?: string | undefined;
  /** The deployment's preview origin, served alongside the policy origin. */
  previewOrigin?: string | undefined;
  /** Who submissions go to, as the site names its owner; read per request. */
  owner?: (() => string | undefined) | undefined;
  /** The site's own theme, used when the visitor's link names none; read per request. */
  defaultTheme?: (() => "light" | "dark" | undefined) | undefined;
  /** What the engine says around the form, when it says it in its own words. */
  copy?: FormCopy | undefined;
  /** A draft from the link that opened the form. */
  prefill?: ((url: URL) => FormDraft) | undefined;
  /** Where a scored form keeps the receipts its thanks page reads. */
  receipts?: FormReceipts | undefined;
  /** The page's language, when not English. */
  language?: string | undefined;
}

const headers = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  // no-referrer makes native browser POSTs send Origin: null. same-origin
  // preserves the origin check while still suppressing cross-site referrers.
  "Referrer-Policy": "same-origin",
  "X-Content-Type-Options": "nosniff",
  // The page is the site's own page with the form in it, so the site's
  // styles, fonts and scripts load; the form still posts only here and the
  // page cannot be framed.
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https:; font-src 'self' https: data:; img-src 'self' https: data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
};

/** Bounded HTTP boundary for one form; the owning plugin controls readiness and mounting. */
export class FormHttpHandlers {
  private readonly form: FormDefinition;
  private readonly policy: FormHttpPolicy;
  private readonly admission: FormAdmission;
  private readonly intake: FormIntake;
  private readonly themeCSS: string;
  private readonly owner: () => string | undefined;
  private readonly defaultTheme: () => "light" | "dark" | undefined;
  private readonly copy: FormCopy;
  private readonly prefill: (url: URL) => FormDraft;
  private readonly receipts: FormReceipts | undefined;
  private readonly language: string | undefined;
  private readonly origins: readonly string[];
  /** Every name the form posts: its fields, the token and the honeypot. */
  private readonly fields: ReadonlySet<string>;
  /** Fields posted once per value chosen. */
  private readonly repeatable: ReadonlySet<string>;
  constructor(
    form: FormDefinition,
    admission: FormAdmission,
    intake: FormIntake,
    policy: FormHttpPolicy,
    options: FormHttpOptions = {},
  ) {
    this.form = form;
    this.themeCSS = options.themeCSS ?? "";
    this.owner = options.owner ?? ((): undefined => undefined);
    this.defaultTheme = options.defaultTheme ?? ((): undefined => undefined);
    this.copy = options.copy ?? FORM_COPY;
    this.prefill = options.prefill ?? ((): FormDraft => ({}));
    this.receipts = options.receipts;
    this.language = options.language;
    this.admission = admission;
    this.intake = intake;
    this.policy = formHttpPolicySchema.parse(policy);
    this.origins = [
      this.policy.origin,
      ...(options.previewOrigin
        ? [originSchema.parse(options.previewOrigin)]
        : []),
    ];
    this.fields = new Set([
      ...RESERVED_FIELD_IDS,
      ...formFields(form).map((field) => field.id),
    ]);
    this.repeatable = new Set(
      formFields(form)
        .filter((field) => field.kind === "choices")
        .map((field) => field.id),
    );
  }

  /** Where this form is served; its thanks page is beneath it. */
  get path(): string {
    return this.form.path;
  }

  private get thanksPath(): string {
    return `${this.form.path}/thanks`;
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

  private presentation(request: Request): FormPresentation {
    const chosen = new URL(request.url).searchParams.get("theme");
    const theme =
      chosen === "light" || chosen === "dark" ? chosen : this.defaultTheme();
    const owner = this.owner()?.trim();
    return {
      ...(theme ? { theme } : {}),
      ...(owner ? { owner } : {}),
    };
  }

  /** A page of this form: it fills the site's own page, or stands in the fallback page. */
  private page(
    section: string,
    presentation: FormPresentation,
    status = 200,
  ): SitePageResponse {
    return new SitePageResponse(
      formPage(section, {
        themeCSS: this.themeCSS,
        theme: presentation.theme,
        title: this.form.pageTitle,
        language: this.language,
      }),
      { status, headers, slot: { name: this.form.id, html: section } },
    );
  }

  private denial(reason: FormDenialReason): FormHttpError {
    const status: Record<FormDenialReason, number> = {
      "invalid-network": 403,
      "invalid-submission": 400,
      "invalid-token": 409,
      "submission-conflict": 409,
      "rate-limited": 429,
      capacity: 503,
      unavailable: 503,
    };
    return new FormHttpError(status[reason], this.copy.denials[reason]);
  }

  unavailable(request: Request): Response {
    return this.page(
      renderPaused(this.form, this.copy),
      this.presentation(request),
      503,
    );
  }

  async handle(
    request: Request,
    transport?: WebRouteTransportContext,
  ): Promise<Response> {
    const presentation = this.presentation(request);
    let token = "";
    let draft: FormDraft = {};
    let errors: Record<string, string> = {};
    try {
      const url = this.visitorUrl(request, transport);
      if (!this.origins.includes(url.origin))
        throw new FormHttpError(403, this.copy.denied);
      if (
        url.protocol === "http:" &&
        !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
          transport?.remoteAddress ?? "",
        )
      )
        throw new FormHttpError(403, this.copy.denied);
      if (![this.form.path, this.thanksPath].includes(url.pathname))
        throw new FormHttpError(404, this.copy.notFound);
      if (
        !["GET", "POST"].includes(request.method) ||
        (url.pathname === this.thanksPath && request.method !== "GET")
      )
        throw new FormHttpError(405, this.copy.methodNotAllowed);
      if (
        request.method === "POST" &&
        (request.headers.get("origin") !== url.origin ||
          request.headers.get("sec-fetch-site") === "cross-site")
      )
        throw new FormHttpError(403, this.copy.denied);
      const gate = await this.admission.checkRequest(transport?.remoteAddress);
      if (gate.kind === "denied") throw this.denial(gate.reason);
      request.signal.throwIfAborted();
      if (url.pathname === this.thanksPath) {
        const receipt = url.searchParams.get("receipt");
        const results =
          receipt && this.receipts
            ? ((await this.receipts.read(receipt)) ?? [])
            : [];
        return this.page(
          renderThanks(this.form, presentation, this.copy, results),
          presentation,
        );
      }
      if (request.method === "GET") {
        const form = await this.admission.issue(transport?.remoteAddress);
        if (form.kind === "denied") throw this.denial(form.reason);
        return this.page(
          renderForm(this.form, {
            token: form.token,
            draft: this.prefill(url),
            presentation,
            copy: this.copy,
          }),
          presentation,
        );
      }
      if (
        request.headers
          .get("content-type")
          ?.split(";")[0]
          ?.trim()
          .toLowerCase() !== "application/x-www-form-urlencoded"
      )
        throw new FormHttpError(415, this.copy.mediaType);
      const posted = await readForm(
        request,
        this.policy.maxBodyBytes,
        this.policy.readTimeoutMs,
        this.fields,
        this.repeatable,
      );
      const { token: credential = "", ...answers } = posted;
      draft = answers;
      token =
        typeof credential === "string" && /^[a-f0-9]{64}$/.test(credential)
          ? credential
          : "";
      if (!token) throw this.denial("invalid-submission");
      const result = await this.intake.submit(
        token,
        answers,
        transport?.remoteAddress,
        request.signal,
      );
      if (result.kind === "denied") {
        errors = result.errors ?? {};
        throw this.denial(result.reason);
      }
      // The thanks page shows a scored submission's results through an
      // opaque receipt; what was submitted never goes in the URL.
      const query = new URLSearchParams({
        ...(this.receipts && result.results.length > 0
          ? { receipt: await this.receipts.issue(result.results) }
          : {}),
        ...(presentation.theme ? { theme: presentation.theme } : {}),
      }).toString();
      return new Response(null, {
        status: 303,
        headers: {
          ...headers,
          Location: `${this.thanksPath}${query ? `?${query}` : ""}`,
        },
      });
    } catch (error) {
      const failure =
        error instanceof FormHttpError ? error : this.denial("unavailable");
      const section = token
        ? renderForm(this.form, {
            token,
            draft,
            errors,
            notice: failure.message,
            presentation,
            copy: this.copy,
          })
        : renderRefused(this.form, failure.message, presentation, this.copy);
      return this.page(section, presentation, failure.status);
    }
  }
}
