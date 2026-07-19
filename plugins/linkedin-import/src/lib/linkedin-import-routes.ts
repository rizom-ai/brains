import type { WebRouteDefinition } from "@brains/plugins";
import { parseMarkdownWithFrontmatter } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import type { LinkedInImportJobData } from "../handlers/linkedin-import-handler";
import { LinkedInImportReviewStore } from "./linkedin-import-review-store";
import { loadLinkedInProfileImport } from "./load-profile-import";
import { mergeProfileImport } from "./merge-profile";
import {
  LINKEDIN_ADMIN_MUTATION_ACTIONS,
  type LinkedInAnchorSessionResolver,
} from "./linkedin-oauth-routes";
import { profileImportPreviewDigest } from "./profile-import-digest";
import type { ProfessionalProfileImportPatch } from "./transform/profile-mapper";
import type { LinkedInProfessionalSnapshotSource } from "./load-profile-import";

export const LINKEDIN_ADMIN_PREVIEW_PATH = "/linkedin/admin/preview";
export const LINKEDIN_ADMIN_IMPORT_PATH = "/linkedin/admin/import";

export interface LinkedInImportPreviewRequest {
  action: typeof LINKEDIN_ADMIN_MUTATION_ACTIONS.previewLinkedInImport;
}

export interface LinkedInImportRequest {
  action: typeof LINKEDIN_ADMIN_MUTATION_ACTIONS.importLinkedInProfile;
  confirmation: typeof LINKEDIN_ADMIN_MUTATION_ACTIONS.importLinkedInProfile;
  reviewId: string;
}

export type LinkedInImportPreviewOutcome =
  "fill" | "append" | "append-and-preserve" | "preserve" | "unchanged";

export type LinkedInImportPreviewValue =
  | string
  | number
  | boolean
  | null
  | LinkedInImportPreviewValue[]
  | { [key: string]: LinkedInImportPreviewValue };

export interface LinkedInImportPreviewField {
  field: keyof ProfessionalProfileImportPatch;
  outcome: LinkedInImportPreviewOutcome;
  currentValue: LinkedInImportPreviewValue;
  importedValue: LinkedInImportPreviewValue;
}

export interface LinkedInImportPreviewResponse {
  reviewId: string;
  expiresAt: number;
  recordsRead: number;
  changed: boolean;
  fields: LinkedInImportPreviewField[];
}

export interface LinkedInImportResponse {
  queued: true;
  jobId: string;
}

export interface LinkedInImportRoutesOptions {
  source: LinkedInProfessionalSnapshotSource;
  getAnchorProfile: () => Promise<{ content: string } | null | undefined>;
  enqueueImport: (data: LinkedInImportJobData) => Promise<string>;
  resolveAnchorSession: LinkedInAnchorSessionResolver;
  reviewStore?: LinkedInImportReviewStore | undefined;
  reportError?: ((message: string) => void) | undefined;
}

const previewRequestSchema: z.ZodType<LinkedInImportPreviewRequest> = z
  .object({
    action: z.literal(LINKEDIN_ADMIN_MUTATION_ACTIONS.previewLinkedInImport),
  })
  .strict();

const importRequestSchema: z.ZodType<LinkedInImportRequest> = z
  .object({
    action: z.literal(LINKEDIN_ADMIN_MUTATION_ACTIONS.importLinkedInProfile),
    confirmation: z.literal(
      LINKEDIN_ADMIN_MUTATION_ACTIONS.importLinkedInProfile,
    ),
    reviewId: z.string().min(32).max(512),
  })
  .strict();

const frontmatterSchema = z.record(z.string(), z.unknown());
const previewValueSchema: z.ZodType<LinkedInImportPreviewValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(previewValueSchema),
    z.record(z.string(), previewValueSchema),
  ]),
);
const previewFields: Array<keyof ProfessionalProfileImportPatch> = [
  "name",
  "headline",
  "industry",
  "location",
  "website",
  "skills",
  "positions",
  "education",
  "certifications",
  "story",
];
const collectionFields = new Set<keyof ProfessionalProfileImportPatch>([
  "skills",
  "positions",
  "education",
  "certifications",
]);

const privateHeaders = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

function privateJson(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: privateHeaders });
}

function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  return origin !== null && origin === new URL(request.url).origin;
}

async function readJson(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return undefined;
  }
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

function previewOutcome(
  field: keyof ProfessionalProfileImportPatch,
  applied: Set<string>,
  preserved: Set<string>,
): LinkedInImportPreviewOutcome {
  const isApplied = applied.has(field);
  const isPreserved = preserved.has(field);
  if (isApplied && isPreserved) return "append-and-preserve";
  if (isApplied) return collectionFields.has(field) ? "append" : "fill";
  if (isPreserved) return "preserve";
  return "unchanged";
}

function previewValue(value: unknown): LinkedInImportPreviewValue {
  return previewValueSchema.parse(value);
}

function buildPreviewFields(
  currentContent: string,
  patch: ProfessionalProfileImportPatch,
  appliedFields: string[],
  preservedFields: string[],
): LinkedInImportPreviewField[] {
  const current = parseMarkdownWithFrontmatter(
    currentContent,
    frontmatterSchema,
  );
  const applied = new Set(appliedFields);
  const preserved = new Set(preservedFields);
  const fields: LinkedInImportPreviewField[] = [];

  for (const field of previewFields) {
    const importedValue = patch[field];
    if (importedValue === undefined) continue;
    fields.push({
      field,
      outcome: previewOutcome(field, applied, preserved),
      currentValue: previewValue(
        field === "story" ? current.content : (current.metadata[field] ?? null),
      ),
      importedValue: previewValue(importedValue),
    });
  }
  return fields;
}

/** Anchor-only deterministic preview and one-time reviewed import routes. */
export function createLinkedInImportRoutes(
  options: LinkedInImportRoutesOptions,
): WebRouteDefinition[] {
  const reviewStore = options.reviewStore ?? new LinkedInImportReviewStore();
  const reportError = (message: string): void => options.reportError?.(message);

  return [
    {
      path: LINKEDIN_ADMIN_PREVIEW_PATH,
      method: "POST",
      public: true,
      handler: async (request): Promise<Response> => {
        const session = await options.resolveAnchorSession(request);
        if (!session) {
          return privateJson({ error: "Anchor session required" }, 403);
        }
        if (!isSameOriginRequest(request)) {
          return privateJson({ error: "Same-origin request required" }, 403);
        }
        const parsedRequest = previewRequestSchema.safeParse(
          await readJson(request),
        );
        if (!parsedRequest.success) {
          return privateJson(
            { error: "Invalid LinkedIn preview request" },
            400,
          );
        }

        try {
          const loaded = await loadLinkedInProfileImport(options.source);
          const profile = await options.getAnchorProfile();
          if (!profile) {
            return privateJson({ error: "Anchor profile not found" }, 404);
          }
          const merged = mergeProfileImport(profile.content, loaded.patch);
          const review = reviewStore.issue(
            session.id,
            profileImportPreviewDigest(loaded.patch, profile.content),
          );
          return privateJson({
            reviewId: review.reviewId,
            expiresAt: review.expiresAt,
            recordsRead: loaded.recordsRead,
            changed: merged.changed,
            fields: buildPreviewFields(
              profile.content,
              loaded.patch,
              merged.appliedFields,
              merged.preservedFields,
            ),
          } satisfies LinkedInImportPreviewResponse);
        } catch {
          reportError("Failed to preview LinkedIn profile import");
          return privateJson(
            { error: "LinkedIn import preview unavailable" },
            502,
          );
        }
      },
    },
    {
      path: LINKEDIN_ADMIN_IMPORT_PATH,
      method: "POST",
      public: true,
      handler: async (request): Promise<Response> => {
        const session = await options.resolveAnchorSession(request);
        if (!session) {
          return privateJson({ error: "Anchor session required" }, 403);
        }
        if (!isSameOriginRequest(request)) {
          return privateJson({ error: "Same-origin request required" }, 403);
        }
        const parsedRequest = importRequestSchema.safeParse(
          await readJson(request),
        );
        if (!parsedRequest.success) {
          return privateJson({ error: "Invalid LinkedIn import request" }, 400);
        }
        const previewDigest = reviewStore.consume(
          parsedRequest.data.reviewId,
          session.id,
        );
        if (!previewDigest) {
          return privateJson(
            {
              error: "Invalid, expired, or already used LinkedIn import review",
            },
            409,
          );
        }

        try {
          const jobId = await options.enqueueImport({
            expectedPreviewDigest: previewDigest,
          });
          return privateJson({
            queued: true,
            jobId,
          } satisfies LinkedInImportResponse);
        } catch {
          reportError("Failed to enqueue reviewed LinkedIn profile import");
          return privateJson(
            { error: "LinkedIn import could not be queued" },
            500,
          );
        }
      },
    },
  ];
}
