import { describe, expect, it, mock } from "bun:test";
import { createMockShell } from "@brains/test-utils";
import {
  AtprotoPlugin,
  atprotoPlugin,
  type AtprotoPdsClientLike,
} from "../src";

describe("atproto plugin", () => {
  it("validates configuration", () => {
    expect(() => atprotoPlugin({ pdsEndpoint: "not-a-url" })).toThrowError();
  });

  it("exposes no did route without a did:web brain identity", () => {
    const plugin = atprotoPlugin();

    expect(plugin.getWebRoutes()).toEqual([]);
  });

  it("serves did:web document route when configured", async () => {
    const plugin = atprotoPlugin({
      pdsEndpoint: "https://pds.example.com",
      identifier: "brain.example.com",
      brainDid: "did:web:brain.example.com",
    });

    const routes = plugin.getWebRoutes();
    expect(routes).toHaveLength(1);
    expect(routes[0]?.path).toBe("/.well-known/did.json");
    expect(routes[0]?.method).toBe("GET");
    expect(routes[0]?.public).toBe(true);

    const response = await routes[0]?.handler(
      new Request("https://brain.example.com/.well-known/did.json"),
    );
    expect(response?.status).toBe(200);
    expect(response?.headers.get("content-type")).toBe("application/did+json");

    const body = (await response?.json()) as {
      id: string;
      service: Array<{ serviceEndpoint: string }>;
    };
    expect(body.id).toBe("did:web:brain.example.com");
    expect(body.service[0]?.serviceEndpoint).toBe("https://pds.example.com");
  });

  it("hides routes when disabled", () => {
    const plugin = atprotoPlugin({
      enabled: false,
      brainDid: "did:web:brain.example.com",
    });

    expect(plugin.getWebRoutes()).toEqual([]);
  });

  it("provides publishing instructions", async () => {
    const plugin = atprotoPlugin({
      pdsEndpoint: "https://pds.example.com",
      identifier: "brain.example.com",
      brainDid: "did:web:brain.example.com",
    });

    const capabilities = await plugin.register(createMockShell());

    expect(capabilities.instructions).toContain("atproto_publish_card");
    expect(capabilities.instructions).toContain("atproto_publish_post");
    expect(capabilities.instructions).toContain("dryRun");
  });

  it("reports invalid credentials without throwing", async () => {
    const plugin = new AtprotoPlugin(
      {
        pdsEndpoint: "https://pds.example.com",
        identifier: "brain.example.com",
        appPassword: "bad-secret",
      },
      {
        createPdsClient: (): AtprotoPdsClientLike => ({
          createSession: mock(async () => {
            throw new Error("Invalid identifier or password");
          }),
          createRecord: mock(async () => ({
            uri: "at://repo/record",
            cid: "cid",
          })),
        }),
      },
    );

    const capabilities = await plugin.register(createMockShell());
    const tool = capabilities.tools.find(
      (candidate) => candidate.name === "atproto_validate_credentials",
    );

    expect(tool).toBeDefined();
    const response = await tool?.handler(
      {},
      { interfaceType: "test", userId: "test" },
    );
    expect(response).toEqual({ success: true, data: { valid: false } });
  });

  it("exposes a credential validation tool", async () => {
    const createSession = mock(async () => ({
      did: "did:plc:repo",
      handle: "brain.example.com",
      accessJwt: "access-token",
      refreshJwt: "refresh-token",
    }));
    const plugin = new AtprotoPlugin(
      {
        pdsEndpoint: "https://pds.example.com",
        identifier: "brain.example.com",
        appPassword: "secret",
      },
      {
        createPdsClient: (): AtprotoPdsClientLike => ({
          createSession,
          createRecord: mock(async () => ({
            uri: "at://repo/record",
            cid: "cid",
          })),
        }),
      },
    );

    const capabilities = await plugin.register(createMockShell());
    const tool = capabilities.tools.find(
      (candidate) => candidate.name === "atproto_validate_credentials",
    );

    expect(tool).toBeDefined();
    const response = await tool?.handler(
      {},
      { interfaceType: "test", userId: "test" },
    );
    expect(response).toEqual({ success: true, data: { valid: true } });
    expect(createSession).toHaveBeenCalledTimes(1);
  });
});
