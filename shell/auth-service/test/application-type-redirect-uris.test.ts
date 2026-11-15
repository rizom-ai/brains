import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AuthRuntimeDatabase,
  InvalidClientMetadataError,
  RuntimeOAuthClientStore,
} from "../src";
import {
  ClientMetadataDocumentError,
  ClientMetadataDocumentResolver,
  type ResolvedAddress,
} from "../src/client-metadata-document";

const CLIENT_ID = "https://client.example/oauth/metadata.json";
const PUBLIC_ADDRESS: ResolvedAddress[] = [
  { address: "93.184.216.34", family: 4 },
];
const WEB_REFUSAL = "web application redirect_uris must use HTTPS";
const NATIVE_REFUSAL =
  "native application HTTP redirect_uris must use a loopback host";

interface RedirectRuleCase {
  name: string;
  applicationType?: "native" | "web";
  redirectUris: string[];
  refusal?: string;
}

/*
 * Dynamic registration and client metadata documents apply one
 * application_type rule to their redirect URIs. Each case pins the refusal
 * message (or acceptance) on both surfaces.
 */
const cases: RedirectRuleCase[] = [
  {
    name: "a web client on HTTPS",
    applicationType: "web",
    redirectUris: ["https://client.example/callback"],
  },
  {
    name: "a web client on plain HTTP",
    applicationType: "web",
    redirectUris: ["http://client.example/callback"],
    refusal: WEB_REFUSAL,
  },
  {
    name: "a web client on plain HTTP loopback",
    applicationType: "web",
    redirectUris: ["http://127.0.0.1:6274/callback"],
    refusal: WEB_REFUSAL,
  },
  {
    name: "a web client on a custom scheme",
    applicationType: "web",
    redirectUris: ["com.example.app:/callback"],
    refusal: WEB_REFUSAL,
  },
  {
    name: "a native client on plain HTTP to a public host",
    applicationType: "native",
    redirectUris: ["http://client.example/callback"],
    refusal: NATIVE_REFUSAL,
  },
  {
    name: "a native client on plain HTTP to a 127/8 address",
    applicationType: "native",
    redirectUris: ["http://127.0.0.5:6274/callback"],
  },
  {
    name: "a native client on plain HTTP to localhost in any case",
    applicationType: "native",
    redirectUris: ["http://LocalHost:6274/callback"],
  },
  {
    name: "a native client on plain HTTP to IPv6 loopback",
    applicationType: "native",
    redirectUris: ["http://[::1]:6274/callback"],
  },
  {
    name: "a native client on plain HTTP to a host that only starts with localhost",
    applicationType: "native",
    redirectUris: ["http://localhost.example/callback"],
    refusal: NATIVE_REFUSAL,
  },
  {
    name: "a native client on HTTPS to a public host",
    applicationType: "native",
    redirectUris: ["https://client.example/callback"],
  },
  {
    name: "a native client on a custom scheme",
    applicationType: "native",
    redirectUris: ["com.example.app:/callback"],
  },
  {
    name: "a client without application_type on plain HTTP to a public host",
    redirectUris: ["http://client.example/callback"],
  },
  {
    name: "a native client whose later redirect URI breaks the rule",
    applicationType: "native",
    redirectUris: [
      "http://127.0.0.1:6274/callback",
      "http://client.example/callback",
    ],
    refusal: NATIVE_REFUSAL,
  },
];

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function outcome(attempt: () => Promise<unknown>): Promise<unknown> {
  try {
    await attempt();
    return "accepted";
  } catch (error) {
    return error;
  }
}

function applicationTypeField(
  testCase: RedirectRuleCase,
): { application_type: "native" | "web" } | Record<string, never> {
  return testCase.applicationType
    ? { application_type: testCase.applicationType }
    : {};
}

describe("application_type redirect URI rule", () => {
  it("refuses dynamic registrations with InvalidClientMetadataError", async () => {
    const storageDir = await mkdtemp(join(tmpdir(), "brains-redirect-rules-"));
    tempDirs.push(storageDir);
    const database = new AuthRuntimeDatabase({ storageDir });
    await database.start();

    try {
      const clients = new RuntimeOAuthClientStore(database);
      for (const testCase of cases) {
        const result = await outcome(() =>
          clients.registerClient({
            redirect_uris: testCase.redirectUris,
            ...applicationTypeField(testCase),
          }),
        );
        if (testCase.refusal) {
          expect(result, testCase.name).toBeInstanceOf(
            InvalidClientMetadataError,
          );
          expect(result, testCase.name).toMatchObject({
            message: testCase.refusal,
          });
        } else {
          expect(result, testCase.name).toBe("accepted");
        }
      }
    } finally {
      await database.stop();
    }
  });

  it("refuses client metadata documents with ClientMetadataDocumentError", async () => {
    for (const testCase of cases) {
      const resolver = new ClientMetadataDocumentResolver({
        fetch: (): Promise<Response> =>
          Promise.resolve(
            Response.json({
              client_id: CLIENT_ID,
              client_name: "Example Client",
              redirect_uris: testCase.redirectUris,
              token_endpoint_auth_method: "none",
              ...applicationTypeField(testCase),
            }),
          ),
        resolveAddresses: (): Promise<ResolvedAddress[]> =>
          Promise.resolve(PUBLIC_ADDRESS),
      });

      const result = await outcome(() => resolver.resolve(CLIENT_ID));
      if (testCase.refusal) {
        expect(result, testCase.name).toBeInstanceOf(
          ClientMetadataDocumentError,
        );
        expect(result, testCase.name).toMatchObject({
          message: testCase.refusal,
        });
      } else {
        expect(result, testCase.name).toBe("accepted");
      }
    }
  });
});
