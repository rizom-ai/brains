import { afterEach, describe, expect, test } from "bun:test";
import { parseInstanceOverrides, resolve } from "@brains/app";
import { createServicePluginContext } from "@brains/plugins";
import {
  baseEntitySchema,
  createMockShell,
  createTestEntityAdapter,
} from "@brains/plugins/test";
import siteInfoPackage, { fetchSiteInfo } from "@brains/site-info";
import { blogPostAdapter, blogPostSchema } from "@brains/blog";
import decksPackage, { siteThemeMode } from "@brains/decks";
import { HomepageListDataSource } from "@brains/site-professional";
import { HomepageDataSource } from "@brains/site-personal";
import { siteMetadataContract } from "@brains/site-composition";
import { generateMarkdownWithFrontmatter } from "@brains/entity-service";
import { z } from "@brains/utils/zod";
import { canonicalBrain } from "../src/model/canonical-brain";
import {
  declaredEntityStore,
  type DeclaredEntityStore,
} from "./helpers/declared-entity-store";

/**
 * The declared site-info on the brain's own entity store, composed as the
 * canonical brain composes it: the default record it writes, a record the
 * class wrote read once its metadata is reconciled, the data source site
 * layouts read, and its config under the `site-info` key a brain sets it by.
 */

const stores: DeclaredEntityStore[] = [];
afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
});

async function store(
  packageConfig: unknown = {},
): Promise<DeclaredEntityStore> {
  const opened = await declaredEntityStore(
    siteInfoPackage,
    "@brains/site-info",
    "site-metadata",
    {
      classification: "system",
      embeddable: false,
      projectionSource: false,
      projectionSourceRole: "excluded",
    },
    [],
    packageConfig,
  );
  stores.push(opened);
  return opened;
}

async function askSiteMetadata(opened: DeclaredEntityStore): Promise<unknown> {
  return createServicePluginContext(
    opened.shell,
    "site-builder",
  ).messaging.request(siteMetadataContract, {});
}

describe("the declared site-info on the entity store", () => {
  test("writes the default record the class wrote, byte for byte", async () => {
    const opened = await store({ siteInfo: { title: "Configured" } });

    await opened.completeInitialSync({ success: true });

    // The class wrote createSiteInfoContent({ represents: "anchor", ...defaults }).
    expect((await opened.stored("site-info", "site-info"))?.content).toBe(
      generateMarkdownWithFrontmatter("", {
        represents: "anchor",
        title: "Configured",
      }),
    );
    expect(await askSiteMetadata(opened)).toMatchObject({
      status: "answered",
      data: { represents: "anchor", title: "Configured" },
    });
  });

  test("reads a record the class wrote once its metadata is reconciled", async () => {
    const opened = await store();
    await opened.completeInitialSync({ success: true });
    await opened.rewrite(
      "site-info",
      "site-info",
      "---\nrepresents: brain\ndescription: Class-written\n---\n",
      "{}",
    );

    await opened.service.reconcileDeclaredMetadata();

    expect(await askSiteMetadata(opened)).toMatchObject({
      status: "answered",
      data: {
        represents: "brain",
        description: "Class-written",
        title: "Test Brain",
      },
    });
    const fetched = await opened.fetchData(
      "site-info:entities",
      {},
      z.record(z.string(), z.unknown()),
      { entityService: opened.service },
    );
    expect(fetched).toMatchObject({
      represents: "brain",
      description: "Class-written",
      title: "Brain",
      copyright: "Powered by Rizom",
    });
  });
});

describe("site-info's config in a brain", () => {
  test("applies under the site-info key, as the class's did", async () => {
    const {
      brain: _brain,
      site: _site,
      ...overrides
    } = parseInstanceOverrides(
      [
        "brain: brain",
        "bundleContract: capability-bundles-v1",
        "anchor: person",
        "bundles:",
        "  - site",
        "plugins:",
        "  site-info:",
        "    siteInfo:",
        "      title: From brain.yaml",
      ].join("\n"),
    );
    const plugins = (
      resolve(canonicalBrain, {}, overrides).plugins ?? []
    ).filter(({ packageName }) => packageName === "@brains/site-info");
    expect(plugins.map(({ id }) => id)).toEqual(["site-info", "site-metadata"]);

    const shell = createMockShell();
    for (const plugin of plugins) await plugin.register(shell);
    expect(
      await createServicePluginContext(shell, "site-builder").messaging.request(
        siteMetadataContract,
        {},
      ),
    ).toMatchObject({
      status: "answered",
      data: { represents: "anchor", title: "From brain.yaml" },
    });
  });
});

describe("site-info's readers on the entity store", () => {
  const siteInfoMarkdown = [
    "---",
    "title: Alex Chen",
    "description: Systems notes",
    "themeMode: light",
    "cta:",
    "  heading: Get in touch",
    "  buttonText: Say hello",
    "  buttonLink: mailto:alex@example.com",
    "---",
    "",
  ].join("\n");

  /**
   * The declared site-info beside the types the homepages read, registered
   * as the shell (the anchor profile) and the blog plugin register them, and
   * the declared decks, with a site-info imported as directory sync imports one.
   */
  async function homepageStore(): Promise<DeclaredEntityStore> {
    const opened = await declaredEntityStore(
      siteInfoPackage,
      "@brains/site-info",
      "site-metadata",
      { classification: "system", embeddable: false },
      // The decks, declared, as the canonical brain installs them.
      [decksPackage],
      {},
      (registry) => {
        registry.registerEntityType(
          "anchor-profile",
          baseEntitySchema,
          createTestEntityAdapter("anchor-profile", { isSingleton: true }),
        );
        registry.registerEntityType("post", blogPostSchema, blogPostAdapter);
      },
    );
    stores.push(opened);
    await opened.service.createEntityFromMarkdown({
      input: {
        entityType: "site-info",
        id: "site-info",
        markdown: siteInfoMarkdown,
      },
    });
    await opened.service.createEntityFromMarkdown({
      input: {
        entityType: "anchor-profile",
        id: "anchor-profile",
        markdown: "---\nname: Alex Chen\n---\n",
      },
    });
    return opened;
  }

  const cta = {
    heading: "Get in touch",
    buttonText: "Say hello",
    buttonLink: "mailto:alex@example.com",
  };

  test("fetchSiteInfo reads a declared site-info's fields", async () => {
    const { service } = await homepageStore();

    expect(await fetchSiteInfo(service)).toMatchObject({
      title: "Alex Chen",
      description: "Systems notes",
      themeMode: "light",
      cta,
    });
  });

  test("the professional homepage reads its call to action", async () => {
    const { service } = await homepageStore();

    const data = await new HomepageListDataSource("/posts", "/decks").fetch(
      {},
      z.record(z.string(), z.unknown()),
      { entityService: service },
    );
    expect(data["cta"]).toEqual(cta);
  });

  test("the personal homepage reads its call to action", async () => {
    const { service } = await homepageStore();

    const data = await new HomepageDataSource("/posts").fetch(
      {},
      z.record(z.string(), z.unknown()),
      { entityService: service },
    );
    expect(data["cta"]).toEqual(cta);
  });

  test("decks' carousel reads the site's theme, not its fallback", async () => {
    const { service } = await homepageStore();

    expect(await siteThemeMode(service)).toBe("light");
  });
});
