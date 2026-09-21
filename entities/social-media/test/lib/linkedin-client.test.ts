import { describe, it, expect } from "bun:test";
import assert from "node:assert/strict";
import {
  LinkedInClient,
  type LinkedInClientDeps,
  type LinkedInFileTransfers,
} from "../../src/lib/linkedin-client";
import type { PublishImageData, PublishMediaData } from "@brains/contracts";
import { createMockLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";

const image: PublishImageData = {
  sourceFile: "/loan/image.png",
  sizeBytes: 17,
  sha256: "a".repeat(64),
  mimeType: "image/png",
  signal: new AbortController().signal,
};
const document: PublishMediaData = {
  ...image,
  type: "document",
  sourceFile: "/loan/document.pdf",
  mimeType: "application/pdf",
  filename: "carousel.pdf",
};
interface Call {
  url: string;
  init: RequestInit;
}
interface Transport extends LinkedInClientDeps {
  fetch: NonNullable<LinkedInClientDeps["fetch"]>;
  calls: Call[];
  uploads: Parameters<LinkedInFileTransfers["putHttp"]>[0][];
}
function transport(
  respond: (call: Call, index: number) => Response,
  uploadError?: Error,
): Transport {
  const calls: Call[] = [];
  const uploads: Transport["uploads"] = [];
  const request = (url: string, init: RequestInit): Response => {
    const call = { url, init };
    calls.push(call);
    return respond(call, calls.length - 1);
  };
  return {
    calls,
    uploads,
    fetch: async (input, init) => request(String(input), init ?? {}),
    getFileTransfers: () => ({
      putHttp: async (
        input,
        options,
      ): ReturnType<LinkedInFileTransfers["putHttp"]> => {
        options?.signal?.throwIfAborted();
        uploads.push(input);
        if (uploadError) throw uploadError;
        const response = request(input.url, {
          method: "PUT",
          headers: input.headers,
          signal: options?.signal ?? null,
        });
        await response.body?.cancel();
        return {
          statusCode: response.status,
          sizeBytes: input.facts.sizeBytes,
          sha256: input.facts.sha256,
        };
      },
    }),
  };
}
const user = (): Response => Response.json({ sub: "user123" });
const created = (): Response =>
  new Response(null, { headers: { "X-RestLi-Id": "urn:li:share:123" } });
const imageUpload = (): Response =>
  Response.json({
    value: {
      uploadMechanism: {
        "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest": {
          uploadUrl: "https://api.linkedin.com/upload/image",
        },
      },
      asset: "urn:li:digitalmediaAsset:image",
    },
  });
const documentUpload = (): Response =>
  Response.json({
    value: {
      uploadUrl: "https://api.linkedin.com/upload/document",
      document: "urn:li:document:doc123",
    },
  });
function body(call: Call | undefined): Record<string, unknown> {
  assert.ok(call);
  assert.equal(typeof call.init.body, "string");
  return z
    .record(z.string(), z.unknown())
    .parse(JSON.parse(String(call.init.body)));
}
function client(
  deps: LinkedInClientDeps,
  organizationId?: string,
): LinkedInClient {
  return new LinkedInClient(
    { accessToken: "test-token", ...(organizationId && { organizationId }) },
    createMockLogger(),
    deps,
  );
}
const share = z.object({
  specificContent: z.object({
    "com.linkedin.ugc.ShareContent": z.object({
      shareMediaCategory: z.string(),
      media: z.unknown().optional(),
    }),
  }),
});

describe("LinkedIn scoped files", () => {
  it("publishes text-only posts without touching native transfers", async () => {
    const deps = transport((_call, index) =>
      index === 0 ? user() : created(),
    );
    expect((await client(deps).publish("Hello", {})).id).toBe(
      "urn:li:share:123",
    );
    expect(deps.calls).toHaveLength(2);
    expect(deps.uploads).toEqual([]);
    expect(
      share.parse(body(deps.calls[1])).specificContent[
        "com.linkedin.ugc.ShareContent"
      ].shareMediaCategory,
    ).toBe("NONE");
  });
  it("registers an image, delegates its loan to native PUT, and publishes IMAGE", async () => {
    const deps = transport((_call, index) =>
      index === 0
        ? user()
        : index === 1
          ? imageUpload()
          : index === 2
            ? new Response(null)
            : created(),
    );
    expect((await client(deps).publish("Image", {}, image)).id).toBe(
      "urn:li:share:123",
    );
    expect(deps.calls).toHaveLength(4);
    expect(deps.uploads).toEqual([
      {
        sourceFile: image.sourceFile,
        facts: { sizeBytes: image.sizeBytes, sha256: image.sha256 },
        url: "https://api.linkedin.com/upload/image",
        headers: {
          Authorization: "Bearer test-token",
          "Content-Type": "image/png",
        },
      },
    ]);
    expect(deps.calls[2]?.init.body).toBeUndefined();
    expect(
      share.parse(body(deps.calls[3])).specificContent[
        "com.linkedin.ugc.ShareContent"
      ],
    ).toMatchObject({ shareMediaCategory: "IMAGE", media: expect.any(Array) });
  });
  for (const phase of ["registration", "put"]) {
    it(`allows image text-only fallback only on a negative ${phase} receipt`, async () => {
      const deps = transport((_call, index) =>
        index === 0
          ? user()
          : index === 1
            ? phase === "registration"
              ? new Response("Rejected", { status: 500 })
              : imageUpload()
            : index === 2 && phase === "put"
              ? new Response(null, { status: 502 })
              : created(),
      );
      expect((await client(deps).publish("Text", {}, image)).id).toBe(
        "urn:li:share:123",
      );
      expect(
        share.parse(body(deps.calls.at(-1))).specificContent[
          "com.linkedin.ugc.ShareContent"
        ].shareMediaCategory,
      ).toBe("NONE");
      expect(deps.uploads).toHaveLength(phase === "put" ? 1 : 0);
    });
  }
  it("does not flatten native image transport/retirement causes or publish after uncertain PUT", async () => {
    const primary = new Error("remote outcome unknown");
    const cleanup = new Error("retirement failed");
    const error = new AggregateError([primary, cleanup], "upload failed", {
      cause: primary,
    });
    const deps = transport(
      (_call, index) => (index === 0 ? user() : imageUpload()),
      error,
    );
    await assert.rejects(
      client(deps).publish("Image", {}, image),
      (received: unknown) => received === error,
    );
    expect(deps.uploads).toHaveLength(1);
    expect(deps.calls).toHaveLength(2);
  });
  it("requires provisioned native uploads instead of falling back to buffered SDK bytes", async () => {
    const deps = transport((_call, index) =>
      index === 0 ? user() : imageUpload(),
    );
    await assert.rejects(
      client({ fetch: deps.fetch }).publish("Image", {}, image),
      /not provisioned/,
    );
    expect(deps.calls).toHaveLength(0);
  });
  it("initializes, uploads and publishes a native PDF post with versioned headers", async () => {
    const deps = transport((_call, index) =>
      index === 0
        ? user()
        : index === 1
          ? documentUpload()
          : index === 2
            ? new Response(null)
            : created(),
    );
    expect(
      (await client(deps).publish("PDF", {}, undefined, [document])).id,
    ).toBe("urn:li:share:123");
    expect(deps.calls).toHaveLength(4);
    expect(deps.calls[1]?.url).toBe(
      "https://api.linkedin.com/rest/documents?action=initializeUpload",
    );
    expect(deps.calls[1]?.init.headers).toMatchObject({
      Authorization: "Bearer test-token",
      "Content-Type": "application/json",
      "Linkedin-Version": "202604",
      "X-Restli-Protocol-Version": "2.0.0",
    });
    expect(body(deps.calls[1])).toEqual({
      initializeUploadRequest: { owner: "urn:li:person:user123" },
    });
    expect(deps.uploads).toEqual([
      {
        sourceFile: document.sourceFile,
        facts: { sizeBytes: document.sizeBytes, sha256: document.sha256 },
        url: "https://api.linkedin.com/upload/document",
        headers: {
          Authorization: "Bearer test-token",
          "Content-Type": "application/pdf",
        },
      },
    ]);
    expect(deps.calls[3]?.url).toBe("https://api.linkedin.com/rest/posts");
    expect(deps.calls[3]?.init.headers).toMatchObject({
      "Linkedin-Version": "202604",
      "X-Restli-Protocol-Version": "2.0.0",
    });
    expect(body(deps.calls[3])).toEqual({
      author: "urn:li:person:user123",
      commentary: "PDF",
      visibility: "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      content: {
        media: { id: "urn:li:document:doc123", title: "carousel.pdf" },
      },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    });
  });
  for (const [step, message] of [
    [1, /document upload initialization failed: 500/],
    [2, /document binary upload failed: 500/],
    [3, /document post API error: 500/],
  ] as const) {
    it(`stops without replay or text fallback on PDF stage ${step} failure`, async () => {
      const deps = transport((_call, index) =>
        index === step
          ? new Response("Rejected", { status: 500 })
          : index === 0
            ? user()
            : index === 1
              ? documentUpload()
              : new Response(null),
      );
      await assert.rejects(
        client(deps).publish("PDF", {}, undefined, [document]),
        message,
      );
      expect(deps.calls).toHaveLength(step + 1);
    });
  }
  it("propagates loan cancellation before registration or posting", async () => {
    const abort = new AbortController();
    const reason = new Error("loan retired");
    abort.abort(reason);
    const deps = transport(() => created());
    await assert.rejects(
      client(deps).publish("Image", {}, { ...image, signal: abort.signal }),
      (error: unknown) => error === reason,
    );
    expect(deps.calls).toEqual([]);
    expect(deps.uploads).toEqual([]);
  });
  it("does not start a post if the loan is cancelled after native PUT", async () => {
    const abort = new AbortController();
    const reason = new Error("cancel after upload");
    const deps = transport((_call, index) => {
      if (index === 2) abort.abort(reason);
      return index === 0
        ? user()
        : index === 1
          ? imageUpload()
          : new Response(null);
    });
    await assert.rejects(
      client(deps).publish("Image", {}, { ...image, signal: abort.signal }),
      (error: unknown) => error === reason,
    );
    expect(deps.calls).toHaveLength(3);
  });
  it("preserves acknowledged post receipts when response retirement fails", async () => {
    const cleanup = new Error("response cleanup failed");
    const logger = createMockLogger();
    const deps = transport(
      () =>
        new Response(
          new ReadableStream({
            cancel: (): never => {
              throw cleanup;
            },
          }),
          { headers: { "X-RestLi-Id": "urn:li:share:ack" } },
        ),
    );
    const publisher = new LinkedInClient(
      { accessToken: "token", organizationId: "org" },
      logger,
      deps,
    );
    const result = await publisher.publish("Text", {});
    expect(result.id).toBe("urn:li:share:ack");
    expect(result.metadata?.["responseRetirementFailed"]).toBe(true);
    expect(deps.calls).toHaveLength(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ error: cleanup }),
    );
  });
  it("bounds API error text", async () => {
    const deps = transport(
      () => new Response("x".repeat(500), { status: 500 }),
    );
    await assert.rejects(
      client(deps, "org").publish("Text", {}),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        expect(error.message).toContain("truncated");
        expect(error.message.length).toBeLessThan(500);
        return true;
      },
    );
  });
  it("uses the organization for image registration and post authorship without a personal lookup", async () => {
    const deps = transport((_call, index) =>
      index === 0
        ? imageUpload()
        : index === 1
          ? new Response(null)
          : created(),
    );
    await client(deps, "12345").publish("Organization", {}, image);
    expect(deps.calls).toHaveLength(3);
    expect(body(deps.calls[0])).toMatchObject({
      registerUploadRequest: { owner: "urn:li:organization:12345" },
    });
    expect(body(deps.calls[2])["author"]).toBe("urn:li:organization:12345");
  });
  it("rejects oversized registration metadata without attempting upload or publication", async () => {
    const deps = transport((_call, index) =>
      index === 0 ? user() : Response.json({ padding: "x".repeat(65536) }),
    );
    await assert.rejects(client(deps).publish("Image", {}, image));
    expect(deps.calls).toHaveLength(2);
    expect(deps.uploads).toHaveLength(0);
  });
  it("validates personal, missing and organization credentials", async () => {
    expect(await client(transport(() => user())).validateCredentials()).toBe(
      true,
    );
    expect(
      await new LinkedInClient(
        { accessToken: "" },
        createMockLogger(),
      ).validateCredentials(),
    ).toBe(false);
    const deps = transport(() => Response.json({ id: 12345 }));
    expect(await client(deps, "12345").validateCredentials()).toBe(true);
    expect(deps.calls[0]?.url).toContain("/organizations/12345");
    expect(
      await client(
        transport(() => new Response(null, { status: 403 })),
        "org",
      ).validateCredentials(),
    ).toBe(false);
  });
});
