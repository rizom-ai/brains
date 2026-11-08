import { describe, expect, it } from "bun:test";
import { createServicePluginContext } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { computeContentHash } from "@brains/utils/hash";
import {
  profileImportApplyContract,
  profileImportPreviewContract,
  type ProfileImportFields,
} from "../src";
import { installProfile } from "./profile-plugin";

/**
 * Profile stewards the anchor profile: another package fills it by asking,
 * and profile decides by who asked. A class plugin asks as its plugin id, so
 * linkedin-import's requests carry the sender "linkedin-import".
 */

const ownerProfile =
  "---\nname: Ada M.\nemail: ada@example.com\n---\n\nMy own story.\n";

const imported: ProfileImportFields = {
  name: "Ada Morgan",
  headline: "Advisor on resilient software",
  story: "I build resilient software.",
};

type Harness = ReturnType<typeof createPluginHarness>;

async function steward(
  config: Parameters<typeof installProfile>[1] = {},
): Promise<Harness> {
  const harness = createPluginHarness();
  await installProfile(harness, {
    starterIdentity: { enabled: false },
    ...config,
  });
  return harness;
}

function setProfile(harness: Harness, content: string): void {
  harness.getMockShell().addEntities([
    {
      id: "anchor-profile",
      entityType: "anchor-profile",
      content,
      metadata: {},
      contentHash: computeContentHash(content),
      visibility: "public",
      created: "2026-11-01T00:00:00.000Z",
      updated: "2026-11-01T00:00:00.000Z",
    },
  ]);
}

async function profile(harness: Harness): Promise<string | undefined> {
  return (
    await harness.getEntityService().getEntity({
      entityType: "anchor-profile",
      id: "anchor-profile",
      visibilityScope: "restricted",
    })
  )?.content;
}

function asker(
  harness: Harness,
  sender = "linkedin-import",
): ReturnType<typeof createServicePluginContext>["messaging"] {
  return createServicePluginContext(harness.getMockShell(), sender).messaging;
}

describe("profile as the anchor profile's steward", () => {
  it("previews what an import would fill and keep, writing nothing", async () => {
    const harness = await steward();
    setProfile(harness, ownerProfile);

    const asked = await asker(harness).request(profileImportPreviewContract, {
      fields: imported,
    });

    expect(asked.status).toBe("answered");
    if (asked.status !== "answered") throw new Error("Not answered");
    expect(asked.data.changed).toBe(true);
    expect(
      asked.data.fields.map(({ field, outcome }) => [field, outcome]),
    ).toEqual([
      ["name", "preserve"],
      ["headline", "fill"],
      ["story", "preserve"],
    ]);
    expect(asked.data.revision).toMatch(/^[0-9a-f]{64}$/);
    expect(await profile(harness)).toBe(ownerProfile);
  });

  it("fills an import it previewed, keeping what the owner wrote", async () => {
    const harness = await steward();
    setProfile(harness, ownerProfile);
    const messaging = asker(harness);
    const preview = await messaging.request(profileImportPreviewContract, {
      fields: imported,
    });
    if (preview.status !== "answered") throw new Error("Not previewed");

    expect(
      await messaging.request(profileImportApplyContract, {
        fields: imported,
        revision: preview.data.revision,
      }),
    ).toEqual({
      status: "answered",
      data: { filled: ["headline"], kept: ["name", "story"] },
    });
    const content = (await profile(harness)) ?? "";
    expect(content).toContain("name: Ada M.");
    expect(content).toContain("headline: Advisor on resilient software");
    expect(content).toContain("My own story.");
  });

  it("refuses an import once the profile changed after its preview", async () => {
    const harness = await steward();
    setProfile(harness, ownerProfile);
    const messaging = asker(harness);
    const preview = await messaging.request(profileImportPreviewContract, {
      fields: imported,
    });
    if (preview.status !== "answered") throw new Error("Not previewed");
    const edited = "---\nname: Ada Morgan\n---\n\nEdited meanwhile.\n";
    setProfile(harness, edited);

    expect(
      await messaging.request(profileImportApplyContract, {
        fields: imported,
        revision: preview.data.revision,
      }),
    ).toEqual({
      status: "failed",
      error: {
        code: "conflict",
        message:
          "The profile changed while importing; review the import again.",
      },
    });
    expect(await profile(harness)).toBe(edited);
  });

  it("refuses a package the brain does not let import", async () => {
    const harness = await steward();
    setProfile(harness, ownerProfile);

    expect(
      await asker(harness, "notes").request(profileImportPreviewContract, {
        fields: imported,
      }),
    ).toEqual({
      status: "failed",
      error: {
        code: "permission_denied",
        message: "notes may not fill the anchor profile",
      },
    });
    expect(
      await asker(harness, "notes").request(profileImportApplyContract, {
        fields: imported,
        revision: "anything",
      }),
    ).toMatchObject({
      status: "failed",
      error: { code: "permission_denied" },
    });
    expect(await profile(harness)).toBe(ownerProfile);
  });

  it("admits the importers the brain names", async () => {
    const harness = await steward({ importers: ["@acme/importer:importer"] });
    setProfile(harness, ownerProfile);

    expect(
      (
        await asker(harness, "@acme/importer:importer").request(
          profileImportPreviewContract,
          { fields: imported },
        )
      ).status,
    ).toBe("answered");
    expect(
      (
        await asker(harness).request(profileImportPreviewContract, {
          fields: imported,
        })
      ).status,
    ).toBe("failed");
  });

  it("says when the brain has no anchor profile yet", async () => {
    const harness = await steward();

    expect(
      await asker(harness).request(profileImportPreviewContract, {
        fields: imported,
      }),
    ).toEqual({
      status: "failed",
      error: {
        code: "not_found",
        message: "This brain has no anchor profile yet.",
      },
    });
  });
});
