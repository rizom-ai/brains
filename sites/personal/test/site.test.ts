import { describe, expect, it } from "bun:test";
import { createPluginHarness, installSiteRuntime } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import site from "../src";

type Harness = ReturnType<typeof createPluginHarness>;

function installed(settings?: Readonly<Record<string, unknown>>): Harness {
  const harness = createPluginHarness({ logger: createSilentLogger() });
  installSiteRuntime(harness, site, {
    packageName: "@brains/site-personal",
    ...(settings ? { settings } : {}),
  });
  return harness;
}

/** A profile and site info, and no posts. */
function seed(harness: Harness): void {
  harness.addEntities([
    {
      id: "anchor-profile",
      entityType: "anchor-profile",
      content: "---\nname: Ada Morgan\n---\n",
      metadata: {},
    },
    {
      id: "site-info",
      entityType: "site-info",
      content:
        "---\ntitle: Ada\ndescription: Notes\ncta:\n  heading: Say hi\n  buttonText: Write\n  buttonLink: /contact\n---\n",
      metadata: {},
    },
  ]);
}

const homepage = z.object({
  profile: z.object({ name: z.string() }),
  posts: z.array(z.unknown()),
  postsListUrl: z.string(),
  cta: z.object({ heading: z.string() }),
});

async function fetchHomepage(
  harness: Harness,
): Promise<z.output<typeof homepage> | undefined> {
  seed(harness);
  const source = harness.getDataSources().get("personal-site:homepage");
  return source?.fetch?.({}, homepage, {
    entityService: harness.getEntityService(),
  });
}

describe("personal site", () => {
  it("draws its homepage and about page from its own data sources", () => {
    const harness = installed();
    const templates = harness.getTemplates();
    expect(templates.get("personal-site:homepage")?.dataSourceId).toBe(
      "personal-site:homepage",
    );
    expect(templates.get("personal-site:about")?.dataSourceId).toBe(
      "personal-site:about",
    );
    for (const name of ["personal-site:homepage", "personal-site:about"]) {
      expect(templates.get(name)?.requiredPermission).toBe("public");
    }
    const sources = harness.getDataSources();
    expect(sources.get("personal-site:homepage")?.publicId).toBe(
      "@brains/site-personal:homepage",
    );
    expect(sources.get("personal-site:about")?.publicId).toBe(
      "@brains/site-personal:about",
    );
  });

  it("links the homepage's posts to the list the site names", async () => {
    expect(await fetchHomepage(installed())).toEqual({
      profile: { name: "Ada Morgan" },
      posts: [],
      postsListUrl: "/posts",
      cta: { heading: "Say hi" },
    });
    expect(
      (
        await fetchHomepage(
          installed({
            entityDisplay: { post: { label: "Essay", pluralName: "essays" } },
          }),
        )
      )?.postsListUrl,
    ).toBe("/essays");
  });
});
