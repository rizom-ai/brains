import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/**
 * What a running brain serves, request by request: the status, the headers
 * and, where they are stable, the bodies, recorded from the built binary as a
 * deployed brain boots. A change to who hosts HTTP must leave this surface as
 * it is. `SERVED_SURFACE_CAPTURE=1` records the fixtures instead of checking
 * them.
 */

const packageDir = join(import.meta.dir, "..");
const fixtureDir = join(import.meta.dir, "fixtures", "served-surface");
const capture = process.env["SERVED_SURFACE_CAPTURE"] === "1";

/** No outbound request leaves the brain: every proxied fetch is refused. */
const refusedNetwork = {
  HTTP_PROXY: "http://127.0.0.1:9",
  HTTPS_PROXY: "http://127.0.0.1:9",
  http_proxy: "http://127.0.0.1:9",
  https_proxy: "http://127.0.0.1:9",
  NO_PROXY: "localhost,127.0.0.1",
  no_proxy: "localhost,127.0.0.1",
};

type BodyMode = "hash" | "json" | "none";

interface SurfaceRequest {
  method?: string;
  path: string;
  host?: string;
  headers?: Record<string, string>;
  body?: string;
  read?: BodyMode;
}

interface SurfaceRecord {
  request: string;
  status: number;
  headers: Record<string, string>;
  body?: unknown;
}

function freePort(): number {
  const listener = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: { data() {} },
  });
  const { port } = listener;
  listener.stop(true);
  return port;
}

/** Recursively poll until the probe yields a value or the deadline passes. */
async function pollUntil<T>(
  deadline: number,
  probe: () => Promise<T | undefined>,
  onTimeout: () => Error,
): Promise<T> {
  const result = await probe();
  if (result !== undefined) return result;
  if (Date.now() >= deadline) throw onTimeout();
  await Bun.sleep(250);
  return pollUntil(deadline, probe, onTimeout);
}

const VOLATILE_KEYS = new Set([
  "uptime",
  "checkedAt",
  "lastCheck",
  "resources",
  "version",
  "latestHeartbeatAgeMs",
]);

function isVolatileKey(key: string): boolean {
  return VOLATILE_KEYS.has(key) || key.endsWith("AgeMs");
}

/** JSON with run-specific values replaced by their kind. */
function normalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeJson);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      isVolatileKey(key) ? `<${typeof entry}>` : normalizeJson(entry),
    ]),
  );
}

const VOLATILE_HEADERS: Record<string, string> = {
  date: "<date>",
  etag: "<etag>",
  "set-cookie": "<cookie>",
  "last-modified": "<last-modified>",
};

function normalizeHeaders(
  headers: Headers,
  port: number,
  { lengthVaries }: { lengthVaries: boolean },
): Record<string, string> {
  return Object.fromEntries(
    [...headers.entries()]
      .map(([name, value]): [string, string] => [
        name,
        lengthVaries && name === "content-length"
          ? "<length>"
          : (VOLATILE_HEADERS[name] ??
            value.replaceAll(String(port), "<port>")),
      ])
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

async function readBody(
  response: Response,
  mode: BodyMode,
  port: number,
): Promise<unknown> {
  if (mode === "none") {
    await response.body?.cancel();
    return undefined;
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (mode === "hash") {
    return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  }
  const text = new TextDecoder()
    .decode(bytes)
    .replaceAll(String(port), "<port>");
  try {
    return normalizeJson(JSON.parse(text));
  } catch {
    return text;
  }
}

async function requestSurface(
  port: number,
  request: SurfaceRequest,
): Promise<SurfaceRecord> {
  const method = request.method ?? "GET";
  const response = await fetch(`http://127.0.0.1:${port}${request.path}`, {
    method,
    redirect: "manual",
    decompress: false,
    headers: {
      "accept-encoding": "gzip",
      ...(request.host ? { host: request.host } : {}),
      ...request.headers,
    },
    ...(request.body !== undefined ? { body: request.body } : {}),
  });
  const body = await readBody(response, request.read ?? "none", port);
  return {
    request: `${method} ${request.host ?? "localhost"}${request.path}${
      request.headers ? ` ${JSON.stringify(request.headers)}` : ""
    }`,
    status: response.status,
    headers: normalizeHeaders(response.headers, port, {
      // A JSON body is compared with its run-specific values replaced, so
      // its byte length, which those values change, is not recorded.
      lengthVaries: request.read === "json",
    }),
    ...(body !== undefined ? { body } : {}),
  };
}

interface SurfaceCase {
  name: string;
  brainYaml: (port: number) => string;
  seed?: (instanceDir: string) => void;
  requests: SurfaceRequest[];
}

function seedFile(root: string, path: string, contents: string): void {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, contents);
}

const origin = { origin: "https://client.example" };

/** Health, protocol and console routes every web brain answers. */
const runtimeRequests: SurfaceRequest[] = [
  { path: "/health", read: "hash" },
  { path: "/health/live", read: "json" },
  { method: "HEAD", path: "/health/live" },
  { method: "POST", path: "/health/live", read: "hash" },
  { path: "/health/ready", read: "json" },
  { path: "/health/operate", read: "json" },
  { path: "/health/live", host: "preview.localhost", read: "json" },
  { path: "/status", read: "json" },
  {
    method: "POST",
    path: "/mcp",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    read: "json",
  },
  {
    method: "OPTIONS",
    path: "/mcp",
    headers: { ...origin, "access-control-request-method": "POST" },
  },
  { path: "/.well-known/agent-card.json", read: "none" },
  { path: "/.well-known/agent-directory.json", read: "none" },
  {
    method: "OPTIONS",
    path: "/a2a",
    headers: { ...origin, "access-control-request-method": "POST" },
  },
  { path: "/.well-known/oauth-protected-resource", read: "json" },
  { path: "/.well-known/oauth-authorization-server", read: "json" },
  { path: "/login" },
  { path: "/setup" },
  { path: "/studio" },
  { path: "/studio/workspaces/inbox" },
  { path: "/chat" },
  { path: "/ask" },
  { path: "/api/chat/sessions", read: "json" },
  { path: "/api/chat/guest/access", read: "json" },
  { path: "/api/console/jump" },
  { path: "/favicon.svg", read: "hash" },
  { path: "/.site-build-manifest.json", read: "hash" },
  { path: "/images/missing.webp", read: "hash" },
  { path: "/missing-page", read: "hash" },
];

const cases: SurfaceCase[] = [
  {
    // A fresh web brain: no site build yet, the console at the root.
    name: "web",
    brainYaml: (port) =>
      [
        "brain: brain",
        "bundleContract: capability-bundles-v1",
        "anchor: person",
        "kind: professional",
        "bundles:",
        "  - core",
        "  - web",
        "  - chat",
        `port: ${port}`,
        "embedding:",
        "  enabled: false",
        "plugins:",
        "  onboarding:",
        "    enabled: false",
        "  directory-sync:",
        "    autoSync: false",
        "    initialSync: false",
        "",
      ].join("\n"),
    requests: [
      ...runtimeRequests,
      { path: "/" },
      { path: "/", host: "preview.localhost" },
      { path: "/index.html", read: "hash" },
      { path: "/index.html", host: "preview.localhost", read: "hash" },
    ],
  },
  {
    // A deployed site brain: production and preview output on one port.
    name: "site",
    brainYaml: (port) =>
      [
        "brain: brain",
        "bundleContract: capability-bundles-v1",
        "anchor: person",
        "kind: professional",
        "bundles:",
        "  - core",
        "  - web",
        "  - chat",
        "  - site",
        "  - publishing",
        "domain: brain.example.test",
        `port: ${port}`,
        "embedding:",
        "  enabled: false",
        "plugins:",
        "  onboarding:",
        "    enabled: false",
        "  directory-sync:",
        "    autoSync: false",
        "    initialSync: false",
        "  site-builder:",
        "    autoRebuild: false",
        "  newsletter:",
        "    provider:",
        "      type: buttondown",
        "      apiKey: fixture-api-key",
        "",
      ].join("\n"),
    // Neither output has an index.html, so the startup rebuild leaves them
    // as seeded.
    seed: (instanceDir): void => {
      const production = join(instanceDir, "dist", "site-production");
      const preview = join(instanceDir, "dist", "site-preview");
      const images = join(instanceDir, "dist", "images");
      seedFile(production, "about/index.html", "<h1>About</h1>");
      seedFile(production, "guide.html", "<h1>Guide</h1>");
      seedFile(production, "assets/main.css", "body{color:red}");
      seedFile(production, "assets/app.js", "console.log(1)");
      seedFile(production, "logo.png", "png-bytes");
      seedFile(production, "fonts/body.woff2", "woff2-bytes");
      seedFile(production, "robots.txt", "User-agent: *");
      seedFile(production, "404.html", "<h1>Production missing</h1>");
      seedFile(production, ".site-build-manifest.json", "{}");
      seedFile(production, ".well-known/security.txt", "Contact: x");
      seedFile(preview, "about/index.html", "<h1>Preview about</h1>");
      seedFile(preview, "assets/main.css", "body{color:blue}");
      seedFile(preview, "logo.png", "preview-png-bytes");
      seedFile(preview, "404.html", "<h1>Preview missing</h1>");
      seedFile(images, "pic.webp", "webp-bytes");
    },
    requests: [
      ...runtimeRequests,
      { path: "/", read: "hash" },
      { path: "/dashboard" },
      { path: "/about", read: "hash" },
      { path: "/about/", read: "hash" },
      { path: "/about/index.html", read: "hash" },
      { path: "/guide", read: "hash" },
      { path: "/guide.html", read: "hash" },
      { path: "/assets/main.css", read: "hash" },
      { path: "/assets/app.js", read: "hash" },
      { path: "/logo.png", read: "hash" },
      { path: "/fonts/body.woff2", read: "hash" },
      { path: "/robots.txt", read: "hash" },
      { path: "/.well-known/security.txt", read: "hash" },
      { path: "/images/pic.webp", read: "hash" },
      { path: "/images/%2e%2e/robots.txt", read: "hash" },
      { path: "/%2e%2e/site-preview/logo.png", read: "hash" },
      {
        method: "POST",
        path: "/api/buttondown/subscribe",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: "{}",
        read: "json",
      },
      {
        method: "POST",
        path: "/api/buttondown/subscribe",
        host: "preview.localhost",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: "{}",
        read: "hash",
      },
      { path: "/", host: "preview.localhost", read: "hash" },
      { path: "/about", host: "preview.localhost", read: "hash" },
      { path: "/assets/main.css", host: "preview.localhost", read: "hash" },
      { path: "/logo.png", host: "preview.localhost", read: "hash" },
      { path: "/images/pic.webp", host: "preview.localhost", read: "hash" },
      { path: "/missing-page", host: "preview.localhost", read: "hash" },
      { path: "/dashboard", host: "preview.localhost", read: "hash" },
      { path: "/ask", host: "preview.localhost" },
      { path: "/status", host: "preview.localhost", read: "hash" },
      {
        method: "OPTIONS",
        path: "/mcp",
        host: "preview.localhost",
        headers: { ...origin, "access-control-request-method": "POST" },
        read: "hash",
      },
      { path: "/", host: "brain-preview.example.test", read: "hash" },
      { path: "/", host: "www.brain.example.test", read: "hash" },
    ],
  },
];

async function bootAndRecord(surface: SurfaceCase): Promise<SurfaceRecord[]> {
  const instanceDir = mkdtempSync(join(tmpdir(), "brain-served-surface-"));
  const port = freePort();
  writeFileSync(join(instanceDir, "brain.yaml"), surface.brainYaml(port));
  surface.seed?.(instanceDir);
  const proc = Bun.spawn(
    ["bun", join(packageDir, "dist", "brain.js"), "start"],
    {
      cwd: instanceDir,
      env: {
        ...process.env,
        ...refusedNetwork,
        NODE_ENV: "production",
        OPENAI_API_KEY: "placeholder-served-surface",
        XDG_DATA_HOME: join(instanceDir, "xdg-data"),
      },
      stdout: "ignore",
      stderr: "ignore",
    },
  );
  try {
    await pollUntil(
      Date.now() + 120_000,
      async () => {
        if (proc.exitCode !== null) {
          throw new Error(
            `Brain exited before it was ready (${proc.exitCode})`,
          );
        }
        const ready = await fetch(`http://127.0.0.1:${port}/health/ready`, {
          signal: AbortSignal.timeout(2_000),
        }).catch(() => undefined);
        return ready?.status === 200 ? true : undefined;
      },
      () => new Error(`Brain on ${port} was not ready within 120s`),
    );
    // Startup work settles before the surface is read: the brain reports
    // itself operational, with its worker live and no projection wave
    // running, and that answer stops changing between two reads in a row.
    await pollUntil(
      Date.now() + 90_000,
      async () => {
        const read = async (): Promise<SurfaceRecord> =>
          requestSurface(port, { path: "/health/operate", read: "json" });
        const first = await read();
        const settled =
          first.status === 200 &&
          !JSON.stringify(first.body).includes("is progressing");
        if (!settled) return undefined;
        await Bun.sleep(1_000);
        return JSON.stringify(first) === JSON.stringify(await read())
          ? true
          : undefined;
      },
      () => new Error("Operational health did not settle within 90s"),
    );
    return await surface.requests.reduce<Promise<SurfaceRecord[]>>(
      async (records, request) => [
        ...(await records),
        await requestSurface(port, request),
      ],
      Promise.resolve([]),
    );
  } finally {
    proc.kill();
    await proc.exited;
    rmSync(instanceDir, { recursive: true, force: true });
  }
}

describe("served surface", () => {
  for (const surface of cases) {
    it(`serves the ${surface.name} brain's surface as recorded`, async () => {
      const records = await bootAndRecord(surface);
      const fixture = join(fixtureDir, `${surface.name}.json`);
      if (capture) {
        mkdirSync(fixtureDir, { recursive: true });
        writeFileSync(fixture, `${JSON.stringify(records, null, 2)}\n`);
        return;
      }
      expect(records).toEqual(JSON.parse(readFileSync(fixture, "utf8")));
    }, 300_000);
  }
});
