import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { FetchLike } from "@brains/utils/fetch-like";
import { createFakePeerFetch, type FakePeer } from "./fake-a2a-peers";

/**
 * The network an eval brain sees.
 *
 * An eval must never reach a real brain or a real external service. The
 * process fetch is routed here once per brain the eval boots:
 *
 * 1. the seed peers on `.example` hosts are answered as peer brains;
 * 2. every external service a package the eval brain composes can call is
 *    answered as that service answers a credential it does not know, which
 *    is what an eval brain's placeholder keys are, so a provider tool fails
 *    as it would against the real service and a case asserts the refusal;
 * 3. the reader a saved link is fetched through answers the page from the
 *    eval's own pages, so saving a link never reaches the live site;
 * 4. the model providers, loopback and the remote brain under evaluation
 *    (`--url`) pass through;
 * 5. everything else is refused, naming the host, so a package that starts
 *    calling a new service fails its eval instead of reaching it.
 */

type Answer = (request: Request) => Response;

const json = (status: number, body: unknown): Response =>
  Response.json(body, { status });

/**
 * Each external service an eval brain's packages can call, answered as it
 * answers a credential it does not know.
 */
const providers: Readonly<Record<string, Answer>> = {
  // stock-photo: search, download tracking.
  "api.unsplash.com": () =>
    json(401, { errors: ["OAuth error: The access token is invalid"] }),
  // stock-photo: the picture a selection downloads.
  "images.unsplash.com": () => new Response("Not found", { status: 404 }),
  // newsletter: Buttondown subscribers and sends.
  "api.buttondown.email": () => json(401, { detail: "Invalid token." }),
  // newsletter's Resend provider and the email interface's sender.
  "api.resend.com": () =>
    json(401, {
      statusCode: 401,
      name: "validation_error",
      message: "API key is invalid",
    }),
  // analytics: Cloudflare Web Analytics.
  "api.cloudflare.com": () =>
    json(403, {
      success: false,
      errors: [{ code: 10000, message: "Authentication error" }],
      messages: [],
      result: null,
    }),
  // social-media and linkedin-import: the API and OAuth.
  "api.linkedin.com": () =>
    json(401, {
      status: 401,
      serviceErrorCode: 65600,
      code: "INVALID_ACCESS_TOKEN",
      message: "Invalid access token",
    }),
  "www.linkedin.com": () =>
    json(401, {
      error: "invalid_client",
      error_description: "Client authentication failed",
    }),
  // atproto: the default PDS and the DID directory.
  "bsky.social": () =>
    json(401, {
      error: "AuthenticationRequired",
      message: "Invalid identifier or password",
    }),
  "plc.directory": () => json(404, { message: "DID not registered" }),
  // chat: Discord and Slack.
  "discord.com": () => json(401, { message: "401: Unauthorized", code: 0 }),
  "slack.com": () => json(200, { ok: false, error: "invalid_auth" }),
};

/** The external services an eval brain's packages can call. */
export const evalProviderHosts: readonly string[] = Object.freeze(
  Object.keys(providers),
);

/** The reader a saved link's page is fetched through (link capture). */
export const EVAL_LINK_READER_HOST = "r.jina.ai";

/** Where the eval keeps the pages its cases save, as the reader returns them. */
export const EVAL_PAGES_DIRECTORY: string = join(import.meta.dir, "eval-pages");

/** Hosts that never resolve (RFC 2606, RFC 6761): no site is there. */
const RESERVED_TLDS = [".invalid", ".example", ".test", ".localhost"];

/**
 * The eval page for a URL: `<host>/<path>.md` under the pages directory,
 * the root path as `index`, a trailing slash naming the same page.
 */
export function evalPagePath(
  url: URL,
  pagesDir: string = EVAL_PAGES_DIRECTORY,
): string {
  const path = url.pathname.replace(/\/+$/, "");
  return join(pagesDir, url.host, `${path === "" ? "/index" : path}.md`);
}

/**
 * A saved link's page as the reader returns it (`Title:`, `URL Source:`,
 * `Markdown Content:`), from the eval's pages: a reserved host has no
 * domain (the reader's 400), and a page the eval keeps none of is missing
 * (its 404), so a case only ever reads a page it brought.
 */
function readerPage(request: Request, pagesDir: string): Response {
  const target = new URL(request.url).pathname.slice(1);
  if (!URL.canParse(target))
    return new Response("Bad request", { status: 400 });
  const page = new URL(target);
  if (RESERVED_TLDS.some((tld) => page.hostname.endsWith(tld))) {
    return new Response("Bad request", { status: 400 });
  }
  const file = evalPagePath(page, pagesDir);
  if (!existsSync(file)) return new Response("Not found", { status: 404 });
  return new Response(readFileSync(file, "utf8"), {
    headers: { "content-type": "text/markdown; charset=utf-8" },
  });
}

/** The model providers an eval's brain and judge call. */
const MODEL_PROVIDER_HOSTS: ReadonlySet<string> = new Set([
  "api.openai.com",
  "api.anthropic.com",
  "generativelanguage.googleapis.com",
]);

const LOOPBACK_HOSTNAMES: ReadonlySet<string> = new Set([
  "localhost",
  "127.0.0.1",
  "[::1]",
]);

export interface EvalNetworkOptions {
  /** The seed peers the eval content saves, answered as peer brains. */
  readonly peers: readonly FakePeer[];
  /** What a request that passes through goes to. */
  readonly realFetch: FetchLike;
  /** The remote brain under evaluation, when the eval runs against one. */
  readonly remoteUrl?: string | undefined;
  /** Where the saved links' pages are kept; unset, the eval's own. */
  readonly pagesDir?: string | undefined;
}

/** A fetch over the eval network described above. */
export function createEvalNetworkFetch(options: EvalNetworkOptions): FetchLike {
  const pagesDir = options.pagesDir ?? EVAL_PAGES_DIRECTORY;
  const remoteHost =
    options.remoteUrl === undefined
      ? undefined
      : new URL(options.remoteUrl).host;
  const external: FetchLike = (input, init) => {
    const request = new Request(input, init);
    const { host, hostname } = new URL(request.url);
    const provider = providers[host];
    if (provider) return Promise.resolve(provider(request));
    if (host === EVAL_LINK_READER_HOST)
      return Promise.resolve(readerPage(request, pagesDir));
    if (
      MODEL_PROVIDER_HOSTS.has(host) ||
      LOOPBACK_HOSTNAMES.has(hostname) ||
      host === remoteHost
    ) {
      return options.realFetch(input, init);
    }
    return Promise.reject(
      new Error(`An eval reached the network: ${host} is not answered here`),
    );
  };
  return createFakePeerFetch(options.peers, external);
}

const realFetch: typeof fetch = globalThis.fetch;

/**
 * Route this eval process's fetch through the eval network for the rest of
 * the run. The brain's packages take the process fetch, so the eval routes
 * it once per brain it boots; there is nothing to restore, since the process
 * exists to run evals.
 */
export function serveEvalNetwork(options: {
  readonly peers: readonly FakePeer[];
  readonly remoteUrl?: string | undefined;
}): void {
  globalThis.fetch = Object.assign(
    createEvalNetworkFetch({ ...options, realFetch }),
    { preconnect: realFetch.preconnect },
  );
}
