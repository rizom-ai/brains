import { afterEach, describe, expect, it } from "bun:test";
import {
  createEvalNetworkFetch,
  evalProviderHosts,
  serveEvalNetwork,
} from "../src/eval-network";
import type { FakePeer } from "../src/fake-a2a-peers";

const reached: string[] = [];
const realNetwork = (input: string | URL | Request): Promise<Response> => {
  reached.push(new Request(input).url);
  return Promise.resolve(new Response("the real network answered"));
};

const peer: FakePeer = {
  host: "yeehaa.example",
  name: "Yeehaa",
  kind: "person",
  brainName: "Yeehaa Brain",
  about: "Yeehaa Brain helps with ecosystem architecture.",
  skills: [],
};

const network = createEvalNetworkFetch({
  peers: [peer],
  realFetch: realNetwork,
});

async function answer(
  url: string,
  init?: RequestInit,
): Promise<{ status: number; body: string }> {
  const response = await network(url, init);
  return { status: response.status, body: await response.text() };
}

afterEach(() => {
  reached.length = 0;
});

describe("the eval network", () => {
  it("answers every provider an eval brain can reach as it answers a placeholder credential", async () => {
    const requests: Array<[string, RequestInit?]> = [
      ["https://api.unsplash.com/search/photos?query=wind"],
      ["https://api.unsplash.com/photos/abc/download"],
      ["https://images.unsplash.com/photo-abc?w=1080"],
      ["https://api.buttondown.email/v1/subscribers"],
      ["https://api.resend.com/emails", { method: "POST", body: "{}" }],
      [
        "https://api.cloudflare.com/client/v4/graphql",
        { method: "POST", body: "{}" },
      ],
      ["https://api.linkedin.com/v2/userinfo"],
      [
        "https://www.linkedin.com/oauth/v2/accessToken",
        { method: "POST", body: "" },
      ],
      [
        "https://bsky.social/xrpc/com.atproto.server.createSession",
        { method: "POST", body: "{}" },
      ],
      ["https://plc.directory/did:plc:abc"],
      ["https://discord.com/api/v10/channels/1/messages"],
      ["https://slack.com/api/auth.test", { method: "POST", body: "" }],
    ];
    const answers = await Promise.all(
      requests.map(async ([url, init]) => ({
        host: new URL(url).host,
        ...(await answer(url, init)),
      })),
    );

    // Each as the service answers a key it does not know: Slack in a 200
    // whose body says so, plc.directory with a DID it never registered.
    expect(answers.map(({ host, status }) => ({ host, status }))).toEqual([
      { host: "api.unsplash.com", status: 401 },
      { host: "api.unsplash.com", status: 401 },
      { host: "images.unsplash.com", status: 404 },
      { host: "api.buttondown.email", status: 401 },
      { host: "api.resend.com", status: 401 },
      { host: "api.cloudflare.com", status: 403 },
      { host: "api.linkedin.com", status: 401 },
      { host: "www.linkedin.com", status: 401 },
      { host: "bsky.social", status: 401 },
      { host: "plc.directory", status: 404 },
      { host: "discord.com", status: 401 },
      { host: "slack.com", status: 200 },
    ]);
    expect(JSON.parse(answers.at(-1)?.body ?? "{}")).toEqual({
      ok: false,
      error: "invalid_auth",
    });
    expect(reached).toEqual([]);
    expect([...new Set(answers.map(({ host }) => host))].sort()).toEqual(
      [...evalProviderHosts].sort(),
    );
  });

  it("answers Unsplash and Buttondown in their own error shapes", async () => {
    expect(await answer("https://api.unsplash.com/search/photos")).toEqual({
      status: 401,
      body: JSON.stringify({
        errors: ["OAuth error: The access token is invalid"],
      }),
    });
    expect(await answer("https://api.buttondown.email/v1/subscribers")).toEqual(
      {
        status: 401,
        body: JSON.stringify({ detail: "Invalid token." }),
      },
    );
  });

  it("reads a saved link's page from the eval's pages, never the live site", async () => {
    const response = await network(
      "https://r.jina.ai/https://anthropic.com/research",
      { headers: { Accept: "text/markdown" } },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/markdown");
    const page = await response.text();
    expect(page).toStartWith("Title: ");
    expect(page).toContain("URL Source: https://anthropic.com/research");
    expect(page).toContain("Markdown Content:");
    // A trailing slash names the same page.
    expect(
      (await network("https://r.jina.ai/https://www.w3.org/TR/webauthn-3/"))
        .status,
    ).toBe(200);
    expect(reached).toEqual([]);
  });

  it("answers a page the eval has none of as missing, and a reserved host as no domain", async () => {
    expect(
      (await answer("https://r.jina.ai/https://anthropic.com/not-a-page"))
        .status,
    ).toBe(404);
    expect(
      (await answer("https://r.jina.ai/https://no-such-site.invalid/page"))
        .status,
    ).toBe(400);
    expect(reached).toEqual([]);
  });

  it("answers the seed peers before anything else", async () => {
    const card = await network(
      "https://yeehaa.example/.well-known/agent-card.json",
    );
    expect(await card.json()).toMatchObject({ name: "Yeehaa Brain" });
    expect(reached).toEqual([]);
  });

  it("refuses every other external host, naming it", async () => {
    expect(network("https://unknown-agent.example/a2a")).rejects.toThrow(
      "An eval reached the network: unknown-agent.example is not answered here",
    );
    expect(network("https://anthropic.com/research")).rejects.toThrow(
      "anthropic.com",
    );
    expect(reached).toEqual([]);
  });

  it("passes the model providers, loopback and the remote brain under evaluation through", async () => {
    const remote = createEvalNetworkFetch({
      peers: [],
      realFetch: realNetwork,
      remoteUrl: "https://brain.rizom.ai/mcp",
    });
    for (const url of [
      "https://api.openai.com/v1/responses",
      "https://api.anthropic.com/v1/messages",
      "https://generativelanguage.googleapis.com/v1beta/models",
      "http://localhost:11434/api/chat",
      "http://127.0.0.1:8080/mcp",
      "https://brain.rizom.ai/api/chat",
    ]) {
      expect(await (await remote(url)).text()).toBe(
        "the real network answered",
      );
    }
    expect(reached).toHaveLength(6);
  });
});

describe("serveEvalNetwork", () => {
  const original = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = original;
  });

  it("routes the process fetch through the eval network", async () => {
    serveEvalNetwork({ peers: [peer] });

    const unsplash = await fetch("https://api.unsplash.com/search/photos");
    expect(unsplash.status).toBe(401);
    expect(fetch("https://example.org/")).rejects.toThrow(
      "An eval reached the network: example.org is not answered here",
    );
  });
});
