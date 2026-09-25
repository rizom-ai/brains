import { expect, test, mock, spyOn } from "bun:test";
import { ReceivedEntityFileHttpError } from "@brains/plugins";
import { createMockServicePluginContext } from "@brains/plugins/test";
import { collectAtprotoBlobEvidence } from "@brains/atproto-contracts";
import { PublishingTaskQueue } from "../src/publishing-tasks";
import { atprotoPublishFailedPayloadSchema } from "../src/publish-contracts";
import type { UploadBlobInput, AtprotoPdsClientConfig } from "../src";
import {
  AtprotoPdsClient,
  AcknowledgedAtprotoBlobError,
  ReceivedAtprotoBlobError,
} from "../src";
import type { FetchLike } from "@brains/utils/fetch-like";

type Transfers = NonNullable<
  ReturnType<NonNullable<AtprotoPdsClientConfig["getFileTransfers"]>>
>;
const input: UploadBlobInput = {
  sourceFile: "/fixture/cover.png",
  sizeBytes: 10,
  sha256: "a".repeat(64),
  mimeType: "image/png",
  signal: new AbortController().signal,
};
function session(): Response {
  return Response.json({
    did: "did:plc:test",
    handle: "test.example",
    accessJwt: "access",
    refreshJwt: "refresh",
  });
}
function client(
  postHttp?: Transfers["postHttp"],
  fetch: FetchLike = async (): Promise<Response> => session(),
): AtprotoPdsClient {
  return new AtprotoPdsClient({
    pdsEndpoint: "http://127.0.0.1:8000",
    identifier: "test",
    appPassword: "test",
    fetch,
    getFileTransfers: (): Transfers | undefined =>
      postHttp ? { postHttp } : undefined,
  });
}
async function rejection(pending: Promise<unknown>): Promise<unknown> {
  return pending.then(
    (): never => {
      throw new Error("Unexpected success");
    },
    (error: unknown): unknown => error,
  );
}
async function unexpected(): Promise<never> {
  throw new Error("Unexpected upload");
}

test("unprovisioned file uploads do not authenticate or fall back to fetch", async () => {
  const fetch = mock(async () => session());
  expect(await rejection(client(undefined, fetch).uploadBlob(input))).toEqual(
    new Error("AT Protocol file upload is not provisioned"),
  );
  expect(fetch).not.toHaveBeenCalled();
});

test.each(["before", "authentication"])(
  "cancellation at %s prevents binary submission",
  async (stage) => {
    const abort = new AbortController();
    const failure = new Error("Upload cancelled");
    const postHttp = mock(unexpected);
    const fetch = mock(async () => {
      abort.abort(failure);
      return session();
    });
    if (stage === "before") abort.abort(failure);
    expect(
      await rejection(
        client(postHttp, fetch).uploadBlob({ ...input, signal: abort.signal }),
      ),
    ).toBe(failure);
    expect(postHttp).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(stage === "before" ? 0 : 1);
  },
);

test("uncertain native failure is preserved and never replayed", async () => {
  const failure = new AggregateError(
    [new Error("Remote outcome unknown"), new Error("Retirement failed")],
    "Native POST failed",
  );
  const postHttp = mock(async (): Promise<never> => {
    throw failure;
  });
  expect(await rejection(client(postHttp).uploadBlob(input))).toBe(failure);
  expect(postHttp).toHaveBeenCalledTimes(1);
});

test.each([401, 500])(
  "explicit negative HTTP %d never produces a blob",
  async (statusCode) => {
    const postHttp = mock(async () => ({
      sizeBytes: input.sizeBytes,
      sha256: input.sha256,
      statusCode,
    }));
    expect(await rejection(client(postHttp).uploadBlob(input))).toEqual(
      new Error(`AT Protocol blob upload failed with ${statusCode}`),
    );
    expect(postHttp).toHaveBeenCalledTimes(1);
  },
);

test("mismatched successful receipt is retained as acknowledgement evidence", async () => {
  const postHttp = mock(async () => ({
    sizeBytes: input.sizeBytes,
    sha256: input.sha256,
    statusCode: 200,
    responseMetadata: { link: "received-cid", mimeType: "image/png", size: 9 },
  }));
  const error = await rejection(client(postHttp).uploadBlob(input));
  expect(error).toBeInstanceOf(AcknowledgedAtprotoBlobError);
  if (!(error instanceof AcknowledgedAtprotoBlobError)) throw error;
  expect(error.receipt.blob).toEqual({
    $type: "blob",
    ref: { $link: "received-cid" },
    mimeType: "image/png",
    size: 9,
  });
  expect(postHttp).toHaveBeenCalledTimes(1);
});

test("received file evidence reaches ambient reporting without promotion, diagnostics or replay", async () => {
  const failure = new ReceivedEntityFileHttpError(
    {
      sizeBytes: input.sizeBytes,
      sha256: input.sha256,
      statusCode: 201,
      responseMetadata: {
        link: "received-cid",
        mimeType: "image/png",
        size: 10,
        secret: "private provider token",
      },
    },
    new AggregateError(
      [new Error("private transport"), new Error("private retirement")],
      "private cause",
    ),
  );
  const postHttp = mock(async (): Promise<never> => {
    throw failure;
  });
  const error = await rejection(client(postHttp).uploadBlob(input));
  expect(error).toBeInstanceOf(ReceivedAtprotoBlobError);
  if (!(error instanceof ReceivedAtprotoBlobError)) throw error;
  expect(error.cause).toBe(failure);
  expect(error.receipt.blob.ref.$link).toBe("received-cid");
  expect(collectAtprotoBlobEvidence(error)?.nodes[0]?.status).toBe("received");
  const context = createMockServicePluginContext();
  const send = spyOn(context.messaging, "send");
  const logs = spyOn(context.logger, "error").mockImplementation(() => {});
  const queue = new PublishingTaskQueue(context.logger, () => true);
  try {
    await queue.runTrigger(
      context,
      {
        operation: "upsert-record",
        entityType: "post",
        entityId: "post-1",
        collection: "ai.rizom.brain.post",
      },
      async () => {
        throw error;
      },
    );
    const payload = atprotoPublishFailedPayloadSchema.parse(
      send.mock.calls[0]?.[0].payload,
    );
    expect(payload.recovery?.nodes[0]?.receipts?.[0]?.sha256).toBe(
      input.sha256,
    );
    expect(payload.recovery?.nodes[0]?.status).toBe("received");
    expect(JSON.stringify(payload)).not.toContain("private");
    expect(JSON.stringify(logs.mock.calls)).not.toContain("private");
    expect(postHttp).toHaveBeenCalledTimes(1);
  } finally {
    send.mockRestore();
    logs.mockRestore();
  }
});

test("late cancellation and caller mutation cannot erase or rebind a received outcome", async () => {
  const caller = new AbortController();
  const submitted = { ...input, signal: caller.signal };
  const cancellation = new Error("late cancellation");
  const failure = new ReceivedEntityFileHttpError(
    {
      sizeBytes: input.sizeBytes,
      sha256: input.sha256,
      statusCode: 201,
      responseMetadata: {
        link: "received-cid",
        mimeType: "image/jpeg",
        size: 9,
      },
    },
    cancellation,
  );
  const postHttp = mock(async (): Promise<never> => {
    caller.abort(cancellation);
    submitted.sha256 = "b".repeat(64);
    submitted.sizeBytes = 9;
    throw failure;
  });
  const error = await rejection(client(postHttp).uploadBlob(submitted));
  expect(error).toBeInstanceOf(ReceivedAtprotoBlobError);
  if (!(error instanceof ReceivedAtprotoBlobError)) throw error;
  expect(error.cause).toBe(failure);
  expect(error.receipt.blob.size).toBe(9);
  expect(
    collectAtprotoBlobEvidence(error)?.nodes[0]?.receipts?.[0]?.sha256,
  ).toBe(input.sha256);
  expect(postHttp).toHaveBeenCalledTimes(1);
});

test.each([
  "status",
  "fractional-status",
  "digest",
  "source-size",
  "blob",
  "unbranded",
  "hostile",
])(
  "invalid received %s evidence preserves the original failure",
  async (kind) => {
    const outcome = {
      sizeBytes: kind === "source-size" ? 9 : input.sizeBytes,
      sha256: kind === "digest" ? "b".repeat(64) : input.sha256,
      statusCode:
        kind === "status" ? 500 : kind === "fractional-status" ? 201.5 : 201,
      responseMetadata: {
        link: "received-cid",
        mimeType: "image/png",
        size: kind === "blob" ? "invalid" : 10,
      },
    };
    const error =
      kind === "unbranded"
        ? Object.assign(new Error("opaque"), { outcome })
        : new ReceivedEntityFileHttpError(outcome, new Error("retirement"));
    if (kind === "hostile")
      Object.defineProperty(error, "outcome", {
        get: (): never => {
          throw new Error("private accessor");
        },
      });
    const postHttp = mock(async (): Promise<never> => {
      throw error;
    });
    expect(await rejection(client(postHttp).uploadBlob(input))).toBe(error);
    expect(postHttp).toHaveBeenCalledTimes(1);
  },
);

test("oversized session metadata cannot advance to binary submission", async () => {
  const postHttp = mock(unexpected);
  expect(
    await rejection(
      client(postHttp, async (): Promise<Response> =>
        Response.json({ accessJwt: "x".repeat(65536) }),
      ).uploadBlob(input),
    ),
  ).toEqual(new Error("JSON response exceeds its byte limit"));
  expect(postHttp).not.toHaveBeenCalled();
});
