import { expect, test, mock } from "bun:test";
import assert from "node:assert/strict";
import { AtprotoPdsClient } from "../src";
const blob = {
  ref: { $link: "cid&other=value" },
  mimeType: "image/png",
  size: 70,
};
function setup(pdsEndpoint: string): {
  client: AtprotoPdsClient;
  calls: () => number;
} {
  const fetch = mock(async () =>
    Response.json({
      did: "did:plc:owner",
      handle: "owner.test",
      accessJwt: "secret-access",
      refreshJwt: "secret-refresh",
    }),
  );
  return {
    client: new AtprotoPdsClient({
      pdsEndpoint,
      identifier: "owner",
      appPassword: "secret-password",
      fetch,
    }),
    calls: () => fetch.mock.calls.length,
  };
}
test("blob URLs use the authenticated owner's DID and encode the opaque CID without credentials", async () => {
  const f = setup("http://127.0.0.1:8000/proxy/");
  const url = new URL(
    await f.client.getBlobUrl(blob, new AbortController().signal),
  );
  expect(url.pathname).toBe("/proxy/xrpc/com.atproto.sync.getBlob");
  expect(url.searchParams.get("did")).toBe("did:plc:owner");
  expect(url.searchParams.get("cid")).toBe(blob.ref.$link);
  expect(url.searchParams.size).toBe(2);
  expect(url.href).not.toContain("secret");
  expect(f.calls()).toBe(1);
});
test.each([
  "https://user:secret@pds.test",
  "https://pds.test?token=secret",
  "https://pds.test#secret",
  "ftp://pds.test",
])(
  "rejects unsafe public endpoints before authentication: %s",
  async (endpoint) => {
    const f = setup(endpoint);
    await assert.rejects(
      f.client.getBlobUrl(blob, new AbortController().signal),
    );
    expect(f.calls()).toBe(0);
  },
);
test("pre-abort prevents blob URL authentication", async () => {
  const f = setup("https://pds.test");
  const abort = new AbortController();
  abort.abort(new Error("cancelled"));
  await assert.rejects(f.client.getBlobUrl(blob, abort.signal), /cancelled/);
  expect(f.calls()).toBe(0);
});
