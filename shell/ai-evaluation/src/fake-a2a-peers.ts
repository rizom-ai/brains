import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { parse as parseYaml } from "yaml";
import type { FetchLike } from "@brains/utils/fetch-like";
import { z } from "@brains/utils/zod";

/**
 * Stand-ins for the peer brains an eval's seed content saves as agents.
 *
 * The A2A client, agent_connect, the directory scan and trust pinning reach a
 * peer over HTTPS on its own host. An eval must never reach a real brain, so
 * every seed agent sits on a reserved `.example` host and the eval process
 * answers those hosts itself: its Agent Card, public directory, signing key
 * and `/a2a` ask, in the A2A wire format the client reads. A `.example` host
 * no seed saves stays unanswered, as an unreachable agent is.
 */

const seedFrontmatterSchema: z.ZodObject<{
  name: z.ZodString;
  kind: z.ZodEnum<{
    person: "person";
    team: "team";
    organization: "organization";
  }>;
  brainName: z.ZodString;
  url: z.ZodString;
}> = z.object({
  name: z.string().min(1),
  kind: z.enum(["person", "team", "organization"]),
  brainName: z.string().min(1),
  url: z.string().url(),
});

export interface FakePeerSkill {
  id: string;
  description: string;
  tags: string[];
}

export interface FakePeer {
  host: string;
  name: string;
  kind: z.output<typeof seedFrontmatterSchema>["kind"];
  brainName: string;
  about: string;
  skills: FakePeerSkill[];
}

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
const SKILL_LINE = /^- ([^:]+):\s*(.*?)(?:\s*\[([^\]]*)\])?$/;

/** The reserved test TLD (RFC 2606): no real brain can be reached there. */
export function isFakePeerHost(host: string): boolean {
  return host.endsWith(".example");
}

/** The hosts that are this machine, as a URL names them. */
export const LOOPBACK_HOSTNAMES: ReadonlySet<string> = new Set([
  "localhost",
  "127.0.0.1",
  "[::1]",
]);

/**
 * Where an eval seed agent may point: a `.example` host this process answers,
 * or a loopback server a test starts itself. Never a host a real brain could
 * be on.
 */
export function isSafeSeedAgentUrl(url: string): boolean {
  const { host, hostname } = new URL(url);
  return isFakePeerHost(host) || LOOPBACK_HOSTNAMES.has(hostname);
}

function section(body: string, heading: string): string[] {
  const lines = body.split("\n");
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start === -1) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith("## "));
  return (end === -1 ? rest : rest.slice(0, end))
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function parseSkill(line: string): FakePeerSkill | null {
  const match = SKILL_LINE.exec(line);
  if (!match?.[1]) return null;
  return {
    id: match[1].trim(),
    description: (match[2] ?? "").trim(),
    tags: (match[3] ?? "")
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0),
  };
}

function readSeedPeer(dir: string, file: string): FakePeer | null {
  const text = readFileSync(join(dir, file), "utf8");
  const match = FRONTMATTER.exec(text);
  if (!match?.[1]) throw new Error(`${file} has no frontmatter`);
  const frontmatter = seedFrontmatterSchema.parse(parseYaml(match[1]));
  const host = new URL(frontmatter.url).host;
  if (!isSafeSeedAgentUrl(frontmatter.url)) {
    throw new Error(
      `${file} points at ${host}: an eval seed agent must be on a .example host`,
    );
  }
  // A loopback agent is a server its own test runs.
  if (!isFakePeerHost(host)) return null;
  const body = match[2] ?? "";
  return {
    host,
    name: frontmatter.name,
    kind: frontmatter.kind,
    brainName: frontmatter.brainName,
    about: section(body, "About").join(" "),
    skills: section(body, "Skills")
      .map(parseSkill)
      .filter((skill): skill is FakePeerSkill => skill !== null),
  };
}

/** Every agent the eval content at `contentDir` saves, as a fake peer. */
export function readSeedPeers(contentDir: string): FakePeer[] {
  const dir = join(contentDir, "agent");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => file.endsWith(".md"))
    .sort()
    .map((file) => readSeedPeer(dir, file))
    .filter((peer): peer is FakePeer => peer !== null);
}

function agentCard(peer: FakePeer): Record<string, unknown> {
  return {
    name: peer.brainName,
    description: peer.about,
    url: `https://${peer.host}/a2a`,
    version: "eval",
    protocolVersion: "0.2.2",
    capabilities: {
      streaming: true,
      pushNotifications: false,
      extensions: [
        {
          uri: "https://rizom.ai/ext/anchor-profile/v1",
          description: "Anchor identity for this brain",
          params: { name: peer.name, kind: peer.kind, category: peer.kind },
        },
      ],
    },
    defaultInputModes: ["text/plain"],
    defaultOutputModes: ["text/plain"],
    skills: peer.skills.map((skill) => ({
      id: skill.id,
      name: skill.id,
      description: skill.description,
      tags: skill.tags,
    })),
  };
}

/** A fixed public key: trust pinning only fingerprints it. */
const SIGNING_KEY = {
  kty: "OKP",
  crv: "Ed25519",
  x: "11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo",
  kid: "eval-fake-peer",
  alg: "EdDSA",
} as const;

const askSchema = z.object({
  id: z.union([z.string(), z.number()]),
  params: z.object({
    message: z.object({
      parts: z.array(
        z.looseObject({ kind: z.string(), text: z.string().optional() }),
      ),
    }),
  }),
});

function answerText(peer: FakePeer, question: string): string {
  const skills = peer.skills.map((skill) => skill.id);
  const offer =
    skills.length === 0
      ? "I have no listed skills."
      : `I can help with ${skills.length === 1 ? skills[0] : `${skills.slice(0, -1).join(", ")} and ${skills.at(-1)}`}.`;
  return `${peer.brainName} (the eval's stand-in for ${peer.host}) on "${question}": ${offer}`;
}

async function answerAsk(peer: FakePeer, request: Request): Promise<Response> {
  const parsed = askSchema.safeParse(await request.json());
  if (!parsed.success) return new Response("Bad request", { status: 400 });
  const { id, params } = parsed.data;
  const question = params.message.parts
    .map((part) => part.text ?? "")
    .join(" ")
    .trim();
  const event = {
    jsonrpc: "2.0",
    id,
    result: {
      kind: "status-update",
      final: true,
      status: {
        state: "completed",
        message: {
          kind: "message",
          role: "agent",
          messageId: `${id}-answer`,
          parts: [{ kind: "text", text: answerText(peer, question) }],
        },
      },
    },
  };
  return new Response(`data: ${JSON.stringify(event)}\n\n`, {
    headers: { "content-type": "text/event-stream" },
  });
}

function answerPeer(peer: FakePeer, request: Request): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (request.method === "GET" && pathname === "/.well-known/agent-card.json")
    return Promise.resolve(Response.json(agentCard(peer)));
  if (
    request.method === "GET" &&
    pathname === "/.well-known/agent-directory.json"
  )
    return Promise.resolve(Response.json({ agents: [] }));
  if (request.method === "GET" && pathname === "/.well-known/jwks.json")
    return Promise.resolve(Response.json({ keys: [SIGNING_KEY] }));
  if (request.method === "POST" && pathname === "/a2a")
    return answerAsk(peer, request);
  return Promise.resolve(new Response("Not found", { status: 404 }));
}

/**
 * A fetch that answers `peers`' hosts over HTTPS in process and hands every
 * other request to `fallback`.
 */
export function createFakePeerFetch(
  peers: readonly FakePeer[],
  fallback: FetchLike,
): FetchLike {
  const byHost = new Map(peers.map((peer) => [peer.host, peer]));
  return (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const peer = url.protocol === "https:" ? byHost.get(url.host) : undefined;
    return peer ? answerPeer(peer, request) : fallback(input, init);
  };
}
