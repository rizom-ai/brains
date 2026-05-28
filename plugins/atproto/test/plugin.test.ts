import { describe, expect, it } from "bun:test";
import { atprotoPlugin } from "../src";

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
});
