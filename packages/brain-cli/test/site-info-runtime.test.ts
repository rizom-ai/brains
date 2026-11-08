import { afterEach, describe, expect, test } from "bun:test";
import { parseInstanceOverrides, resolve } from "@brains/app";
import { createServicePluginContext } from "@brains/plugins";
import { createMockShell } from "@brains/plugins/test";
import siteInfoPackage from "@brains/site-info";
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
