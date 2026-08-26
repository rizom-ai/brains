import { describe, expect, it } from "bun:test";
import {
  ClientMetadataDocumentError,
  ClientMetadataDocumentResolver,
  type ResolvedAddress,
} from "../src/client-metadata-document";

const CLIENT_ID = "https://client.example/oauth/metadata.json";
const PUBLIC_ADDRESS = [{ address: "93.184.216.34", family: 4 }];

function metadataResponse(
  body: Record<string, unknown> = {},
  headers: HeadersInit = {},
): Response {
  return Response.json(
    {
      client_id: CLIENT_ID,
      client_name: "Example Client",
      redirect_uris: ["http://127.0.0.1:6274/oauth/callback"],
      token_endpoint_auth_method: "none",
      ...body,
    },
    { headers },
  );
}

async function rejectedError(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
  throw new Error("Expected promise to reject");
}

describe("ClientMetadataDocumentResolver", () => {
  it("drops grant types it does not support instead of rejecting the document", async () => {
    // Claude's published document declares a third grant it never exercises
    // against this server. Rejecting the document locked the client out.
    const resolver = new ClientMetadataDocumentResolver({
      fetch: (): Promise<Response> =>
        Promise.resolve(
          metadataResponse({
            grant_types: [
              "authorization_code",
              "refresh_token",
              "urn:ietf:params:oauth:grant-type:jwt-bearer",
            ],
          }),
        ),
      resolveAddresses: (): Promise<ResolvedAddress[]> =>
        Promise.resolve(PUBLIC_ADDRESS),
    });

    const client = await resolver.resolve(CLIENT_ID);

    expect(client.grant_types).toEqual(["authorization_code", "refresh_token"]);
  });

  it("rejects a document whose grant types drop authorization_code", async () => {
    const resolver = new ClientMetadataDocumentResolver({
      fetch: (): Promise<Response> =>
        Promise.resolve(
          metadataResponse({
            grant_types: ["urn:ietf:params:oauth:grant-type:jwt-bearer"],
          }),
        ),
      resolveAddresses: (): Promise<ResolvedAddress[]> =>
        Promise.resolve(PUBLIC_ADDRESS),
    });

    const error = await rejectedError(resolver.resolve(CLIENT_ID));

    expect(error).toBeInstanceOf(ClientMetadataDocumentError);
  });

  it("fetches, validates, and caches client metadata using HTTP cache headers", async () => {
    let fetchCount = 0;
    const resolver = new ClientMetadataDocumentResolver({
      fetch: (): Promise<Response> => {
        fetchCount += 1;
        return Promise.resolve(
          metadataResponse(
            { application_type: "native" },
            { "cache-control": "public, max-age=60" },
          ),
        );
      },
      resolveAddresses: (): Promise<ResolvedAddress[]> =>
        Promise.resolve(PUBLIC_ADDRESS),
    });

    const first = await resolver.resolve(CLIENT_ID);
    const second = await resolver.resolve(CLIENT_ID);

    expect(first).toMatchObject({
      client_id: CLIENT_ID,
      client_name: "Example Client",
      application_type: "native",
      token_endpoint_auth_method: "none",
    });
    expect(second).toEqual(first);
    expect(fetchCount).toBe(1);
  });

  it("requires an exact client_id match and exact redirect URI metadata", async () => {
    const resolver = new ClientMetadataDocumentResolver({
      fetch: (): Promise<Response> =>
        Promise.resolve(
          metadataResponse({ client_id: "https://other.example/client.json" }),
        ),
      resolveAddresses: (): Promise<ResolvedAddress[]> =>
        Promise.resolve(PUBLIC_ADDRESS),
    });

    expect(
      (await rejectedError(resolver.resolve(CLIENT_ID))).message,
    ).toContain("client_id must exactly match");
  });

  it("rejects unsafe document URLs before fetching them", async () => {
    let fetched = false;
    const resolver = new ClientMetadataDocumentResolver({
      fetch: (): Promise<Response> => {
        fetched = true;
        return Promise.resolve(metadataResponse());
      },
      resolveAddresses: (): Promise<ResolvedAddress[]> =>
        Promise.resolve([{ address: "127.0.0.1", family: 4 }]),
    });

    expect(
      await rejectedError(resolver.resolve("https://localhost/client.json")),
    ).toBeInstanceOf(ClientMetadataDocumentError);
    expect(
      (
        await rejectedError(
          resolver.resolve("https://client.example/client.json"),
        )
      ).message,
    ).toContain("non-public network address");
    expect(
      (
        await rejectedError(
          resolver.resolve("https://[0:0:0:0:0:ffff:7f00:1]/client.json"),
        )
      ).message,
    ).toContain("non-public network address");
    expect(fetched).toBe(false);
  });

  it("validates every redirect destination before following it", async () => {
    let fetchCount = 0;
    const resolver = new ClientMetadataDocumentResolver({
      fetch: (): Promise<Response> => {
        fetchCount += 1;
        return Promise.resolve(
          new Response(null, {
            status: 302,
            headers: { location: "https://internal.example/client.json" },
          }),
        );
      },
      resolveAddresses: (hostname): Promise<ResolvedAddress[]> =>
        Promise.resolve(
          hostname === "client.example"
            ? PUBLIC_ADDRESS
            : [{ address: "10.0.0.1", family: 4 }],
        ),
    });

    expect(
      (await rejectedError(resolver.resolve(CLIENT_ID))).message,
    ).toContain("non-public network address");
    expect(fetchCount).toBe(1);
  });

  it("rejects invalid URL forms and oversized documents", async () => {
    const resolver = new ClientMetadataDocumentResolver({
      fetch: (): Promise<Response> =>
        Promise.resolve(
          new Response("x".repeat(5 * 1024 + 1), {
            headers: { "content-type": "application/json" },
          }),
        ),
      resolveAddresses: (): Promise<ResolvedAddress[]> =>
        Promise.resolve(PUBLIC_ADDRESS),
    });

    for (const clientId of [
      "http://client.example/client.json",
      "https://client.example/",
      "https://user:password@client.example/client.json",
      "https://client.example/a/../client.json",
      "https://client.example/client.json#fragment",
    ]) {
      expect(await rejectedError(resolver.resolve(clientId))).toBeInstanceOf(
        ClientMetadataDocumentError,
      );
    }
    expect(
      (await rejectedError(resolver.resolve(CLIENT_ID))).message,
    ).toContain("exceeds 5120 bytes");
  });

  it("rejects symmetric secrets and unsupported client authentication", async () => {
    const resolver = new ClientMetadataDocumentResolver({
      fetch: (): Promise<Response> =>
        Promise.resolve(
          metadataResponse({
            token_endpoint_auth_method: "client_secret_post",
            client_secret: "not-allowed",
          }),
        ),
      resolveAddresses: (): Promise<ResolvedAddress[]> =>
        Promise.resolve(PUBLIC_ADDRESS),
    });

    expect(
      (await rejectedError(resolver.resolve(CLIENT_ID))).message,
    ).toContain("public clients using token_endpoint_auth_method none");
  });
});
