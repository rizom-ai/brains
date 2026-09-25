import { expect, test } from "bun:test";
import assert from "node:assert/strict";
import { createMockLogger } from "@brains/test-utils";
import {
  LinkedInClient,
  PartialLinkedInUploadError,
  type LinkedInFileTransfers,
} from "../../src/lib/linkedin-client";
import { AcknowledgedLinkedInPostError } from "../../src/lib/linkedin-post-error";
import { collectLinkedInUploadEvidence } from "../../src/lib/linkedin-upload-evidence";
import type { PublishMediaData } from "@brains/contracts";

test.each([
  "https://private/token",
  "urn:li:share:id\n",
  `urn:li:share:${"a".repeat(300)}`,
])("unsafe post identifiers stay out of recovery: %s", (id) => {
  const original = new Error("private cause");
  const failure = new AcknowledgedLinkedInPostError(id, original);
  expect(failure.cause).toBe(original);
  expect(failure.receipt).toBeUndefined();
  const evidence = collectLinkedInUploadEvidence(failure);
  expect(evidence?.invalid).toBe(true);
  expect(evidence?.nodes.some((node) => node.post !== undefined)).toBe(false);
  expect(JSON.stringify(evidence)).not.toContain("private");
});

for (const kind of ["text", "image", "document"] as const) {
  test.each(["info", "warning", "both"])(
    `${kind} retains acknowledged post through %s failure and joins response retirement`,
    async (failure) => {
      const logger = createMockLogger();
      const diagnostic = new Error("private diagnostic");
      const retirement = new Error("private retirement");
      const abort = new AbortController();
      const entered = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      let posts = 0;
      let uploads = 0;
      let settled = false;
      logger.info = (message): void => {
        if (failure !== "warning" && message.includes("post created"))
          throw diagnostic;
      };
      logger.warn = (): never => {
        throw diagnostic;
      };
      const publisher = new LinkedInClient(
        { accessToken: "secret", organizationId: "123" },
        logger,
        {
          fetch: async (input): Promise<Response> => {
            if (String(input).includes("registerUpload"))
              return Response.json({
                value: {
                  asset: "urn:li:digitalmediaAsset:image",
                  uploadMechanism: {
                    "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest":
                      { uploadUrl: "https://private/upload" },
                  },
                },
              });
            if (String(input).includes("initializeUpload"))
              return Response.json({
                value: {
                  document: "urn:li:document:doc",
                  uploadUrl: "https://private/upload",
                },
              });
            posts++;
            abort.abort(new Error("late cancellation"));
            return new Response(
              new ReadableStream({
                cancel: async (): Promise<void> => {
                  entered.resolve();
                  await release.promise;
                  if (failure !== "info") throw retirement;
                },
              }),
              { headers: { "X-RestLi-Id": "urn:li:share:known" } },
            );
          },
          getFileTransfers: (): LinkedInFileTransfers => ({
            putHttp: async (
              request,
            ): ReturnType<LinkedInFileTransfers["putHttp"]> => {
              uploads++;
              return { ...request.facts, statusCode: 200 };
            },
          }),
        },
      );
      const source: PublishMediaData = {
        type: "document",
        sourceFile: "/loan/source",
        mimeType: "application/pdf",
        filename: "file.pdf",
        sha256: "a".repeat(64),
        sizeBytes: 17,
        signal: abort.signal,
      };
      const work = publisher
        .publish(
          "Post",
          {},
          kind === "image" ? { ...source, mimeType: "image/png" } : undefined,
          kind === "document" ? [source] : undefined,
        )
        .finally(() => {
          settled = true;
        });
      try {
        await Promise.race([entered.promise, work]);
        expect(settled).toBe(false);
      } finally {
        release.resolve();
      }
      await assert.rejects(work, (error: unknown) => {
        const acknowledged =
          error instanceof PartialLinkedInUploadError ? error.cause : error;
        assert.ok(acknowledged instanceof AcknowledgedLinkedInPostError);
        if (failure === "info") assert.equal(acknowledged.cause, diagnostic);
        else {
          assert.ok(acknowledged.cause instanceof AggregateError);
          assert.deepEqual(
            acknowledged.cause.errors,
            failure === "both"
              ? [diagnostic, retirement, diagnostic]
              : [retirement, diagnostic],
          );
        }
        const evidence = collectLinkedInUploadEvidence(error);
        assert.ok(evidence);
        assert.ok(
          evidence.nodes.some((node) => node.post?.id === "urn:li:share:known"),
        );
        assert.equal(evidence.uploads.length, kind === "text" ? 0 : 1);
        assert.ok(!JSON.stringify(evidence).includes("private"));
        assert.ok(!JSON.stringify(evidence).includes("secret"));
        return true;
      });
      expect(posts).toBe(1);
      expect(uploads).toBe(kind === "text" ? 0 : 1);
    },
  );
}
