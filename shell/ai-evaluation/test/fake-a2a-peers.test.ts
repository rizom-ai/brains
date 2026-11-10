import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fetchVerifiedAgentCard } from "@brains/plugins";
import {
  createFakePeerFetch,
  readSeedPeers,
  serveSeedPeers,
  type FakePeer,
} from "../src/fake-a2a-peers";

const seed = (host: string, extra = ""): string => `---
name: Yeehaa
kind: person
brainName: Yeehaa Brain
url: "https://${host}/a2a"
status: approved
discoveredAt: "2026-03-15T10:00:00.000Z"
---

# Agent

## About

Yeehaa Brain helps with ecosystem architecture.

## Skills

- system_search: Search entities using semantic search. [search, retrieval]
- ecosystem: Discuss ecosystem architecture.
${extra}
## Notes
`;

const peer: FakePeer = {
  host: "yeehaa.example",
  name: "Yeehaa",
  kind: "person",
  brainName: "Yeehaa Brain",
  about: "Yeehaa Brain helps with ecosystem architecture.",
  skills: [
    {
      id: "system_search",
      description: "Search entities using semantic search.",
      tags: ["search", "retrieval"],
    },
    {
      id: "ecosystem",
      description: "Discuss ecosystem architecture.",
      tags: [],
    },
  ],
};

const unreachable = (): Promise<Response> =>
  Promise.reject(new Error("the real network was reached"));

describe("fake A2A peers for evals", () => {
  const dirs: string[] = [];

  afterEach(async () => {
    await Promise.all(dirs.map((dir) => rm(dir, { recursive: true })));
    dirs.length = 0;
  });

  async function contentWith(files: Record<string, string>): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "fake-peers-"));
    dirs.push(dir);
    await mkdir(join(dir, "agent"));
    await Promise.all(
      Object.entries(files).map(([name, body]) =>
        writeFile(join(dir, "agent", name), body),
      ),
    );
    return dir;
  }

  it("reads every seed agent of the eval content as a peer", async () => {
    const dir = await contentWith({
      "yeehaa.example.md": seed("yeehaa.example"),
    });
    expect(readSeedPeers(dir)).toEqual([peer]);
  });

  it("reads no peers from content without agents", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fake-peers-"));
    dirs.push(dir);
    expect(readSeedPeers(dir)).toEqual([]);
  });

  it("refuses a seed agent on a host that could be a real brain", async () => {
    const dir = await contentWith({ "yeehaa.io.md": seed("yeehaa.io") });
    expect(() => readSeedPeers(dir)).toThrow(
      "yeehaa.io.md points at yeehaa.io: an eval seed agent must be on a .example host",
    );
  });

  it("leaves a loopback seed agent to the test server it names", async () => {
    const dir = await contentWith({
      "local.md": seed("yeehaa.example").replace(
        "https://yeehaa.example/a2a",
        "http://127.0.0.1:4100/a2a",
      ),
    });
    expect(readSeedPeers(dir)).toEqual([]);
  });

  it("serves an Agent Card the A2A client verifies", async () => {
    const fetch = createFakePeerFetch([peer], unreachable);
    const verified = await fetchVerifiedAgentCard("yeehaa.example", { fetch });
    expect(verified).toMatchObject({
      ok: true,
      card: {
        brainName: "Yeehaa Brain",
        anchor: { name: "Yeehaa", kind: "person", category: "person" },
        url: "https://yeehaa.example/a2a",
        description: "Yeehaa Brain helps with ecosystem architecture.",
        skills: [
          {
            id: "system_search",
            name: "system_search",
            tags: ["search", "retrieval"],
          },
          { id: "ecosystem", name: "ecosystem", tags: [] },
        ],
      },
    });
  });

  it("serves an empty public agent directory and a signing key", async () => {
    const fetch = createFakePeerFetch([peer], unreachable);
    const directory = await fetch(
      "https://yeehaa.example/.well-known/agent-directory.json",
    );
    expect(await directory.json()).toEqual({ agents: [] });
    const jwks = await fetch("https://yeehaa.example/.well-known/jwks.json");
    expect(await jwks.json()).toMatchObject({
      keys: [{ kty: "OKP", crv: "Ed25519", alg: "EdDSA" }],
    });
  });

  it("answers an ask with a terminal status update naming the peer", async () => {
    const fetch = createFakePeerFetch([peer], unreachable);
    const response = await fetch("https://yeehaa.example/a2a", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "rpc-1",
        method: "message/stream",
        params: {
          message: {
            kind: "message",
            messageId: "m-1",
            role: "user",
            parts: [
              { kind: "text", text: "What about ecosystem architecture?" },
            ],
          },
        },
      }),
    });
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    const events = (await response.text())
      .split("\n\n")
      .filter((part) => part.startsWith("data: "))
      .map((part): unknown => JSON.parse(part.slice("data: ".length)));
    expect(events).toEqual([
      {
        jsonrpc: "2.0",
        id: "rpc-1",
        result: {
          kind: "status-update",
          final: true,
          status: {
            state: "completed",
            message: {
              kind: "message",
              role: "agent",
              messageId: "rpc-1-answer",
              parts: [
                {
                  kind: "text",
                  text: 'Yeehaa Brain (the eval\'s stand-in for yeehaa.example) on "What about ecosystem architecture?": I can help with system_search and ecosystem.',
                },
              ],
            },
          },
        },
      },
    ]);
  });

  it("answers anything else on a peer host with 404", async () => {
    const fetch = createFakePeerFetch([peer], unreachable);
    expect((await fetch("https://yeehaa.example/elsewhere")).status).toBe(404);
  });

  it("leaves every other host to the real fetch", async () => {
    const seen: string[] = [];
    const fetch = createFakePeerFetch([peer], (input) => {
      seen.push(String(input));
      return Promise.resolve(new Response("real"));
    });
    expect(await (await fetch("https://unknown-agent.example/x")).text()).toBe(
      "real",
    );
    expect(
      await (await fetch(new URL("https://api.openai.com/v1"))).text(),
    ).toBe("real");
    expect(seen).toEqual([
      "https://unknown-agent.example/x",
      "https://api.openai.com/v1",
    ]);
  });
});

describe("serving the seed peers of an eval run", () => {
  const original = globalThis.fetch;
  let dir: string | undefined;

  afterEach(async () => {
    globalThis.fetch = original;
    if (dir) await rm(dir, { recursive: true });
    dir = undefined;
  });

  it("answers the content's seed agents through the process fetch", async () => {
    dir = await mkdtemp(join(tmpdir(), "fake-peers-"));
    await mkdir(join(dir, "eval-content", "agent"), { recursive: true });
    await writeFile(
      join(dir, "eval-content", "agent", "yeehaa.example.md"),
      seed("yeehaa.example"),
    );

    serveSeedPeers({ brainModelPath: dir, config: { plugins: [] } });

    const card = await fetch(
      "https://yeehaa.example/.well-known/agent-card.json",
    );
    expect(await card.json()).toMatchObject({ name: "Yeehaa Brain" });
  });
});
