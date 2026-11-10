import { describe, expect, it } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  EVAL_LINK_READER_HOST,
  createEvalNetworkFetch,
  evalPagePath,
  evalProviderHosts,
} from "@brains/ai-evaluation";
import { ButtondownPlugin } from "@brains/newsletter";
import { createStockPhotoPackage } from "@brains/stock-photo";
import {
  instantiatePluginPackageDefinition,
  type Plugin,
  type Tool,
  type ToolResponse,
} from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";

const REPO = join(import.meta.dir, "..", "..", "..");

/** Every request that would have left the eval process. */
const refused: string[] = [];
const everyExternalHostRefused = (
  input: string | URL | Request,
): Promise<Response> => {
  refused.push(new Request(input).url);
  return Promise.reject(new Error("an eval reached the network"));
};

const network = createEvalNetworkFetch({
  peers: [],
  realFetch: everyExternalHostRefused,
});

/**
 * Hosts production code names that an eval brain's process never fetches,
 * each with why. Anything else a package names must be answered by the eval
 * network, so a package that starts calling a new service is caught here
 * before an eval reaches it.
 */
const notFetchedByAnEvalBrain: Readonly<Record<string, string>> = {
  "fonts.googleapis.com": "a stylesheet link in served HTML, read by a browser",
  "fonts.gstatic.com": "a preconnect hint in served HTML, read by a browser",
  "static.cloudflareinsights.com": "the analytics beacon's script tag",
  "api.hetzner.cloud": "deploy tooling, never part of a brain",
  "github.com": "a content git remote, which an eval brain never configures",
  "jetstream2.us-east.bsky.network":
    "atproto's Jetstream socket, off unless a brain opts in",
  "rizom.ai": "an A2A extension identifier, not a URL anything fetches",
  "www.w3.org": "the SVG namespace",
  "example.com": "the placeholder site URL a build without one names",
  "yeehaa.io": "an example in a doc comment",
  "ranger.rizom.ai": "an example in a doc comment",
  "brains.invalid": "a placeholder origin for internal requests",
  "studio.invalid": "a placeholder origin for internal requests",
  "studio-entity-image.invalid": "a placeholder origin for internal requests",
};

const MODEL_PROVIDERS = new Set([
  "api.openai.com",
  "api.anthropic.com",
  "generativelanguage.googleapis.com",
]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "node_modules" || entry.name === "test"
        ? []
        : sourceFiles(path);
    }
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
      ? [path]
      : [];
  });
}

/** The hosts production code names in string literals, by file. */
function namedHosts(): Map<string, string> {
  const hosts = new Map<string, string>();
  for (const area of ["entities", "plugins", "interfaces", "shared", "shell"]) {
    for (const pkg of readdirSync(join(REPO, area))) {
      const src = join(REPO, area, pkg, "src");
      if (!existsSync(src)) continue;
      for (const file of sourceFiles(src)) {
        const text = readFileSync(file, "utf8");
        for (const [, host] of text.matchAll(
          /["'`](?:https|wss):\/\/([a-z0-9.-]+\.[a-z]{2,})/g,
        )) {
          if (host && !hosts.has(host)) hosts.set(host, relative(REPO, file));
        }
      }
    }
  }
  return hosts;
}

function caseFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return caseFiles(path);
    return entry.name.endsWith(".yaml") ? [path] : [];
  });
}

/** The URLs every link eval case saves or extracts, by case file. */
function savedLinkUrls(): Array<{ file: string; url: string }> {
  const dirs = [
    join(REPO, "packages", "brain-cli", "test-cases"),
    ...["entities", "plugins"].flatMap((area) =>
      readdirSync(join(REPO, area)).map((pkg) =>
        join(REPO, area, pkg, "evals", "test-cases"),
      ),
    ),
  ];
  return dirs.flatMap(caseFiles).flatMap((file) => {
    const testCase: unknown = parseYaml(readFileSync(file, "utf8"));
    const tags = Reflect.get(Object(testCase), "tags");
    if (!Array.isArray(tags) || !tags.includes("link")) return [];
    const urls = readFileSync(file, "utf8").match(/https?:\/\/[^\s"')]+/g);
    return (urls ?? []).map((url) => ({
      file: relative(REPO, file),
      url: url.replace(/[.,]$/, ""),
    }));
  });
}

function toolOf(capabilities: { tools: Tool[] }, name: string): Tool {
  const found = capabilities.tools.find((tool) => tool.name === name);
  if (!found) throw new Error(`No tool ${name}`);
  return found;
}

/** Stock photos as the canonical brain composes them, over the eval network. */
function stockPhotoWith(config: { apiKey: string }): Plugin {
  const [plugin] = instantiatePluginPackageDefinition(
    createStockPhotoPackage({ fetch: network }),
    config,
    { name: "@brains/stock-photo", version: "0.0.0-test" },
    { pluginId: "stock-photo" },
  );
  if (!plugin) throw new Error("The stock-photo package created no plugin");
  return plugin;
}

const admin = {
  interfaceType: "evaluation",
  actor: { kind: "user", userId: "eval-admin" },
  userPermissionLevel: "admin",
} as const;

describe("the eval network", () => {
  it("answers every external service an eval brain's packages name", () => {
    const unanswered = [...namedHosts()]
      .filter(
        ([host]) =>
          !evalProviderHosts.includes(host) &&
          host !== EVAL_LINK_READER_HOST &&
          !MODEL_PROVIDERS.has(host) &&
          !(host in notFetchedByAnEvalBrain),
      )
      .map(([host, file]) => `${host} (${file})`);
    expect(unanswered).toEqual([]);
  });

  it("keeps a page for every link an eval case saves", () => {
    const urls = savedLinkUrls();
    expect(urls.length).toBeGreaterThan(0);
    const missing = urls.filter(({ url }) => {
      const page = new URL(url);
      return (
        !page.hostname.endsWith(".invalid") && !existsSync(evalPagePath(page))
      );
    });
    expect(missing).toEqual([]);
  });
});

describe("the provider suites with every external host refused", () => {
  async function install(plugin: Plugin): Promise<{ tools: Tool[] }> {
    const harness = createPluginHarness<Plugin>({});
    return harness.installPlugin(plugin);
  }

  it("answers stock-photo_search as Unsplash answers the suite's placeholder key", async () => {
    refused.length = 0;
    const capabilities = await install(
      stockPhotoWith({ apiKey: "eval-placeholder-stock-photo-key" }),
    );
    const result: ToolResponse = await toolOf(
      capabilities,
      "stock-photo_search",
    ).handler({ query: "wind farm at sunset" }, admin);
    expect(result).toMatchObject({ success: false });
    expect(JSON.stringify(result)).not.toContain("images.unsplash.com");
    expect(refused).toEqual([]);
  });

  it("answers newsletter_subscribers as Buttondown answers the suite's placeholder key", async () => {
    refused.length = 0;
    const capabilities = await install(
      new ButtondownPlugin(
        { apiKey: "eval-placeholder-buttondown-key" },
        { fetch: network },
      ),
    );
    const result: ToolResponse = await toolOf(
      capabilities,
      "newsletter_subscribers",
    ).handler({ action: "list" }, admin);
    expect(result).toMatchObject({ success: false });
    expect(refused).toEqual([]);
  });

  it("reads every saved link's page from the eval's pages", async () => {
    refused.length = 0;
    for (const { url } of savedLinkUrls()) {
      const response = await network(`https://${EVAL_LINK_READER_HOST}/${url}`);
      expect({ url, status: response.status }).toEqual({
        url,
        status: new URL(url).hostname.endsWith(".invalid") ? 400 : 200,
      });
    }
    expect(refused).toEqual([]);
  });
});
