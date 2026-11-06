import { describe, expect, it } from "bun:test";
import {
  publishAssetRegisterContract,
  publishRegisterContract,
  type PublishProvider,
} from "@brains/contracts";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import { SYSTEM_CHANNELS } from "../src/system-channels";
import {
  defineEntity,
  defineEntityPackage,
  instantiatePluginPackageDefinition,
  type AnyEntityDefinition,
  type EntityAttachmentDeclaration,
} from "../src";

type Harness = ReturnType<typeof createPluginHarness>;

const postMetadata = z.object({
  title: z.string(),
  status: z.enum(["draft", "published"]).default("draft"),
  sharedAt: z.string().optional(),
  postId: z.string().optional(),
});

const provider: PublishProvider = {
  name: "reader-feed",
  publish: async () => ({ id: "remote-1" }),
};

const ogCard: EntityAttachmentDeclaration = {
  type: "og-card",
  provider: () => ({
    metadata: { outputEntityType: "image" },
    resolve: async (): Promise<undefined> => undefined,
  }),
};

async function install(
  entities: readonly AnyEntityDefinition[],
): Promise<Harness> {
  const plugins = instantiatePluginPackageDefinition(
    defineEntityPackage({ id: "posts", entities }),
    {},
    { name: "@fixture/posts", version: "0.1.0" },
  );
  const harness = createPluginHarness({
    logger: createSilentLogger("entity-publishing"),
  });
  for (const plugin of plugins) await harness.installPlugin(plugin);
  return harness;
}

function listen(harness: Harness, channel: string): unknown[] {
  const heard: unknown[] = [];
  harness
    .getMockShell()
    .getMessageBus()
    .subscribe(channel, async (message) => {
      heard.push(message.payload);
      return { success: true };
    });
  return heard;
}

describe("declared publishing", () => {
  it("hands the publish pipeline the type's provider once plugins are registered", async () => {
    const harness = await install([
      defineEntity({
        type: "post",
        purpose: "A post published to the reader's feed.",
        metadata: postMetadata,
        publish: {
          provider,
          resultIdField: "postId",
          timestampField: "sharedAt",
        },
      }),
    ]);
    try {
      const heard = listen(harness, publishRegisterContract.name);
      expect(heard).toEqual([]);

      await harness.sendMessage(SYSTEM_CHANNELS.pluginsRegistered, {});
      expect(heard).toEqual([
        {
          entityType: "post",
          provider,
          config: {
            executionMode: "provider",
            publishResultIdField: "postId",
            publishTimestampField: "sharedAt",
          },
        },
      ]);
      const [registration] = heard;
      expect(
        registration &&
          typeof registration === "object" &&
          "provider" in registration
          ? registration.provider
          : undefined,
      ).toBe(provider);
    } finally {
      await harness.reset();
    }
  });

  it("declares the images the pipeline renders before a record goes out", async () => {
    const harness = await install([
      defineEntity({
        type: "post",
        purpose: "A post with a social card.",
        metadata: postMetadata,
        coverImage: true,
        attachments: [ogCard],
        publishAssets: [
          {
            attachmentType: "og-card",
            field: "ogImageId",
            requiredWhen: { status: "published" },
          },
          { attachmentType: "og-card", field: "coverImageId" },
        ],
      }),
    ]);
    try {
      const heard = listen(harness, publishAssetRegisterContract.name);
      await harness.sendMessage(SYSTEM_CHANNELS.pluginsRegistered, {});
      expect(heard).toEqual([
        {
          entityType: "post",
          attachmentType: "og-card",
          mediaEntityType: "image",
          targetEntityField: { location: "frontmatter", field: "ogImageId" },
          requiredWhen: { status: "published" },
          autoGenerate: true,
        },
        {
          entityType: "post",
          attachmentType: "og-card",
          mediaEntityType: "image",
          targetEntityField: { location: "frontmatter", field: "coverImageId" },
          autoGenerate: true,
        },
      ]);
    } finally {
      await harness.reset();
    }
  });

  it("announces nothing for a type that does not publish", async () => {
    const harness = await install([
      defineEntity({
        type: "note",
        purpose: "A private note.",
        metadata: z.object({ title: z.string() }),
      }),
    ]);
    try {
      const registered = listen(harness, publishRegisterContract.name);
      const assets = listen(harness, publishAssetRegisterContract.name);
      await harness.sendMessage(SYSTEM_CHANNELS.pluginsRegistered, {});
      expect([registered, assets]).toEqual([[], []]);
    } finally {
      await harness.reset();
    }
  });

  it("refuses an asset rendered from an attachment the type does not declare", () => {
    expect(() =>
      defineEntity({
        type: "post",
        purpose: "Names a missing attachment.",
        metadata: postMetadata,
        publishAssets: [{ attachmentType: "og-card", field: "ogImageId" }],
      }),
    ).toThrow(
      'publish asset renders from "og-card", which post does not attach',
    );
  });

  it("refuses a cover asset on a type without a cover image", () => {
    expect(() =>
      defineEntity({
        type: "post",
        purpose: "Has no cover.",
        metadata: postMetadata,
        attachments: [ogCard],
        publishAssets: [{ attachmentType: "og-card", field: "coverImageId" }],
      }),
    ).toThrow("post records a cover image but does not declare coverImage");
  });
});
