import { describe, expect, it } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import {
  defineEntity,
  defineEntityPackage,
  instantiatePluginPackageDefinition,
  withUrlRoute,
  type AnyEntityDefinition,
  type CreateInput,
} from "../src";

/**
 * A first-party type created from a URL alone, as system_create hands a
 * `source: { kind: "url" }` request on, and as the link plugin class's
 * interceptor captured it: the route the type carries for a URL decides.
 * A URL beside content or a prompt goes the way content or a prompt goes.
 */

const metadata = z.object({ title: z.string() });

const bookmark = withUrlRoute(
  defineEntity({
    type: "bookmark",
    purpose: "A page saved from its URL.",
    metadata,
    create: {
      fromContent: {
        resolve: async () => ({ refuse: "from content" }),
      },
    },
  }),
  {
    resolve: async ({ input }) => ({ refuse: `from url ${input.url ?? ""}` }),
  },
);
const memo = defineEntity({
  type: "memo",
  purpose: "A memo.",
  metadata,
  create: {
    fromContent: { resolve: async () => ({ refuse: "from content" }) },
  },
});
// A type whose only route is for a URL.
const page = withUrlRoute(
  defineEntity({ type: "page", purpose: "A page.", metadata }),
  { resolve: async () => ({ refuse: "page from url" }) },
);

async function create(
  definition: AnyEntityDefinition,
  input: Partial<CreateInput>,
): Promise<unknown> {
  const harness = createPluginHarness({
    logger: createSilentLogger("url-route"),
  });
  for (const plugin of instantiatePluginPackageDefinition(
    defineEntityPackage({ id: "saved", entities: [definition] }),
    {},
    { name: "@fixture/saved", version: "0.1.0" },
  )) {
    await harness.installPlugin(plugin);
  }
  try {
    const interceptor = harness
      .getEntityRegistry()
      .getCreateInterceptor(definition.type);
    if (!interceptor) return "no interceptor";
    return await interceptor(
      { entityType: definition.type, ...input },
      {
        interfaceType: "cli",
        actor: { kind: "user", userId: "tester" },
        userPermissionLevel: "admin",
      },
    );
  } finally {
    await harness.reset();
  }
}

describe("a create from a URL alone", () => {
  it("goes to the route the type carries for a URL", async () => {
    expect(await create(bookmark, { url: "https://example.com" })).toEqual({
      kind: "handled",
      result: { success: false, error: "from url https://example.com" },
    });
  });

  it("goes the way content goes when content comes with it", async () => {
    expect(
      await create(bookmark, { url: "https://example.com", content: "Text" }),
    ).toMatchObject({ result: { error: "from content" } });
  });

  it("goes on to the ordinary create for a type without a URL route", async () => {
    expect(await create(memo, { url: "https://example.com" })).toEqual({
      kind: "continue",
      input: { entityType: "memo", url: "https://example.com" },
    });
  });

  it("reaches a type whose only route is for a URL", async () => {
    expect(await create(page, { url: "https://example.com" })).toMatchObject({
      result: { error: "page from url" },
    });
  });
});
