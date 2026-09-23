import { expect, test, mock } from "bun:test";
import type { UploadBlobInput, AtprotoPdsClientConfig } from "../src";
import { AtprotoPdsClient, AcknowledgedAtprotoBlobError } from "../src";
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
