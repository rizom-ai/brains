import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import type { LinkedInImportJobData } from "../src/handlers/linkedin-import-handler";
import type {
  LinkedInProfessionalSnapshotDomain,
  LinkedInSnapshotRecord,
} from "../src/lib/linkedin-client";
import {
  createLinkedInImportRoutes,
  LINKEDIN_ADMIN_IMPORT_PATH,
  LINKEDIN_ADMIN_PREVIEW_PATH,
} from "../src/lib/linkedin-import-routes";
import { LinkedInImportReviewStore } from "../src/lib/linkedin-import-review-store";
import { profileImportPreviewDigest } from "../src/lib/profile-import-digest";
import {
  LINKEDIN_ADMIN_MUTATION_ACTIONS,
  type LinkedInAnchorSession,
} from "../src/lib/linkedin-oauth-routes";

const origin = "https://brain.example";
const reviewId = "review-0000000000000000000000000000000000";
const profileContent = `---
name: Owner Name
---
Owner-authored story.
`;

const source = {
  fetchDomain: async (
    _domain: LinkedInProfessionalSnapshotDomain,
  ): Promise<LinkedInSnapshotRecord[]> => [
    {
      "First Name": "Imported",
      "Last Name": "Name",
      Headline: "Imported headline",
      Summary: "Imported story",
    },
  ],
};

function sessionResolver(
  request: Request,
): Promise<LinkedInAnchorSession | undefined> {
  const sessionId = request.headers.get("x-test-session");
  return Promise.resolve(
    sessionId ? { id: sessionId, subject: "anchor" } : undefined,
  );
}

function adminRequest(
  path: string,
  body: unknown,
  options: {
    sessionId?: string | undefined;
    requestOrigin?: string | undefined;
  } = {},
): Request {
  return new Request(`${origin}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: options.requestOrigin ?? origin,
      ...(options.sessionId ? { "x-test-session": options.sessionId } : {}),
    },
    body: JSON.stringify(body),
  });
}

function findRoute(
  routes: ReturnType<typeof createLinkedInImportRoutes>,
  path: string,
): ReturnType<typeof createLinkedInImportRoutes>[number] {
  const route = routes.find((candidate) => candidate.path === path);
  if (!route) throw new Error(`Missing route: ${path}`);
  return route;
}

function createRoutes(
  enqueued: LinkedInImportJobData[] = [],
): ReturnType<typeof createLinkedInImportRoutes> {
  return createLinkedInImportRoutes({
    source,
    getAnchorProfile: async () => ({ content: profileContent }),
    enqueueImport: async (data): Promise<string> => {
      enqueued.push(data);
      return "job-one";
    },
    resolveAnchorSession: sessionResolver,
    reviewStore: new LinkedInImportReviewStore({
      generateReviewId: (): string => reviewId,
    }),
  });
}

describe("LinkedIn import review routes", () => {
  it("requires an Anchor session, same origin, and an exact preview action", async () => {
    const preview = findRoute(createRoutes(), LINKEDIN_ADMIN_PREVIEW_PATH);

    const unauthenticated = await preview.handler(
      adminRequest(LINKEDIN_ADMIN_PREVIEW_PATH, {
        action: LINKEDIN_ADMIN_MUTATION_ACTIONS.previewLinkedInImport,
      }),
    );
    const crossOrigin = await preview.handler(
      adminRequest(
        LINKEDIN_ADMIN_PREVIEW_PATH,
        { action: LINKEDIN_ADMIN_MUTATION_ACTIONS.previewLinkedInImport },
        { sessionId: "session-one", requestOrigin: "https://attacker.example" },
      ),
    );
    const wrongAction = await preview.handler(
      adminRequest(
        LINKEDIN_ADMIN_PREVIEW_PATH,
        { action: "importEverything" },
        { sessionId: "session-one" },
      ),
    );

    expect(unauthenticated.status).toBe(403);
    expect(crossOrigin.status).toBe(403);
    expect(wrongAction.status).toBe(400);
  });

  it("returns a field-level deterministic preview behind an opaque review id", async () => {
    const preview = findRoute(createRoutes(), LINKEDIN_ADMIN_PREVIEW_PATH);
    const response = await preview.handler(
      adminRequest(
        LINKEDIN_ADMIN_PREVIEW_PATH,
        { action: LINKEDIN_ADMIN_MUTATION_ACTIONS.previewLinkedInImport },
        { sessionId: "session-one" },
      ),
    );
    const body = z
      .object({
        reviewId: z.string(),
        expiresAt: z.number(),
        recordsRead: z.number(),
        changed: z.boolean(),
        fields: z.array(
          z.object({
            field: z.string(),
            outcome: z.string(),
            currentValue: z.unknown(),
            importedValue: z.unknown(),
          }),
        ),
      })
      .parse(await response.json());

    expect(response.status).toBe(200);
    expect(body.reviewId).toBe(reviewId);
    expect(body.recordsRead).toBe(1);
    expect(body.changed).toBe(true);
    expect(body.fields).toEqual([
      {
        field: "name",
        outcome: "preserve",
        currentValue: "Owner Name",
        importedValue: "Imported Name",
      },
      {
        field: "headline",
        outcome: "fill",
        currentValue: null,
        importedValue: "Imported headline",
      },
      {
        field: "story",
        outcome: "preserve",
        currentValue: "Owner-authored story.",
        importedValue: "Imported story",
      },
    ]);
    expect(JSON.stringify(body)).not.toContain("expectedPreviewDigest");
  });

  it("queues a reviewed digest once for the same Anchor session", async () => {
    const enqueued: LinkedInImportJobData[] = [];
    const routes = createRoutes(enqueued);
    const preview = findRoute(routes, LINKEDIN_ADMIN_PREVIEW_PATH);
    const importRoute = findRoute(routes, LINKEDIN_ADMIN_IMPORT_PATH);
    await preview.handler(
      adminRequest(
        LINKEDIN_ADMIN_PREVIEW_PATH,
        { action: LINKEDIN_ADMIN_MUTATION_ACTIONS.previewLinkedInImport },
        { sessionId: "session-one" },
      ),
    );
    const body = {
      action: LINKEDIN_ADMIN_MUTATION_ACTIONS.importLinkedInProfile,
      confirmation: LINKEDIN_ADMIN_MUTATION_ACTIONS.importLinkedInProfile,
      reviewId,
    };

    const wrongSession = await importRoute.handler(
      adminRequest(LINKEDIN_ADMIN_IMPORT_PATH, body, {
        sessionId: "session-two",
      }),
    );
    const accepted = await importRoute.handler(
      adminRequest(LINKEDIN_ADMIN_IMPORT_PATH, body, {
        sessionId: "session-one",
      }),
    );
    const replay = await importRoute.handler(
      adminRequest(LINKEDIN_ADMIN_IMPORT_PATH, body, {
        sessionId: "session-one",
      }),
    );

    expect(wrongSession.status).toBe(409);
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toEqual({ queued: true, jobId: "job-one" });
    expect(replay.status).toBe(409);
    expect(enqueued).toEqual([
      {
        expectedPreviewDigest: profileImportPreviewDigest(
          {
            name: "Imported Name",
            headline: "Imported headline",
            story: "Imported story",
          },
          profileContent,
        ),
      },
    ]);
  });
});
